/* VTU Docs — one page, no framework, no CDN.
   Public library: browse subjects → open a manual → read inline or download.
   The only optional account is Google sign-in, used just to greet you by name. */
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; };

const APP = {
  creator: null, subjects: [], manuals: [], totals: {}, google: false, user: null,
  q: "", subject: "", type: "", sort: "downloads", shown: 12,
};
const PAGE = 12;

/* ---------------------------------------------------------------- utils */
const fmtSize = (b) => b >= 1048576 ? (b / 1048576).toFixed(1) + " MB"
  : b >= 1024 ? Math.round(b / 1024) + " KB" : b + " B";
const fmtN = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("en-IN",
  { day: "numeric", month: "short", year: "numeric" }) : "—";
const TYPE_LABEL = { book: "Course book", slides: "Classroom slides", notes: "Notes & sheets", archive: "Tool / archive" };
const TYPE_ICON = { book: "i-book", slides: "i-slides", notes: "i-doc", archive: "i-tool" };
const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };

async function api(path, opts = {}) {
  const r = await fetch(path, opts);
  if (!r.ok) {
    let msg = "Request failed (" + r.status + ")";
    try { const j = await r.json(); if (j.detail) msg = j.detail; } catch {}
    throw new Error(msg);
  }
  return r.status === 204 ? null : r.json();
}

function toast(msg, { kind = "", ms = 3600 } = {}) {
  const t = el(`<div class="toast ${kind}"><span>${esc(msg)}</span></div>`);
  $("#toast-root").appendChild(t);
  const dismiss = () => { t.classList.add("out"); setTimeout(() => t.remove(), 220); };
  setTimeout(dismiss, ms);
  return t;
}

let OPEN_MODALS = 0;
function lockScroll(on) {
  OPEN_MODALS = Math.max(0, OPEN_MODALS + (on ? 1 : -1));
  document.body.classList.toggle("locked", OPEN_MODALS > 0);
}

/* ---------------------------------------------------------------- modal */
function modal(inner, { wide = false, tall = false, onClose } = {}) {
  const ov = el(`<div class="ov"><div class="panel ${wide ? "wide" : ""} ${tall ? "tall" : ""}"></div></div>`);
  const panel = ov.firstChild;
  panel.innerHTML = inner;
  const close = () => {
    ov.classList.add("out"); lockScroll(false);
    document.removeEventListener("keydown", onKey);
    setTimeout(() => ov.remove(), 160);
    onClose && onClose();
  };
  // Escape closes the top-most dialog only (the reader sits above a subject shelf)
  const onKey = (e) => {
    if (e.key === "Escape" && ov === $("#modal-root").lastElementChild) close();
  };
  ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
  document.addEventListener("keydown", onKey);
  $("#modal-root").appendChild(ov);
  lockScroll(true);
  return { ov, panel, close };
}

/* ------------------------------------------------------------ rendering */
function coverImg(subject, cls = "") {
  return `<img class="${cls}" src="/assets/covers/${encodeURIComponent(subject.cover)}.jpg"
    alt="Cover of the ${esc(subject.title)} manual" loading="lazy" decoding="async">`;
}

function subjectTile(s, i = 0) {
  const n = s.manuals.length;
  return el(`<article class="tile" tabindex="0" role="button" style="--i:${i}"
      aria-label="${esc(s.title)} — ${n} manual${n === 1 ? "" : "s"}">
    ${coverImg(s, "tile-art")}
    <span class="tile-tag">${esc((s.codes[0] || s.eyebrow || "").slice(0, 26))}</span>
    <span class="tile-open"><svg class="ic"><use href="#i-arrow"/></svg></span>
    <div class="tile-body">
      <h3>${esc(s.title)}</h3>
      <p>${esc(s.blurb || s.eyebrow)}</p>
      <div class="tile-meta">
        <span>${s.counts.books} book${s.counts.books === 1 ? "" : "s"}</span>
        ${s.counts.slides ? `<span>${s.counts.slides} deck${s.counts.slides === 1 ? "" : "s"}</span>` : ""}
        ${s.counts.other ? `<span>${s.counts.other} other</span>` : ""}
        <span class="sp"></span>
        <span><svg class="ic"><use href="#i-download"/></svg>${fmtN(s.downloads)}</span>
      </div>
    </div>
  </article>`);
}

