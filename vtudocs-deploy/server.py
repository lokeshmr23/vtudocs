#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""VTU Docs — a one-page, public manual library.

Written by Dr. Lokesh M R, Professor, Department of Information Science and
Engineering, A J Institute of Engineering and Technology, Mangaluru.

Design rules for this server:
  * There is no login wall. Every subject, manual, preview and download is
    public — students should never have to create an account to read a book.
  * No passwords are stored, checked or transmitted. The only optional identity
    provider is Google Sign-In (`/auth/google`), used purely to greet a reader
    by name; nothing on the site is gated behind it.
  * The library is read-only from the browser: no upload / edit / delete routes.

Google Sign-In stays dormant until GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are
set in the environment (see GOOGLE-SIGNIN.md); until then the button hides itself.
"""
import base64 as b64
import json
import os
import secrets
import urllib.error
import urllib.parse
import urllib.request

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

import store
from seed import CREATOR
from store import (STATIC_DIR, connect, file_path, init_db, make_token, now,
                   read_token, row_doc)

app = FastAPI(title="VTU Docs", version="2.0.0")

SUBJECTS_SQL = """
SELECT s.id, s.key, s.title, s.eyebrow, s.cover, s.order_n,
       (SELECT COUNT(*) FROM courses c WHERE c.subject_id = s.id) AS courses_n
FROM subjects s ORDER BY s.order_n, s.id
"""

def db():
    return connect()

@app.on_event("startup")
def _boot():
    init_db()
    import seed
    seed.seed_if_empty()   # first boot: full seed · ephemeral hosts: heals wiped data/

# ---------------------------------------------------------------- library
@app.get("/api/library")
def library():
    """Everything the one page needs, in one round trip."""
    con = db()
    subjects = []
    for s in con.execute(SUBJECTS_SQL):
        course_rows = con.execute(
            "SELECT code, title, semester, dept, blurb FROM courses "
            "WHERE subject_id=? ORDER BY code", (s["id"],)).fetchall()
        docs = con.execute(
            "SELECT d.* FROM documents d JOIN courses c ON c.id = d.course_id "
            "WHERE c.subject_id=? AND d.deleted_at IS NULL "
            "ORDER BY (d.type='book') DESC, d.downloads DESC", (s["id"],)).fetchall()
        manuals = [row_doc(con, d) for d in docs]
        subjects.append({
            "id": s["id"], "key": s["key"], "title": s["title"],
            "eyebrow": s["eyebrow"], "cover": s["cover"],
            "courses": [dict(c) for c in course_rows],
            "codes": [c["code"] for c in course_rows],
            "blurb": (course_rows[0]["blurb"] if course_rows else ""),
            "semesters": sorted({c["semester"] for c in course_rows if c["semester"]}),
            "manuals": manuals,
            "counts": {
                "books": sum(1 for m in manuals if m["type"] == "book"),
                "slides": sum(1 for m in manuals if m["type"] == "slides"),
                "other": sum(1 for m in manuals if m["type"] not in ("book", "slides")),
            },
            "downloads": sum(m["downloads"] for m in manuals),
            "views": sum(m["views"] for m in manuals),
            "latest": max((m["created_at"] for m in manuals), default=0),
        })

    all_docs = con.execute(
        "SELECT d.* FROM documents d WHERE d.deleted_at IS NULL "
        "ORDER BY (d.type='book') DESC, d.downloads DESC").fetchall()
    manuals = [row_doc(con, d) for d in all_docs]

    totals = {
        "subjects": len(subjects),
        "courses": con.execute("SELECT COUNT(*) n FROM courses").fetchone()["n"],
        "manuals": len(manuals),
        "books": sum(1 for m in manuals if m["type"] == "book"),
        "slides": sum(1 for m in manuals if m["type"] == "slides"),
        "bytes": sum(m["size"] for m in manuals),
        "downloads": sum(m["downloads"] for m in manuals),
        "views": sum(m["views"] for m in manuals),
    }
    con.close()
    return {"creator": CREATOR, "subjects": subjects, "manuals": manuals,
            "totals": totals,
            "auth": {"google": google_enabled()}}

@app.get("/api/subjects/{key}")
def subject(key: str):
    lib = library()
    for s in lib["subjects"]:
        if s["key"] == key:
            return s
    raise HTTPException(404, "No such subject")

@app.get("/api/manuals")
def manuals(q: str = "", subject: str = "", type: str = "", sort: str = "downloads"):
    lib = library()
    items = lib["manuals"]
    if q.strip():
        needle = q.strip().lower()
        items = [m for m in items if needle in (m["title"] + " " + m["description"]
                 + " " + " ".join(m["tags"]) + " "
                 + ((m["course"] or {}).get("code", ""))).lower()]
    if subject:
        items = [m for m in items
                 if str((m["course"] or {}).get("subject_id") or "") == str(subject)]
    if type in ("book", "slides", "notes", "archive"):
        items = [m for m in items if m["type"] == type]
    keys = {"downloads": lambda m: -m["downloads"], "views": lambda m: -m["views"],
            "recent": lambda m: -m["created_at"], "title": lambda m: m["title"].lower(),
            "size": lambda m: -m["size"]}
    items = sorted(items, key=keys.get(sort, keys["downloads"]))
    return {"total": len(items), "items": items}

# ---------------------------------------------------------------- files
@app.get("/api/documents/{did}")
def get_doc(did: int, count: bool = False):
    con = db()
    r = con.execute("SELECT * FROM documents WHERE id=? AND deleted_at IS NULL",
                    (did,)).fetchone()
    if not r:
        raise HTTPException(404, "Document not found")
    if count:                       # preview opens are the only view counter here
        con.execute("UPDATE documents SET views = views + 1 WHERE id=?", (did,))
        con.commit()
        r = con.execute("SELECT * FROM documents WHERE id=?", (did,)).fetchone()
    d = row_doc(con, r)
    con.close()
    return d

@app.get("/api/documents/{did}/download")
def download_doc(did: int):
    con = db()
    r = con.execute("SELECT * FROM documents WHERE id=? AND deleted_at IS NULL",
                    (did,)).fetchone()
    if not r:
        raise HTTPException(404, "Document not found")
    con.execute("UPDATE documents SET downloads = downloads + 1 WHERE id=?", (did,))
    con.commit()
    con.close()
    p = file_path(r["stored_name"])
    if not os.path.exists(p):
        raise HTTPException(410, "The stored file is missing — re-seed the library")
    return FileResponse(p, filename=r["filename"],
                        media_type=r["mime"] or "application/octet-stream")

@app.get("/api/documents/{did}/preview")
def preview_doc(did: int):
    """Inline read-in-the-browser view. PDFs only; other types are downloaded."""
    con = db()
    r = con.execute("SELECT * FROM documents WHERE id=? AND deleted_at IS NULL",
                    (did,)).fetchone()
    con.close()
    if not r:
        raise HTTPException(404, "Document not found")
    p = file_path(r["stored_name"])
    if r["mime"] != "application/pdf" or not os.path.exists(p):
        raise HTTPException(415, "Inline reading is available for the PDF manuals only")
    return FileResponse(p, media_type="application/pdf",
                        headers={"Content-Disposition": "inline",
                                 "Cache-Control": "public, max-age=600"})

@app.get("/api/documents/{did}/thumb")
def thumb_doc(did: int):
    p = os.path.join(store.THUMB_DIR, f"doc{int(did)}.png")
    if not os.path.exists(p):
        raise HTTPException(404, "no thumbnail")
    return FileResponse(p, media_type="image/png",
                        headers={"Cache-Control": "public, max-age=86400"})

# ---------------------------------------------------------------- google sign-in
COOKIE = "vtu_reader"

def google_enabled():
    return bool(os.environ.get("GOOGLE_CLIENT_ID") and os.environ.get("GOOGLE_CLIENT_SECRET"))

def _redirect_uri(req: Request):
    base = os.environ.get("OAUTH_REDIRECT_BASE", "").rstrip("/")
    return (base or str(req.base_url).rstrip("/")) + "/auth/google/callback"

def _swap_code(code, req):
    """Exchange the authorization code for tokens (no third-party deps)."""
    data = urllib.parse.urlencode({
        "code": code,
        "client_id": os.environ["GOOGLE_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
        "redirect_uri": _redirect_uri(req),
        "grant_type": "authorization_code",
    }).encode()
    rq = urllib.request.Request("https://oauth2.googleapis.com/token", data=data,
                                headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(rq, timeout=15) as r:
        return json.loads(r.read())

def _claims(id_token):
    """Read the (already TLS-verified) ID token payload — signature is Google's."""
    payload = id_token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(b64.urlsafe_b64decode(payload))

