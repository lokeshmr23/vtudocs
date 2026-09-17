/* VTU Docs — SPA. No framework, no CDN: state, router, views, optimistic UI. */
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; };

const app = $("#app");
let TOKEN = localStorage.getItem("vtudocs.token") || "";
let ME = null;
let COURSES = [];
const S = {   // list state per scope
  browse:     { q: "", type: "", course: "", sort: "recent", page: 1, items: null, total: 0, loading: false },
  favorites:  { q: "", type: "", course: "", sort: "recent", page: 1, items: null, total: 0, loading: false },
  my:         { q: "", type: "", course: "", sort: "recent", page: 1, items: null, total: 0, loading: false },
};
const D = {};  // dashboard cache

/* ---------------------------------------------------------------- utils */
const fmtSize = (b) => b >= 1048576 ? (b / 1048576).toFixed(1) + " MB"
  : b >= 1024 ? Math.round(b / 1024) + " KB" : b + " B";
const fmtN = (n) => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString("en-IN",
  { day: "numeric", month: "short", year: "numeric" });
const ago = (ts) => { const d = (Date.now() / 1000 - ts) / 86400;
  return d < 1 ? "today" : d < 2 ? "yesterday" : d < 30 ? Math.round(d) + " days ago"
       : d < 60 ? "last month" : Math.round(d / 30) + " months ago"; };
const TYPE_LABEL = { book: "Course book", slides: "Slides", notes: "Notes", archive: "Archive" };
const TYPE_ICON = { book: "i-book", slides: "i-chart", notes: "i-docs", archive: "i-folder" };
const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };

async function api(path, opts = {}) {
  const o = { headers: {}, ...opts };
  if (TOKEN) o.headers["Authorization"] = "Bearer " + TOKEN;
  if (o.body && typeof o.body !== "string") { o.body = JSON.stringify(o.body);
    o.headers["Content-Type"] = "application/json"; }
  const r = await fetch(path, o);
  if (r.status === 401 && TOKEN) { logout(true); throw new Error("Session expired — sign in again"); }
  if (!r.ok) { let msg = "Request failed"; try { msg = (await r.json()).detail || msg; } catch {}
    throw new Error(typeof msg === "string" ? msg : "Request failed"); }
  return r.status === 204 ? null : r.json();
}

function toast(msg, { kind = "", action, onAction, ms = 4200 } = {}) {
  const t = el(`<div class="toast ${kind}"><span>${esc(msg)}</span></div>`);
  if (action) {
    const b = el(`<button class="act">${esc(action)}</button>`);
    b.onclick = () => { dismiss(); onAction && onAction(); };
    t.appendChild(b);
  }
  $("#toast-root").appendChild(t);
  const dismiss = () => { t.classList.add("out"); setTimeout(() => t.remove(), 200); };
  setTimeout(dismiss, action ? Math.max(ms, 6000) : ms);
  return t;
}

function overlay(inner, wide = false) {
  const ov = el(`<div class="ov"><div class="card modal" ${wide ? 'style="width:min(900px,100%)"' : ""}></div></div>`);
  const m = ov.firstChild; m.innerHTML = inner;
  const close = () => ov.remove();
  ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
  document.addEventListener("keydown", function h(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", h); } });
  $("#modal-root").appendChild(ov);
  return { ov, m, close };
}

/* ---------------------------------------------------------------- auth */
function renderAuth(mode = "login") {
  ME = null;
  app.innerHTML = "";
  const demoChips = [["aarathi.r@vtustudents.edu", "Student · ISE"],
                     ["lokesh@ajiet.edu.in", "Teacher · ISE"]]
    .map(([e, lab]) => `<button type="button" data-em="${esc(e)}">${esc(lab)} — ${esc(e)}</button>`).join("");
  const view = el(`
  <div class="auth">
    <div class="art">
      <h2>The course library,<br>kept honest.</h2>
      <p>Books, slide decks and lab resources for the 2025-scheme VTU batches — uploaded
         by your own department, versioned, searchable, downloadable offline-first.</p>
      <div class="quote">“A number you can only get from a report is a number you don't
         own.” — the capture discipline these volumes are built on.</div>
    </div>
    <div class="pane"><div class="box">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
        <div class="brand" style="padding:0"><span class="logo">V</span>
        <span><b>VTU Docs</b><small>AJIET · ISE department</small></span></div>
      </div>
      <div class="tabs">
        <button id="tab-in" class="${mode === "login" ? "on" : ""}">Sign in</button>
        <button id="tab-up" class="${mode === "register" ? "on" : ""}">Create account</button>
      </div>
      <form id="auth-form" novalidate>
        <div class="f hidden" id="f-name"><label>Full name</label>
          <input class="inp" name="name" placeholder="e.g. Aarathi R"><div class="err"></div></div>
        <div class="f"><label>Email</label>
          <input class="inp" name="email" type="email" placeholder="you@vtustudents.edu"><div class="err"></div></div>
        <div class="f"><label>Password ${mode === "register" ? '<span style="font-weight:400">(8+ characters)</span>' : ""}</label>
          <input class="inp" name="password" type="password" placeholder="••••••••"><div class="err"></div></div>
        <div class="f hidden" id="f-role"><label>I am a…</label>
          <select class="inp" name="role"><option value="student">Student</option><option value="teacher">Teacher</option></select></div>
        <button class="btn primary" style="width:100%;margin-top:4px" id="auth-go">
          ${mode === "login" ? "Sign in" : "Create account"}</button>
      </form>
      <div class="hint">Demo accounts — password <code style="font-family:var(--mono)">vtu12345</code></div>
      <div class="demo">${demoChips}</div>
    </div></div>
  </div>`);
  app.appendChild(view);
  let m = mode;
  const setMode = (nm) => { m = nm; $("#tab-in").classList.toggle("on", nm === "login");
    $("#tab-up").classList.toggle("on", nm === "register");
    $("#f-name").classList.toggle("hidden", nm === "login");
    $("#f-role").classList.toggle("hidden", nm === "login");
    $("#auth-go").textContent = nm === "login" ? "Sign in" : "Create account"; };
  $("#tab-in", view).onclick = () => setMode("login");
  $("#tab-up", view).onclick = () => setMode("register");
  $$(".demo button", view).forEach((b) => b.onclick = () => {
    setMode("login"); $("input[name=email]", view).value = b.dataset.em;
    $("input[name=password]", view).value = "vtu12345"; $("#auth-form", view).requestSubmit(); });
  $("#auth-form", view).onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target, go = $("#auth-go", view);
    $$(".f", f).forEach((x) => x.classList.remove("bad"));
    const data = Object.fromEntries(new FormData(f).entries());
    const fail = (n, msg) => { const w = $(`[name=${n}]`, f).closest(".f"); w.classList.add("bad"); $(".err", w).textContent = msg; };
    if (m === "register" && (data.name || "").trim().length < 2) fail("name", "Tell us your name (2+ characters)");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email || "")) fail("email", "Enter a valid email address");
    if ((data.password || "").length < 8) fail("password", "At least 8 characters");
    if ($(".f.bad", f)) return;
    go.disabled = true; const old = go.textContent; go.innerHTML = `<span class="spin"></span> ${m === "login" ? "Signing in…" : "Creating…"}`;
    try {
      const r = await api("/api/" + (m === "login" ? "login" : "register"), { method: "POST", body: data });
      TOKEN = r.token; localStorage.setItem("vtudocs.token", TOKEN); ME = r.user;
      toast(`Welcome${m === "login" ? " back" : ""}, ${esc(r.user.name.split(" ")[0])}!`, { kind: "ok" });
      bootIntoApp();
    } catch (e) {
      toast(e.message, { kind: "bad" });
      if (/email|password/i.test(e.message) && m === "login") fail("password", e.message);
    } finally { go.disabled = false; go.textContent = old; }
  };
}