function manualRow(m) {
  const code = (m.course || {}).code || "General";
  const row = el(`<article class="row" tabindex="0" role="button" aria-label="${esc(m.title)}">
    <div class="row-th ${m.has_thumb ? "" : "tt"} ${m.has_thumb ? "" : m.type}"
      ${m.has_thumb ? `style="background-image:url(/api/documents/${m.id}/thumb)"` : ""}>
      ${m.has_thumb ? "" : esc(TYPE_LABEL[m.type].split(" ")[0][0])}</div>
    <div class="row-main">
      <h3>${esc(m.title)}</h3>
      <p>${esc(m.description || "")}</p>
      <div class="row-badges">
        <span class="badge">${esc(code)}</span>
        <span class="badge gray">${esc(TYPE_LABEL[m.type] || m.type)}</span>
        <span class="badge gray">${esc(m.ext.toUpperCase())} · ${fmtSize(m.size)}</span>
        ${(m.tags || []).slice(0, 3).map((t) => `<span class="badge tag">#${esc(t)}</span>`).join("")}
      </div>
    </div>
    <div class="row-stats">
      <span><svg class="ic"><use href="#i-download"/></svg>${fmtN(m.downloads)}</span>
      <span><svg class="ic"><use href="#i-read"/></svg>${fmtN(m.views)}</span>
    </div>
    <div class="row-actions">
      ${m.is_pdf ? `<button class="btn ghost sm" data-read><svg class="ic"><use href="#i-read"/></svg> Read</button>` : ""}
      <button class="btn primary sm" data-dl><svg class="ic"><use href="#i-download"/></svg> Download</button>
    </div>
  </article>`);
  const openRead = () => m.is_pdf ? openReader(m) : downloadManual(m);
  row.onclick = (e) => { if (!e.target.closest("button")) openRead(); };
  row.onkeydown = (e) => { if (e.key === "Enter") openRead(); };
  $("[data-read]", row)?.addEventListener("click", (e) => { e.stopPropagation(); openReader(m); });
  $("[data-dl]", row).addEventListener("click", (e) => { e.stopPropagation(); downloadManual(m); });
  return row;
}

function paintManuals() {
  const host = $("#manual-rows");
  const matches = filtered();
  const slice = matches.slice(0, APP.shown);
  host.innerHTML = "";
  if (!matches.length) {
    host.appendChild(el(`<div class="empty">
      <b>Nothing matches that filter</b>
      <p>Try another subject, clear the search box, or switch the file-type filter back to
         “All types”.</p>
      <button class="btn ghost sm" id="clear-filters">Clear filters</button></div>`));
    $("#clear-filters").onclick = () => {
      APP.q = ""; APP.subject = ""; APP.type = ""; APP.shown = PAGE;
      $("#q").value = ""; $("#f-subject").value = ""; $("#f-type").value = "";
      paintManuals();
    };
  } else {
    slice.forEach((m) => host.appendChild(manualRow(m)));
  }
  $("#library-count").textContent =
    `${matches.length} manual${matches.length === 1 ? "" : "s"}` +
    (matches.length !== APP.manuals.length ? ` of ${APP.manuals.length}` : "");
  const more = $("#load-more");
  more.innerHTML = "";
  if (matches.length > APP.shown) {
    const b = el(`<button class="btn ghost">Show ${Math.min(PAGE, matches.length - APP.shown)} more
      <span class="muted">(${matches.length - APP.shown} left)</span></button>`);
    b.onclick = () => { APP.shown += PAGE; paintManuals(); };
    more.appendChild(b);
  }
}

function filtered() {
  const needle = APP.q.trim().toLowerCase();
  let items = APP.manuals;
  if (APP.subject) items = items.filter((m) => String((m.course || {}).subject_id || "") === APP.subject);
  if (APP.type) items = items.filter((m) => m.type === APP.type);
  if (needle) items = items.filter((m) => (m.title + " " + m.description + " "
    + (m.course ? m.course.code + " " + m.course.title : "") + " "
    + (m.tags || []).join(" ")).toLowerCase().includes(needle));
  const keys = {
    downloads: (m) => -m.downloads, views: (m) => -m.views,
    recent: (m) => -m.created_at, title: (m) => m.title.toLowerCase(),
  };
  return [...items].sort((a, b) => {
    const k = keys[APP.sort]; const va = k(a), vb = k(b);
    return va < vb ? -1 : va > vb ? 1 : 0;
  });
}

/* --------------------------------------------------------- subject shelf */
function openSubject(s) {
  const { panel, close } = modal(`
    <div class="panel-h">
      <div>
        <span class="eyebrow">${esc(s.eyebrow)}</span>
        <h3>${esc(s.title)}</h3>
      </div>
      <button class="x" id="m-x" aria-label="Close"><svg class="ic"><use href="#i-x"/></svg></button>
    </div>
    <div class="panel-b">
      <div class="shelf">
        <figure class="shelf-art">${coverImg(s, "shelf-img")}
          <figcaption>${s.codes.map(esc).join(" · ")}</figcaption>
        </figure>
        <div class="shelf-text">
          <p>${esc(s.blurb || s.eyebrow)}</p>
          <div class="shelf-courses">
            ${s.courses.map((c) => `<div class="mini">
              <b>${esc(c.code)}</b><span>${esc(c.title)}</span>
              <small>${esc(c.semester || "")}${c.dept ? " · " + esc(c.dept) : ""}</small></div>`).join("")}
          </div>
          <div class="shelf-share">
            <button class="btn ghost sm" id="copy-subject">
              <svg class="ic"><use href="#i-doc"/></svg> Copy link to this subject</button>
          </div>
        </div>
      </div>
      <h4 class="shelf-head">Manuals in this subject
        <span class="muted">${s.manuals.length} file${s.manuals.length === 1 ? "" : "s"}</span></h4>
      <div class="shelf-list" id="shelf-list"></div>
    </div>`, { wide: true });
  $("#m-x", panel).onclick = close;
  const list = $("#shelf-list", panel);
  s.manuals.forEach((m) => list.appendChild(manualRow(m)));
  $("#copy-subject", panel).onclick = () => {
    const url = location.origin + location.pathname + "#subject-" + s.key;
    (navigator.clipboard?.writeText(url) ?? Promise.reject())
      .then(() => toast("Subject link copied", { kind: "ok" }))
      .catch(() => toast(url, { ms: 7000 }));
  };
}

/* ------------------------------------------------------------- reader */
function openReader(m) {
  const src = `/api/documents/${m.id}/preview`;
  const { panel, close } = modal(`
    <div class="panel-h">
      <div>
        <span class="eyebrow">${esc((m.course || {}).code || "General")} · ${esc(TYPE_LABEL[m.type] || m.type)}</span>
        <h3>${esc(m.title)}</h3>
      </div>
      <div class="panel-h-act">
        <a class="btn ghost sm" href="${src}" target="_blank" rel="noopener">Open in new tab</a>
        <button class="btn primary sm" id="m-dl"><svg class="ic"><use href="#i-download"/></svg> Download</button>
        <button class="x" id="m-x" aria-label="Close"><svg class="ic"><use href="#i-x"/></svg></button>
      </div>
    </div>
    <div class="reader"><iframe src="${src}" title="${esc(m.title)} — inline reader"
      loading="eager"></iframe></div>
    <div class="panel-f">
      <span>${fmtSize(m.size)} · ${esc(m.filename)} · added ${fmtDate(m.created_at)}</span>
      <span class="muted">On a phone, “Open in new tab” gives the full-screen reader.</span>
    </div>`, { wide: true, tall: true });
  $("#m-x", panel).onclick = close;
  $("#m-dl", panel).onclick = () => downloadManual(m);
  // opening a manual is the one action that counts as a "read" in the analytics
  api(`/api/documents/${m.id}?count=true`).then((d) => {
    m.views = d.views;
    const label = $$(".row", $("#manual-rows")).concat($$(".row", $("#shelf-list") || document))
      .find((r) => (r.getAttribute("aria-label") || "").includes(m.title.slice(0, 28)));
    if (label) {
      const stat = $$(".row-stats span", label)[1];
      if (stat) stat.innerHTML = `<svg class="ic"><use href="#i-read"/></svg>${fmtN(d.views)}`;
    }
  }).catch(() => {});
}

async function downloadManual(m) {
  const t = toast("Preparing " + m.ext.toUpperCase() + " download…", { ms: 60000 });
  try {
    const r = await fetch(`/api/documents/${m.id}/download`);
    if (!r.ok) throw new Error("Download failed (" + r.status + ")");
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = m.filename || m.title;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    m.downloads += 1; paintManuals();
    t.querySelector("span").textContent = "Saved “" + (m.filename || m.title) + "”";
    t.classList.add("ok");
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 220); }, 1400);
  } catch (e) {
    t.remove();
    toast(e.message, { kind: "bad" });
  }
}

/* --------------------------------------------------------- google sign-in */
function paintAuth() {
  const slot = $("#auth-slot");
  const u = APP.user;
  if (!u) {
    if (!APP.google) { slot.innerHTML = ""; return; }
    slot.innerHTML = `<a class="btn ghost sm g" href="/auth/google">
      <svg class="ic"><use href="#i-g"/></svg> Sign in with Google</a>`;
    return;
  }
  slot.innerHTML = `<div class="who">
      <span class="wh-av" style="background:${esc(u.avatar || "#4285f4")}">${esc((u.name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase())}</span>
      <span class="wh-tx"><b>${esc((u.name || "").split(" ")[0])}</b><small>reader</small></span>
      <button class="btn ghost sm" id="signout">Sign out</button>
    </div>`;
  $("#signout").onclick = async () => {
    await api("/api/auth/logout", { method: "POST" });
    APP.user = null; paintAuth(); toast("Signed out — browsing stays open");
  };
}

function signinNotice() {
  const params = new URLSearchParams(location.search);
  const flag = params.get("signin");
  if (!flag) return;
  history.replaceState(null, "", location.pathname + location.hash);
  const messages = {
    ok: ["Signed in — good to see you", "ok"],
    cancelled: ["Sign-in cancelled, no problem — everything stays open", ""],
    failed: ["Google sign-in could not be completed — the library is still fully open", "bad"],
    state: ["Sign-in attempt expired, please try again", "bad"],
    unconfigured: ["Google sign-in is not configured yet — the library works without it", ""],
  };
  const [msg, kind] = messages[flag] || messages.failed;
  setTimeout(() => toast(msg, { kind }), 500);
}

/* ---------------------------------------------------------------- boot */
async function loadLibrary() {
  try {
    const lib = await api("/api/library");
    APP.creator = lib.creator; APP.subjects = lib.subjects;
    APP.manuals = lib.manuals; APP.totals = lib.totals; APP.google = !!lib.auth?.google;
    renderStats(); renderSubjects(); renderSubjectFilter(); paintManuals(); paintAuth();
    deepLink();
  } catch (e) {
    $("#subject-tiles").innerHTML = "";
    $("#manual-rows").innerHTML = `<div class="empty"><b>The library could not load</b>
      <p>${esc(e.message)}</p></div>`;
    toast("Could not reach the library", { kind: "bad" });
  }
}

function renderStats() {
  const t = APP.totals;
  const items = [["Subjects", t.subjects], ["Manuals", t.manuals],
                 ["Courses", t.courses], ["Downloads", fmtN(t.downloads)]];
  const dl = $("#stats");
  dl.innerHTML = items.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  $("#subjects-count").textContent =
    `${t.manuals} manuals · ${t.books} course books · ${fmtSize(t.bytes)}`;
  $("#year").textContent = new Date().getFullYear();
}

function renderSubjects() {
  const host = $("#subject-tiles");
  host.innerHTML = "";
  APP.subjects.forEach((s, i) => {
    const tile = subjectTile(s, i);
    const open = () => openSubject(s);
    tile.onclick = open;
    tile.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    host.appendChild(tile);
  });
}

function renderSubjectFilter() {
  const sel = $("#f-subject");
  sel.innerHTML = `<option value="">All subjects</option>` + APP.subjects.map((s) =>
    `<option value="${s.id}">${esc(s.title)}</option>`).join("");
}

function deepLink() {
  const h = location.hash;
  if (h.startsWith("#subject-")) {
    const key = h.slice(9);
    const s = APP.subjects.find((x) => x.key === key);
    if (s) openSubject(s);
  }
}
window.addEventListener("hashchange", deepLink);

/* ------------------------------------------------------------- wiring */
$("#q").addEventListener("input", debounce((e) => {
  APP.q = e.target.value; APP.shown = PAGE; paintManuals();
}, 220));
$("#f-subject").addEventListener("change", (e) => {
  APP.subject = e.target.value; APP.shown = PAGE; paintManuals();
});
$("#f-type").addEventListener("change", (e) => {
  APP.type = e.target.value; APP.shown = PAGE; paintManuals();
});
$("#f-sort").addEventListener("change", (e) => {
  APP.sort = e.target.value; APP.shown = PAGE; paintManuals();
});
$("#jump-search").onclick = () => {
  location.hash = "#library";
  $("#q").focus({ preventScroll: false });
  $("#q").select();
};
$("#burger").onclick = () => $("#menu").classList.toggle("open");
$$("#menu a").forEach((a) => a.addEventListener("click", () => $("#menu").classList.remove("open")));
$("#year").textContent = new Date().getFullYear();

/* active nav link while scrolling */
const bands = ["subjects", "library", "creator", "about"].map((id) => document.getElementById(id));
const spy = new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    if (!en.isIntersecting) return;
    $$("#menu a").forEach((a) =>
      a.classList.toggle("on", a.getAttribute("href") === "#" + en.target.id));
  });
}, { rootMargin: "-45% 0px -50% 0px" });
bands.forEach((b) => b && spy.observe(b));

(async function boot() {
  try { const me = await api("/api/auth/me"); APP.user = me.user; } catch {}
  signinNotice();
  await loadLibrary();
  paintAuth();
})();