@app.get("/api/auth/config")
def auth_config():
    return {"google": google_enabled()}

@app.get("/api/auth/me")
def auth_me(req: Request):
    tok = req.cookies.get(COOKIE, "")
    data = read_token(tok) if tok else None
    if not data:
        return {"user": None}
    row = db().execute("SELECT id,name,email,role,avatar FROM users WHERE id=?",
                       (data["uid"],)).fetchone()
    return {"user": dict(row) if row else None}

@app.post("/api/auth/logout")
def auth_logout():
    r = JSONResponse({"ok": True})
    r.delete_cookie(COOKIE)
    return r

@app.get("/auth/google")
def auth_google(req: Request):
    if not google_enabled():
        return RedirectResponse("/?signin=unconfigured", status_code=302)
    state = secrets.token_urlsafe(18)
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": os.environ["GOOGLE_CLIENT_ID"],
        "redirect_uri": _redirect_uri(req),
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "prompt": "select_account",
    })
    r = RedirectResponse(url, status_code=302)
    r.set_cookie("vtu_state", state, max_age=600, httponly=True, samesite="lax")
    return r

@app.get("/auth/google/callback")
def auth_callback(req: Request, code: str = "", state: str = "", error: str = ""):
    if error or not code:
        return RedirectResponse("/?signin=cancelled", status_code=302)
    if state != req.cookies.get("vtu_state", ""):
        return RedirectResponse("/?signin=state", status_code=302)
    try:
        tokens = _swap_code(code, req)
        claims = _claims(tokens["id_token"])
    except (urllib.error.URLError, KeyError, ValueError):
        return RedirectResponse("/?signin=failed", status_code=302)
    email = str(claims.get("email", "")).strip().lower()
    if not email:
        return RedirectResponse("/?signin=failed", status_code=302)
    name = claims.get("name") or email.split("@")[0]
    con = db()
    row = con.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
    if row:
        uid = row["id"]
        con.execute("UPDATE users SET name=? WHERE id=?", (name, uid))
    else:
        cur = con.execute(
            "INSERT INTO users(name,email,pass,role,dept,semester,avatar,created_at) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (name, email, "", "reader", "", "", "#4285f4", now()))
        uid = cur.lastrowid
    con.commit()
    con.close()
    r = RedirectResponse("/?signin=ok#reader", status_code=302)
    r.set_cookie(COOKIE, make_token(uid), max_age=30 * 86400, httponly=True,
                 samesite="lax", secure=req.url.scheme == "https")
    r.delete_cookie("vtu_state")
    return r

# ---------------------------------------------------------------- one page
@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

app.mount("/assets", StaticFiles(directory=STATIC_DIR), name="assets")