function logout(silent) {
  TOKEN = ""; localStorage.removeItem("vtudocs.token");
  Object.values(S).forEach((s) => { s.items = null; });
  if (!silent) toast("Signed out");
  location.hash = "#/";
  renderAuth("login");
}

/* ---------------------------------------------------------------- shell */
async function bootIntoApp() {
  try { COURSES = (await api("/api/courses")).items; } catch (e) { toast(e.message, { kind: "bad" }); }
  renderShell(); route(); refreshMe();
}

function navCount(scope) {
  if (scope === "my") return S.my.total || (ME && "0"); if (scope === "favorites") return S.favorites.total || "";
  return "";
}

function renderShell() {
  app.innerHTML = `
  <div class="shell">
    <aside class="side" id="side">
      <div class="brand"><span class="logo">V</span>
        <span><b>VTU Docs</b><small>AJIET · ISE · 2025 scheme</small></span></div>
      <nav class="s-nav" id="snav"></nav>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="hamb" id="hamb" aria-label="Menu"><svg class="ic"><use href="#i-menu"/></svg></button>
        <h1 id="view-title">Library</h1><div class="sp"></div>
        <button class="btn primary" id="quick-up"><svg class="ic" style="width:16px;height:16px"><use href="#i-up"/></svg>
          Upload</button>
      </header>
      <div class="wrap" id="view"></div>
    </div>
  </div>`;
  $("#hamb").onclick = () => $("#side").classList.toggle("open");
  $("#quick-up").onclick = () => openUpload();
  drawNav();
}

function drawNav() {
  const n = $("#snav"); if (!n) return;
  const cur = location.hash.replace(/^#\//, "") || "dashboard";
  const item = (id, ico, label, cnt, href) =>
    `<button class="nav-item ${cur === id ? "on" : ""}" data-go="${href || id}">
       <svg class="ic"><use href="#${ico}"/></svg><span>${label}</span>
       ${cnt !== "" && cnt != null ? `<span class="cnt">${cnt}</span>` : ""}</button>`;
  n.innerHTML =
    item("dashboard", "i-grid", "Dashboard") +
    item("browse", "i-search", "Browse library", D.totals ? fmtN(D.totals.documents) : "") +
    item("my", "i-docs", "My uploads", S.my.total || "") +
    item("favorites", "i-star", "Favorites", S.favorites.total || "") +
    `<div class="s-cap">Upload &amp; discover</div>` +
    `<button class="nav-item" data-up><svg class="ic"><use href="#i-plus"/></svg><span>New upload</span></button>` +
    `<div class="s-cap">Courses</div>` +
    COURSES.map((c) => item("course-" + c.id, "i-folder", esc(c.code), c.n, "browse?course=" + c.id)).join("") +
    `<button class="nav-item" data-course-add><svg class="ic"><use href="#i-plus"/></svg><span>New course…</span></button>` +
    `<div class="s-user" style="margin-top:14px">
       <span class="avatar" style="background:${esc(ME.avatar || "#6366f1")}">${esc(ME.name.split(" ").map((w) => w[0]).slice(0, 2).join(""))}</span>
       <span style="min-width:0"><b style="color:#fff;font-size:12.6px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ME.name)}</b>
       <small style="color:#8a93b2;font-size:10.5px">${esc(ME.role)}${ME.semester ? " · " + esc(ME.semester) : ""}</small></span>
       <button class="out" title="Sign out" id="out-btn"><svg class="ic"><use href="#i-logout"/></svg></button>
     </div>`;
  $$("[data-go]", n).forEach((b) => b.onclick = () => { location.hash = "#/" + b.dataset.go; $("#side").classList.remove("open"); });
  $("[data-up]", n).onclick = () => openUpload();
  $("[data-course-add]", n).onclick = openCourse;
  $("#out-btn", n).onclick = () => logout();
}

async function refreshMe() {
  try { const r = await api("/api/me/stats");
    if (r.mine != null) { S.my.total = r.mine; }
    drawNav();
  } catch {}
}

/* ---------------------------------------------------------------- routing */
function route() {
  if (!TOKEN) return renderAuth("login");
  if (!ME) { ME = null; api("/api/session").then((r) => { if (r.user) { ME = r.user; bootIntoApp(); } else logout(true); }); return; }
  const [pathRaw, query] = (location.hash.replace(/^#\//, "") || "dashboard").split("?");
  const q = Object.fromEntries(new URLSearchParams(query || ""));
  if (pathRaw.startsWith("doc/")) return renderDetail(parseInt(pathRaw.split("/")[1], 10));
  const [page] = [pathRaw];
  if (page === "browse") { if (q.course) S.browse.course = q.course; return renderList("browse"); }
  if (page === "my") return renderList("my");
  if (page === "favorites") return renderList("favorites");
  return renderDashboard();
}
window.addEventListener("hashchange", () => { if (TOKEN && ME) { route(); drawNav(); } });

/* ---------------------------------------------------------------- data */
async function load(scope) {
  const st = S[scope]; st.loading = true; paint(scope);
  const p = new URLSearchParams({ scope, page: String(st.page), sort: st.sort });
  if (st.q) p.set("q", st.q);
  if (st.type) p.set("type", st.type);
  if (st.course && scope === "browse") p.set("course", st.course);
  try {
    const r = await api("/api/documents?" + p);
    st.items = r.items; st.total = r.total; st.pages = r.pages; st.error = null;
  } catch (e) { st.items = []; st.error = e.message; }
  st.loading = false; paint(scope); drawNav();
}
const ensure = (scope) => { if (!S[scope].items && !S[scope].loading) load(scope); else paint(scope); };

function docCard(d, scope) {
  const t = el(`<article class="card doc" tabindex="0" role="button" aria-label="${esc(d.title)}">
    <div class="thumb ${d.has_thumb ? "" : "tt"} ${d.has_thumb ? "" : d.type}"
      ${d.has_thumb ? `style="background-image:url(/api/documents/${d.id}/thumb)"` : ""}>
      ${d.has_thumb ? "" : esc(TYPE_LABEL[d.type].split(" ")[0])}
    </div>
    <button class="fav ${d.is_fav ? "on" : ""}" title="${d.is_fav ? "Remove from" : "Add to"} favorites" aria-label="favorite">
      <svg><use href="#${d.is_fav ? "i-star-f" : "i-star"}"/></svg></button>
    <div class="pad">
      <h3>${esc(d.title)}</h3>
      <p>${esc(d.description || "No description yet.")}</p>
      <div class="meta">
        ${d.course ? `<span class="badge">${esc(d.course.code)}</span>` : `<span class="badge gray">Unclassified</span>`}
        <span class="m"><svg><use href="#i-down"/></svg>${fmtN(d.downloads)}</span>
        <span class="m"><svg><use href="#i-eye"/></svg>${fmtN(d.views)}</span>
        <span class="m">${fmtSize(d.size)}</span>
      </div>
    </div></article>`);
  const open = () => { location.hash = "#/doc/" + d.id; };
  t.onclick = (e) => { if (!e.target.closest(".fav")) open(); };
  t.onkeydown = (e) => { if (e.key === "Enter") open(); };
  $(".fav", t).onclick = (e) => { e.stopPropagation(); toggleFav(d, e.currentTarget, scope); };
  return t;
}

async function toggleFav(d, btn, scope) {
  const was = d.is_fav; d.is_fav = !was;                   // optimistic
  btn.classList.toggle("on", d.is_fav);
  const useIcon = btn.querySelector ? btn.querySelector("use") : null;
  if (useIcon) useIcon.setAttribute("href", d.is_fav ? "#i-star-f" : "#i-star");
  if (btn.id === "fav2") btn.textContent = d.is_fav ? "★ Starred" : "☆ Star";
  btn.title = (d.is_fav ? "Remove from" : "Add to") + " favorites";
  try {
    const r = await api(`/api/documents/${d.id}/favorite`, { method: "POST" });
    if (r.favorited !== d.is_fav) throw new Error("sync");
    if (scope === "favorites" && !r.favorited) removeFromCaches(d.id, false);
    S.favorites.total = Math.max(0, S.favorites.total + (r.favorited ? 1 : -1));
    drawNav();
  } catch (e) { d.is_fav = was; btn.classList.toggle("on", was);    // rollback
    if (useIcon) useIcon.setAttribute("href", was ? "#i-star-f" : "#i-star");
    if (btn.id === "fav2") btn.textContent = was ? "★ Starred" : "☆ Star";
    toast("Couldn't update favorites", { kind: "bad" }); }
}

function removeFromCaches(id, animate = true) {
  Object.entries(S).forEach(([sc, st]) => {
    if (!st.items) return;
    const i = st.items.findIndex((d) => d.id === id);
    if (i > -1) { st.items.splice(i, 1); st.total = Math.max(0, st.total - 1); paint(sc); }
  });
}

async function deleteDoc(d) {
  removeFromCaches(d.id); refreshMe();
  try {
    await api(`/api/documents/${d.id}`, { method: "DELETE" });
    toast(`Deleted “${d.title.length > 32 ? d.title.slice(0, 32) + "…" : d.title}”`, {
      action: "Undo", ms: 6500,
      onAction: async () => {
        try { await api(`/api/documents/${d.id}/restore`, { method: "POST" });
          Object.values(S).forEach((st) => { st.items = null; });
          toast("Restored", { kind: "ok" }); route(); refreshMe();
        } catch (e) { toast(e.message, { kind: "bad" }); }
      }});
  } catch (e) { Object.values(S).forEach((st) => { if (st.items) st.items.unshift(d); });
    toast(e.message, { kind: "bad" }); refreshMe(); }
}

async function downloadDoc(d) {
  const t = toast("Preparing download…", { ms: 60000 });
  try {
    const r = await fetch(`/api/documents/${d.id}/download`, { headers: { Authorization: "Bearer " + TOKEN } });
    if (!r.ok) throw new Error("Download failed (" + r.status + ")");
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = d.filename || d.title;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
    d.downloads += 1; t.querySelector("span").textContent = "Download started ✓";
    setTimeout(() => t.classList.add("out") || setTimeout(() => t.remove(), 200), 900);
  } catch (e) { t.remove(); toast(e.message, { kind: "bad" }); }
}

/* ---------------------------------------------------------------- list view */
function paint(scope) {
  const host = $("#list-body"); if (!host) return;
  const st = S[scope];
  if (st.loading && !st.items) {
    host.innerHTML = `<div class="grid">${"<div class='skel'><div class='sk-t'></div><div class='sk-l'></div><div class='sk-l s'></div></div>".repeat(8)}</div>`;
    $("#list-foot").innerHTML = ""; return;
  }
  if (st.error) { host.innerHTML = ""; $("#list-foot").innerHTML = "";
    host.appendChild(el(`<div class="card empty"><div class="eic"><svg><use href="#i-x"/></svg></div>
      <b>Could not load documents</b><p>${esc(st.error)}</p>
      <button class="btn ghost sm" onclick="">Retry</button></div>`));
    $(".btn", host).onclick = () => { st.items = null; load(scope); }; return; }
  const items = st.items || [];
  if (!items.length) {
    const filtered = st.q || st.type || (st.course && scope === "browse");
    const copy = scope === "my"
      ? ["Nothing uploaded yet", "Your uploads live here — add the deck you just made, or the manual you wish existed last semester."]
      : scope === "favorites"
      ? ["No starred documents yet", "Tap the star on any card and it waits for you here — one tap before the exam hall."]
      : filtered ? ["No match for these filters", "Loosen the search or clear the filters — the library has more than you think."]
      : ["The shelf is empty", "Upload the first document for this scope and it appears instantly."];
    host.innerHTML = `<div class="card empty"><div class="eic"><svg><use href="#${scope === "favorites" ? "i-star" : "i-docs"}"/></svg></div>
      <b>${copy[0]}</b><p>${copy[1]}</p></div>`;
    const eb = $(".empty", host);
    if (scope === "my" || (scope === "browse" && !filtered))
      eb.appendChild(el(`<button class="btn primary"><svg class="ic" style="width:15px;height:15px"><use href="#i-up"/></svg> Upload something</button>`));
    else if (filtered) eb.appendChild(el(`<button class="btn ghost">Clear filters</button>`));
    const b = $(".empty .btn", host);
    if (b) b.onclick = () => {
      if (b.textContent.trim() === "Clear filters") { st.q = st.type = ""; st.course = ""; syncToolbar(scope); load(scope); }
      else openUpload(); };
    $("#list-foot").innerHTML = ""; return;
  }
  if (scope === "my") {
    host.innerHTML = `<div class="card" style="overflow:hidden"></div>`;
    const list = $(".card", host);
    items.forEach((d) => {
      const row = el(`<div class="lrow" tabindex="0">
        <div class="mini-th ${d.has_thumb ? "" : "tt"}" ${d.has_thumb ? `style="background-image:url(/api/documents/${d.id}/thumb)"` : ""}>${d.has_thumb ? "" : esc(d.type[0].toUpperCase())}</div>
        <div class="t"><b>${esc(d.title)}</b>
          <span>${d.course ? esc(d.course.code) + " · " : ""}${TYPE_LABEL[d.type]} · ${fmtSize(d.size)} · ${d.downloads} downloads · ${ago(d.created_at)}</span></div>
        <button class="iconbtn" title="Edit"><svg class="ic" style="width:15px;height:15px"><use href="#i-pen"/></svg></button>
        <button class="iconbtn dz" title="Delete"><svg class="ic" style="width:15px;height:15px"><use href="#i-trash"/></svg></button>
      </div>`);
      row.onclick = (e) => { if (!e.target.closest("button")) { location.hash = "#/doc/" + d.id; } };
      $$("button", row)[0].onclick = () => openEdit(d);
      $$("button", row)[1].onclick = () => deleteDoc(d);
      list.appendChild(row);
    });
  } else {
    const g = el(`<div class="grid"></div>`);
    items.forEach((d) => g.appendChild(docCard(d, scope)));
    host.innerHTML = ""; host.appendChild(g);
  }
  $("#list-foot").innerHTML = st.pages > 1
    ? `<div class="pager"><button class="btn ghost sm" id="pg-prev" ${st.page <= 1 ? "disabled" : ""}>← Newer</button>
       <span>Page ${st.page} of ${st.pages} · ${st.total} document${st.total === 1 ? "" : "s"}</span>
       <button class="btn ghost sm" id="pg-next" ${st.page >= st.pages ? "disabled" : ""}>Older →</button></div>`
    : `<div class="pager"><span>${st.total} document${st.total === 1 ? "" : "s"}</span></div>`;
  if (st.pages > 1) {
    $("#pg-prev").onclick = () => { st.page--; load(scope); };
    $("#pg-next").onclick = () => { st.page++; load(scope); };
  }
}

function renderList(scope) {
  const st = S[scope];
  const titles = { browse: "Browse the library", my: "My uploads", favorites: "Favorites" };
  const view = $("#view");
  view.innerHTML = `
    <div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:16px">
      <div><h2 style="margin:0;font-size:20px;letter-spacing:-.01em">${titles[scope]}</h2>
      <p style="margin:3px 0 0;color:var(--mut);font-size:13px">${
        scope === "my" ? "Upload, edit, share — deletion keeps a 6-second undo."
        : scope === "favorites" ? "Starred by you, across every course."
        : "Everything the department has shipped: books, decks, notes, tools."}</p></div>
      <div class="sp" style="flex:1"></div>
      ${scope === "my" ? `<button class="btn primary" id="list-up"><svg class="ic" style="width:15px;height:15px"><use href="#i-up"/></svg> Upload</button>` : ""}
    </div>
    <div class="toolbar" id="toolbar"></div>
    <div id="list-body"></div><div id="list-foot"></div>`;
  if (scope === "my") $("#list-up").onclick = () => openUpload();
  const tb = $("#toolbar");
  const search = el(`<div class="search" style="flex:1;max-width:340px"><svg class="ic"><use href="#i-search"/></svg>
    <input placeholder="Search titles, descriptions, tags…" value="${esc(st.q)}" id="q-in"></div>`);
  $("#q-in", search).oninput = debounce((e) => { st.q = e.target.value.trim(); st.page = 1; load(scope); }, 320);
  tb.appendChild(search);
  if (scope === "browse") {
    const cs = el(`<select class="sel-inline" id="c-sel"><option value="">All courses</option>${
      COURSES.map((c) => `<option value="${c.id}" ${String(st.course) === String(c.id) ? "selected" : ""}>${esc(c.code)} — ${esc(c.title)}</option>`).join("")}</select>`);
    cs.onchange = () => { st.course = cs.value; st.page = 1; load(scope); };
    tb.appendChild(cs);
  }
  const types = ["", "book", "slides", "notes", "archive"];
  types.forEach((t) => {
    const c = el(`<button class="chip ${st.type === t ? "on" : ""}">${t ? TYPE_LABEL[t] : "All types"}</button>`);
    c.onclick = () => { st.type = t; st.page = 1; load(scope); };
    tb.appendChild(c);
  });
  const sort = el(`<select class="sel-inline" id="s-sel" style="margin-left:auto">
    ${[["recent", "Newest first"], ["downloads", "Most downloaded"], ["views", "Most viewed"], ["title", "Title A–Z"]]
      .map(([v, l]) => `<option value="${v}" ${st.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select>`);
  sort.onchange = () => { st.sort = sort.value; st.page = 1; load(scope); };
  tb.appendChild(sort);
  tb.dataset.scope = scope;
  ensure(scope);
}
function syncToolbar(scope) { const v = $(`#q-in`); if (v) v.value = S[scope].q; }

/* ---------------------------------------------------------------- dashboard */
async function renderDashboard() {
  const view = $("#view");
  if (!D.totals) {
    view.innerHTML = `<div class="tiles">${"<div class='card skel' style='padding:0;height:86px'></div>".repeat(4)}</div>`;
    try { Object.assign(D, await api("/api/stats")); } catch (e) {
      view.innerHTML = `<div class="card empty"><b>Dashboard offline</b><p>${esc(e.message)}</p></div>`; return; }
  }
  const first = ME.name.split(" ")[0];
  const hour = new Date().getHours();
  const hi = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  view.innerHTML = `
  <div class="card" style="padding:20px 22px;margin-bottom:18px;display:flex;gap:16px;align-items:center;flex-wrap:wrap">
    <div style="flex:1;min-width:230px">
      <div style="font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);font-weight:700">${hi}, ${esc(first)}</div>
      <div style="font-size:21px;font-weight:800;letter-spacing:-.01em;margin-top:2px">
        ${esc(ME.role === "teacher" ? "Your library is holding." : "Semester stocktake, sorted.")}</div>
      <div style="color:var(--mut);font-size:13px;margin-top:3px">${
        ME.role === "teacher" ? "Your uploads carry " + fmtN(D.totals.downloads) + " downloads — students read what you ship."
        : fmtN(D.totals.documents) + " verified documents across " + D.totals.courses + " courses — zero paywalls, all offline-friendly."}</div>
    </div>
    <button class="btn primary" id="d-up"><svg class="ic" style="width:15px;height:15px"><use href="#i-up"/></svg> Upload a document</button>
    <button class="btn ghost" id="d-br">Browse everything</button>
  </div>
  <div class="tiles">
    ${[["Documents", fmtN(D.totals.documents), "i-docs"], ["Downloads", fmtN(D.totals.downloads), "i-down"],
       ["Views", fmtN(D.totals.views), "i-eye"], ["Library size", fmtSize(D.totals.bytes), "i-folder"]]
      .map(([l, v, i]) => `<div class="card tile"><span class="l"><svg class="ic" style="width:15px;height:15px;color:var(--acc)"><use href="#${i}"/></svg>${l}</span><span class="v">${v}</span></div>`).join("")}
  </div>
  <div class="row2">
    <div class="card sect"><h2><svg class="ic" style="color:var(--acc)"><use href="#i-plus"/></svg>Recently added<span class="sp"></span>
      <button class="btn ghost sm" id="d-all">See all</button></h2>
      <div class="hlist" id="d-recent"></div></div>
    <div class="card sect"><h2><svg class="ic" style="color:var(--warn)"><use href="#i-down"/></svg>Most downloaded</h2>
      <div class="hlist" id="d-top"></div>
      <div style="margin-top:14px"><h2 style="margin-bottom:8px"><svg class="ic" style="color:var(--acc)"><use href="#i-chart"/></svg>By course</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap" id="d-courses"></div></div></div>
  </div>`;
  $("#d-up").onclick = () => openUpload();
  $("#d-all").onclick = () => location.hash = "#/browse";
  const recent = $("#d-recent");
  D.recent.forEach((d) => {
    const row = el(`<div class="hrow">
      <div class="mini-th ${d.has_thumb ? "" : "tt"}" ${d.has_thumb ? `style="background-image:url(/api/documents/${d.id}/thumb)"` : ""}>${d.has_thumb ? "" : esc(d.type[0].toUpperCase())}</div>
      <div class="t"><b>${esc(d.title)}</b><span>${d.course ? esc(d.course.code) + " · " : ""}${ago(d.created_at)} · ${fmtSize(d.size)}</span></div>
      <span class="badge gray">${TYPE_LABEL[d.type] || d.type}</span></div>`);
    row.onclick = () => { location.hash = "#/doc/" + d.id; };
    recent.appendChild(row);
  });
  const top = $("#d-top"), max = Math.max(1, ...D.top.map((d) => d.downloads));
  D.top.forEach((d) => {
    const row = el(`<div class="hrow"><div class="t"><b>${esc(d.title)}</b>
      <span>${fmtN(d.downloads)} downloads · ${fmtN(d.views)} views</span>
      <span style="display:block;height:5px;border-radius:9px;background:#eef0f8;margin-top:4px;overflow:hidden">
        <span style="display:block;height:100%;width:${Math.round(8 + 92 * d.downloads / max)}%;background:linear-gradient(90deg,var(--acc),var(--acc2))"></span></span></div></div>`);
    row.onclick = () => { location.hash = "#/doc/" + d.id; };
    top.appendChild(row);
  });
  const cc = $("#d-courses");
  D.by_course.forEach((c) => {
    cc.appendChild(el(`<button class="chip" style="border-color:var(--line)">${esc(c.code)} · ${c.n}</button>`));
    $("button:last-child", cc).onclick = () => { S.browse.course = String(
      (COURSES.find((x) => x.code === c.code) || {}).id || ""); S.browse.page = 1; location.hash = "#/browse"; };
  });
  drawNav();
}

/* ---------------------------------------------------------------- detail */
async function renderDetail(id) {
  const view = $("#view");
  view.innerHTML = `<div class="card skel" style="height:170px;margin-bottom:16px"></div>
    <div class="detail"><div class="card skel" style="height:220px"></div><div class="card skel" style="height:220px"></div></div>`;
  let d;
  try { d = await api("/api/documents/" + id); } catch (e) {
    view.innerHTML = `<div class="card empty"><div class="eic"><svg><use href="#i-x"/></svg></div>
      <b>Not found</b><p>${esc(e.message)}</p><button class="btn ghost" onclick="location.hash='#/browse'">Back to the library</button></div>`;
    $(".btn", view).onclick = () => { location.hash = "#/browse"; }; return; }
  const canEdit = d.can_edit;
  const isPdf = d.mime === "application/pdf";
  view.innerHTML = `
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
    <button class="iconbtn" id="back" aria-label="Back"><svg class="ic" style="width:15px;height:15px"><use href="#i-x"/></svg></button>
    <div class="sp" style="flex:1"></div>
    <span class="badge">${TYPE_LABEL[d.type] || d.type}</span>
    <span style="color:var(--mut);font-size:12px">${ago(d.created_at)}</span>
  </div>
  <div class="card dhero" style="margin-bottom:16px">
    <div class="bigth ${d.has_thumb ? "" : "tt"}" ${d.has_thumb ? `style="background-image:url(/api/documents/${d.id}/thumb)"` : ""}>${d.has_thumb ? "" : esc(d.type[0].toUpperCase())}</div>
    <div style="flex:1;min-width:0">
      <h2 style="margin:0 0 6px;font-size:19px;letter-spacing:-.01em">${esc(d.title)}</h2>
      <p style="margin:0;color:var(--mut);font-size:13.2px">${esc(d.description || "No description yet.")}</p>
      <div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:13px">
        <button class="btn primary" id="dl"><svg class="ic" style="width:15px;height:15px"><use href="#i-down"/></svg> Download · ${fmtSize(d.size)}</button>
        <button class="btn ghost" id="share"><svg class="ic" style="width:15px;height:15px"><use href="#i-docs"/></svg> Copy link</button>
        <button class="btn ghost" id="fav2">${d.is_fav ? "★ Starred" : "☆ Star"}</button>
        ${canEdit ? `<button class="btn ghost" id="edit"><svg class="ic" style="width:15px;height:15px"><use href="#i-pen"/></svg> Edit</button>
        <button class="btn danger" id="del"><svg class="ic" style="width:15px;height:15px"><use href="#i-trash"/></svg> Delete</button>` : ""}
      </div>
    </div>
  </div>
  <div class="detail">
    <div class="card sect">${isPdf
      ? `<h2><svg class="ic" style="color:var(--acc)"><use href="#i-eye"/></svg> Inline preview <span class="sp"></span>
         <span style="font-weight:500;color:var(--mut);font-size:12px">full document in the preview below</span></h2>
         <iframe class="prev-frame" src="/api/documents/${d.id}/preview?t=${encodeURIComponent(TOKEN)}" title="PDF preview"></iframe>`
      : `<h2><svg class="ic" style="color:var(--acc)"><use href="#i-eye"/></svg> Preview</h2>
         <div class="empty" style="padding:30px"><div class="eic"><svg><use href="#${TYPE_ICON[d.type] || "i-docs"}"/></svg></div>
         <b>${esc(d.filename)}</b><p>${d.type === "slides" ? "Open the deck after downloading — PowerPoint stays pixel-perfect this way."
         : d.type === "archive" ? "Unzip and open index.html in any browser; the tool works with the network dark."
         : "Download to view this file type in its native app."}</p></div>`}
      ${d.tags.length ? `<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:12px">${
        d.tags.map((t) => `<span class="badge gray">#${esc(t)}</span>`).join("")}</div>` : ""}
    </div>
    <div style="display:flex;flex-direction:column;gap:16px">
      <div class="card sect"><h2>Details</h2>
        <dl class="kv">
          <dt>File</dt><dd>${esc(d.filename)}</dd>
          <dt>Owner</dt><dd>${esc(d.owner ? d.owner.name : "—")}${d.owner ? ` · <span class="badge gray">${esc(d.owner.role)}</span>` : ""}</dd>
          <dt>Course</dt><dd>${d.course ? esc(d.course.code) + " — " + esc(d.course.title) : "Unclassified"}</dd>
          <dt>Downloads</dt><dd id="dl-n">${fmtN(d.downloads)}</dd>
          <dt>Views</dt><dd>${fmtN(d.views)}</dd>
          <dt>SHA-256</dt><dd class="mono" title="${esc(d.sha)}">${esc((d.sha || "").slice(0, 16))}…</dd>
          <dt>Uploaded</dt><dd>${fmtDate(d.created_at)}</dd>
          ${d.updated_at !== d.created_at ? `<dt>Edited</dt><dd>${fmtDate(d.updated_at)}</dd>` : ""}
        </dl></div>
      ${d.course ? `<div class="card sect"><h2>Same course</h2><div class="hlist" id="rel"></div></div>` : ""}
    </div>
  </div>`;
  $("#back").onclick = () => history.length > 1 ? history.back() : (location.hash = "#/browse");
  $("#dl").onclick = () => downloadDoc(d);
  $("#share").onclick = () => { navigator.clipboard.writeText(location.origin + "/#/doc/" + d.id)
    .then(() => toast("Link copied — share it with the batch", { kind: "ok" }))
    .catch(() => toast("Couldn't reach the clipboard", { kind: "bad" })); };
  const f2 = $("#fav2");
  f2.onclick = () => { toggleFav(d, f2); f2.textContent = d.is_fav ? "★ Starred" : "☆ Star"; };
  if (canEdit) { $("#edit").onclick = () => openEdit(d, () => renderDetail(d.id));
    $("#del").onclick = () => { deleteDoc(d); location.hash = "#/my"; }; }
  if (d.course) {
    try { const rel = await api(`/api/documents?scope=all&course=${d.course_id}&sort=recent`);
      const host = $("#rel"), max = 4;
      rel.items.filter((x) => x.id !== d.id).slice(0, max).forEach((x) => {
        const row = el(`<div class="hrow"><div class="t"><b>${esc(x.title)}</b>
          <span>${TYPE_LABEL[x.type]} · ${fmtSize(x.size)} · ${fmtN(x.downloads)} downloads</span></div></div>`);
        row.onclick = () => { location.hash = "#/doc/" + x.id; }; host.appendChild(row); });
      if (!host.children.length) host.innerHTML = `<div style="color:var(--mut);font-size:12.5px">Nothing else in ${esc(d.course.code)} yet.</div>`;
    } catch {}
  }
}

/* ---------------------------------------------------------------- modals */
function formErr(input, msg) { const f = input.closest(".f"); f.classList.add("bad"); $(".err", f).textContent = msg; }
function clearErrs(m) { $$(".f", m).forEach((f) => f.classList.remove("bad")); }

function fileToB64(f) {
  return new Promise((res, rej) => { const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]); r.onerror = () => rej(new Error("Could not read the file"));
    r.readAsDataURL(f); });
}

function openUpload(picked) {
  const { m, close } = overlay(`
    <div class="m-h"><b>Upload a document</b><button class="iconbtn x" data-x><svg class="ic" style="width:15px;height:15px"><use href="#i-x"/></svg></button></div>
    <div class="m-b"><form id="up-form" novalidate>
      <div class="drop" id="drop"><b>Drop the file here — or click to choose</b>
        PDF · PPTX · ZIP · PNG · CSV · MD · TXT — up to 60 MB.
        <div class="filechip hidden" id="fchip"><svg class="ic" style="width:15px;height:15px"><use href="#i-check"/></svg>
          <span id="fname"></span><span class="sp"></span><span id="fsize"></span></div>
        <input type="file" id="fin" class="hidden" accept=".pdf,.pptx,.ppt,.zip,.png,.jpg,.jpeg,.csv,.md,.txt"></div>
      <div class="f" style="margin-top:14px"><label>Title *</label>
        <input class="inp" name="title" placeholder="e.g. Operating Systems — Unit 4 revision notes"><div class="err"></div></div>
      <div class="f"><label>Description</label>
        <textarea class="inp" name="description" placeholder="What is it, who made it, what does it cover?"></textarea><div class="err"></div></div>
      <div class="two">
        <div class="f"><label>Course</label><select class="inp" name="course_id" id="up-course"></select><div class="err"></div></div>
        <div class="f"><label>Type</label><select class="inp" name="type">
          <option value="book">Course book</option><option value="slides">Slides</option>
          <option value="notes" selected>Notes</option><option value="archive">Archive / tool</option></select><div class="err"></div></div>
      </div>
      <div class="f"><label>Tags <span style="font-weight:400">(comma separated)</span></label>
        <input class="inp" name="tags" placeholder="os, scheduling, sem-4"><div class="err"></div></div>
      <button class="btn primary" style="width:100%" id="up-go">Publish to the library</button>
    </form></div>`);
  m.querySelector("[data-x]").onclick = close;
  const course = $("#up-course", m);
  course.innerHTML = `<option value="">No course (general)</option>` +
    COURSES.map((c) => `<option value="${c.id}">${esc(c.code)} — ${esc(c.title)}</option>`).join("");
  const fin = $("#fin", m), drop = $("#drop", m);
  let file = null;
  const setFile = (f) => {
    file = f;
    if (!f) return;
    $("#fname", m).textContent = f.name; $("#fsize", m).textContent = fmtSize(f.size);
    $("#fchip", m).classList.remove("hidden");
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    const type = { pdf: "book", pptx: "slides", ppt: "slides", zip: "archive" }[ext] || "notes";
    $("select[name=type]", m).value = type;
    if (!$("input[name=title]", m).value.trim())
      $("input[name=title]", m).value = f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
  };
  drop.onclick = () => fin.click();
  fin.onchange = () => setFile(fin.files[0]);
  ["dragover", "dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.toggle("hot", ev === "dragover");
    if (ev === "drop" && e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); }));
  if (picked) setFile(picked);
  $("#up-form", m).onsubmit = async (e) => {
    e.preventDefault(); clearErrs(m);
    const t = $("input[name=title]", m);
    if (!file) { formErr(t, "Attach a file first — the drop zone above."); return; }
    if (file.size > 60 * 1048576) { formErr(t, "File exceeds the 60 MB limit."); return; }
    if (t.value.trim().length < 3) { formErr(t, "Give it a title (3+ characters)."); return; }
    const go = $("#up-go", m); go.disabled = true; go.innerHTML = `<span class="spin"></span> Publishing…`;
    try {
      const b64 = await fileToB64(file);
      const body = Object.fromEntries(new FormData($("#up-form", m)).entries());
      body.file = { name: file.name, data_b64: b64 };
      const d = await api("/api/documents", { method: "POST", body });
      Object.values(S).forEach((st) => { if (st.items) { st.items.unshift(d); st.total++; } });
      try { COURSES = (await api("/api/courses")).items; } catch {}
      refreshMe(); close(); toast(`“${d.title.slice(0, 34)}” is live in the library`, { kind: "ok" });
      route(); drawNav();
    } catch (err) { toast(err.message, { kind: "bad" });
      formErr(t, err.message); go.disabled = false; go.textContent = "Publish to the library"; }
  };
}

function openEdit(d, after) {
  const { m, close } = overlay(`
    <div class="m-h"><b>Edit document</b><button class="iconbtn x" data-x><svg class="ic" style="width:15px;height:15px"><use href="#i-x"/></svg></button></div>
    <div class="m-b"><form id="ed-form" novalidate>
      <div class="f"><label>Title *</label><input class="inp" name="title" value="${esc(d.title)}"><div class="err"></div></div>
      <div class="f"><label>Description</label><textarea class="inp" name="description">${esc(d.description || "")}</textarea><div class="err"></div></div>
      <div class="two">
        <div class="f"><label>Course</label><select class="inp" name="course_id" id="ed-course"></select><div class="err"></div></div>
        <div class="f"><label>Type</label><select class="inp" name="type">
          ${["book", "slides", "notes", "archive"].map((t) =>
            `<option value="${t}" ${d.type === t ? "selected" : ""}>${TYPE_LABEL[t]}</option>`).join("")}</select><div class="err"></div></div>
      </div>
      <div class="f"><label>Tags</label><input class="inp" name="tags" value="${esc(d.tags.join(", "))}"><div class="err"></div></div>
      <div style="display:flex;gap:9px;justify-content:flex-end">
        <button type="button" class="btn ghost" data-x2>Cancel</button>
        <button class="btn primary" id="ed-go">Save changes</button></div>
    </form></div>`);
  $$("[data-x],[data-x2]", m).forEach((b) => b.onclick = close);
  const c = $("#ed-course", m);
  c.innerHTML = `<option value="">No course (general)</option>` +
    COURSES.map((x) => `<option value="${x.id}" ${d.course_id === x.id ? "selected" : ""}>${esc(x.code)} — ${esc(x.title)}</option>`).join("");
  $("#ed-form", m).onsubmit = async (e) => {
    e.preventDefault(); clearErrs(m);
    const go = $("#ed-go", m); go.disabled = true; go.innerHTML = `<span class="spin"></span> Saving…`;
    try {
      const body = Object.fromEntries(new FormData(e.target).entries());
      const upd = await api(`/api/documents/${d.id}`, { method: "PUT", body });
      Object.values(S).forEach((st) => { if (st.items) {
        const i = st.items.findIndex((x) => x.id === d.id); if (i > -1) st.items[i] = upd; } });
      close(); toast("Changes saved", { kind: "ok" });
      after ? after() : (route(), 0);
    } catch (err) { toast(err.message, { kind: "bad" }); go.disabled = false; go.textContent = "Save changes"; }
  };
}

function openCourse() {
  const { m, close } = overlay(`
    <div class="m-h"><b>New course</b><button class="iconbtn x" data-x><svg class="ic" style="width:15px;height:15px"><use href="#i-x"/></svg></button></div>
    <div class="m-b"><form id="co-form" novalidate>
      <div class="two"><div class="f"><label>Course code *</label>
        <input class="inp" name="code" placeholder="1BCS305"><div class="err"></div></div>
      <div class="f"><label>Semester</label><input class="inp" name="semester" placeholder="Sem 4"></div></div>
      <div class="f"><label>Title *</label><input class="inp" name="title" placeholder="Data Structures"><div class="err"></div></div>
      <div class="f"><label>Department / wing</label><input class="inp" name="dept" placeholder="CSE · AJIET"></div>
      <button class="btn primary" style="width:100%">Create course</button></form></div>`);
  m.querySelector("[data-x]").onclick = close;
  $("#co-form", m).onsubmit = async (e) => {
    e.preventDefault(); clearErrs(m);
    try {
      const body = Object.fromEntries(new FormData(e.target).entries());
      const r = await api("/api/courses", { method: "POST", body });
      COURSES.push({ ...r, title: r.title, n: 0 }); close(); drawNav();
      toast(`Course ${r.code} created`, { kind: "ok" });
    } catch (err) { toast(err.message, { kind: "bad" }); }
  };
}

/* ---------------------------------------------------------------- boot */
(async function boot() {
  if (!TOKEN) return renderAuth("login");
  try { const r = await api("/api/session"); if (!r.user) return renderAuth("login"); ME = r.user; }
  catch { return renderAuth("login"); }
  bootIntoApp();
})();
