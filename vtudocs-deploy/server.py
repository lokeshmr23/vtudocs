#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""VTU Docs — document-sharing platform for VTU course material.
FastAPI + SQLite, token auth (localStorage), CRUD for documents, courses, favorites,
uploads, downloads, stats. Serves the SPA from ./static."""
import base64 as b64
import json
import os
import re
import sqlite3

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import store
from store import (ALLOWED_EXT, DB_PATH, MAX_UPLOAD, MIME, THUMB_DIR, connect,
                   file_path, hash_password, init_db, make_token, now, read_token,
                   row_doc, safe_title, save_bytes, verify_password)

app = FastAPI(title="VTU Docs API", version="1.0.0")

def db():
    return connect()

def user_of(req: Request, required=True):
    hdr = req.headers.get("authorization", "")
    tok = hdr[7:] if hdr.startswith("Bearer ") else (req.query_params.get("t") or "")
    data = read_token(tok) if tok else None
    if not data:
        if required:
            raise HTTPException(401, "Sign in to continue")
        return None
    u = db().execute("SELECT id,name,email,role,dept,semester,avatar FROM users WHERE id=?",
                     (data["uid"],)).fetchone()
    if not u:
        if required:
            raise HTTPException(401, "Session invalid")
        return None
    return dict(u)

@app.on_event("startup")
def _boot():
    init_db()
    import seed
    seed.seed_if_empty()   # first boot: full seed · ephemeral hosts: heals wiped data/

def q_all(req):
    return {k: v for k, v in req.query_params.items()}

# ---------------------------------------------------------------- auth
@app.post("/api/register")
async def register(req: Request):
    b = await req.json()
    name = safe_title(b.get("name", ""))
    email = str(b.get("email", "")).strip().lower()
    pw = str(b.get("password", ""))
    role = b.get("role", "student")
    if len(name) < 2:
        raise HTTPException(422, "Name must be at least 2 characters")
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(422, "Enter a valid email address")
    if len(pw) < 8:
        raise HTTPException(422, "Password must be at least 8 characters")
    if role not in ("student", "teacher"):
        role = "student"
    con = db()
    if con.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
        raise HTTPException(409, "That email already has an account")
    cur = con.execute(
        "INSERT INTO users(name,email,pass,role,dept,semester,avatar,created_at) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (name, email, hash_password(pw), role, safe_title(b.get("dept", "")),
         safe_title(b.get("semester", "")), "#6366f1", now()))
    con.commit()
    uid = cur.lastrowid
    return {"token": make_token(uid), "user": dict(con.execute(
        "SELECT id,name,email,role,dept,semester,avatar FROM users WHERE id=?",
        (uid,)).fetchone())}

@app.post("/api/login")
async def login(req: Request):
    b = await req.json()
    email = str(b.get("email", "")).strip().lower()
    u = db().execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    if not u or not verify_password(str(b.get("password", "")), u["pass"]):
        raise HTTPException(401, "Email or password is incorrect")
    return {"token": make_token(u["id"]),
            "user": {k: u[k] for k in ("id", "name", "email", "role", "dept", "semester", "avatar")}}

@app.get("/api/session")
def session(req: Request):
    u = user_of(req, required=False)
    return {"user": u}

@app.get("/api/me/stats")
def me_stats(req: Request):
    u = user_of(req)
    con = db()
    mine = con.execute("SELECT COUNT(*) c FROM documents WHERE owner_id=? AND deleted_at IS NULL",
                       (u["id"],)).fetchone()["c"]
    favs = con.execute("SELECT COUNT(*) c FROM favorites WHERE user_id=?", (u["id"],)).fetchone()["c"]
    got = con.execute("SELECT COALESCE(SUM(downloads),0) d FROM documents WHERE owner_id=? "
                      "AND deleted_at IS NULL", (u["id"],)).fetchone()["d"]
    return {"mine": mine, "favorites": favs, "downloads_on_mine": got}

# ---------------------------------------------------------------- courses
@app.get("/api/courses")
def courses(req: Request):
    rows = db().execute(
        "SELECT c.*, (SELECT COUNT(*) FROM documents d WHERE d.course_id=c.id "
        "AND d.deleted_at IS NULL) n FROM courses c ORDER BY c.code").fetchall()
    return {"items": [dict(r) for r in rows]}

@app.post("/api/courses")
async def add_course(req: Request):
    u = user_of(req)
    b = await req.json()
    code = safe_title(b.get("code", "")).upper()
    title = safe_title(b.get("title", ""))
    if len(code) < 2 or len(title) < 3:
        raise HTTPException(422, "Course code and title (3+ chars) are required")
    con = db()
    if con.execute("SELECT 1 FROM courses WHERE code=?", (code,)).fetchone():
        raise HTTPException(409, "A course with that code already exists")
    cur = con.execute("INSERT INTO courses(code,title,dept,semester,created_at) VALUES (?,?,?,?,?)",
                      (code, title, safe_title(b.get("dept", "")),
                       safe_title(b.get("semester", "")), now()))
    con.commit()
    return {"id": cur.lastrowid, "code": code, "title": title, "n": 0}

@app.delete("/api/courses/{cid}")
def del_course(cid: int, req: Request):
    u = user_of(req)
    if u["role"] != "teacher":
        raise HTTPException(403, "Only teachers can delete courses")
    con = db()
    busy = con.execute("SELECT 1 FROM documents WHERE course_id=? AND deleted_at IS NULL",
                       (cid,)).fetchone()
    if busy:
        raise HTTPException(409, "Move or delete this course's documents first")
    con.execute("DELETE FROM courses WHERE id=?", (cid,))
    con.commit()
    return {"ok": True}

# ---------------------------------------------------------------- documents
@app.get("/api/documents")
def list_docs(req: Request):
    u = user_of(req, required=False)
    me = u["id"] if u else None
    q = q_all(req)
    scope, term = q.get("scope", "all"), f"%{q.get('q','').strip()}%"
    qcourse, qtype, sort = q.get("course", ""), q.get("type", ""), q.get("sort", "recent")
    page = max(1, int(q.get("page", 1)))
    per = 12
    W = ["d.deleted_at IS NULL"]
    P = []
    if scope == "mine" and me:
        W.append("d.owner_id=?"); P.append(me)
    if scope == "favorites" and me:
        W.append("d.id IN (SELECT doc_id FROM favorites WHERE user_id=?)"); P.append(me)
    if qcourse.isdigit():
        W.append("d.course_id=?"); P.append(int(qcourse))
    if qtype in ("book", "slides", "notes", "archive"):
        W.append("d.type=?"); P.append(qtype)
    if q.get("q", "").strip():
        W.append("(d.title LIKE ? OR d.description LIKE ? OR d.tags LIKE ?)")
        P += [term, term, term]
    order = {"downloads": "d.downloads DESC", "title": "d.title COLLATE NOCASE ASC",
             "views": "d.views DESC"}.get(sort, "d.created_at DESC")
    where = " AND ".join(W)
    con = db()
    total = con.execute(f"SELECT COUNT(*) t FROM documents d WHERE {where}", P).fetchone()["t"]
    rows = con.execute(
        f"SELECT d.* FROM documents d WHERE {where} ORDER BY {order} LIMIT ? OFFSET ?",
        P + [per, (page - 1) * per]).fetchall()
    items = [row_doc(con, r, me) for r in rows]
    return {"total": total, "page": page, "pages": max(1, -(-total // per)), "items": items}

def parse_upload(b):
    title = safe_title(b.get("title", ""))
    if len(title) < 3:
        raise HTTPException(422, "Title must be at least 3 characters")
    f = b.get("file") or {}
    fname = str(f.get("name", "")).strip()
    ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
    if ext not in ALLOWED_EXT:
        raise HTTPException(422, "Unsupported file type — allowed: " + ", ".join(sorted(ALLOWED_EXT)))
    try:
        raw = b64.b64decode(f.get("data_b64", ""), validate=True)
    except Exception:
        raise HTTPException(422, "Corrupted upload payload")
    if not raw:
        raise HTTPException(422, "The file appears to be empty")
    if len(raw) > MAX_UPLOAD:
        raise HTTPException(413, f"File exceeds the {MAX_UPLOAD // 1048576} MB limit")
    dtype = b.get("type", "book")
    if dtype not in ("book", "slides", "notes", "archive"):
        dtype = {"pptx": "slides", "ppt": "slides", "zip": "archive"}.get(ext, "book")
    tags = ",".join(t for t in (x.strip().lower() for x in str(b.get("tags", "")).split(","))
                    if t and len(t) <= 24)[:120]
    return title, fname, ext, raw, dtype, b.get("description", ""), b.get("course_id"), tags

@app.post("/api/documents")
async def create_doc(req: Request):
    u = user_of(req)
    title, fname, ext, raw, dtype, desc, course_id, tags = parse_upload(await req.json())
    stored, sha, size = save_bytes(fname, raw)
    pix = None
    if ext == "pdf":                      # render a card thumbnail for PDFs
        try:
            import fitz
            d = fitz.open(file_path(stored))
            pix = d[0].get_pixmap(matrix=fitz.Matrix(1.5, 1.5))
            d.close()
        except Exception:
            pix = None
    con = db()
    cur = con.execute(
        "INSERT INTO documents(owner_id,course_id,title,description,type,filename,"
        "stored_name,mime,size,sha,tags,downloads,views,created_at,updated_at) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,0,0,?,?)",
        (u["id"], int(course_id) if str(course_id or "").isdigit() else None, title,
         safe_title(desc), dtype, fname, stored, MIME.get(ext, "application/octet-stream"),
         size, sha, tags, now(), now()))
    did = cur.lastrowid
    if pix is not None:
        try:
            pix.save(os.path.join(THUMB_DIR, f"doc{did}.png"))
        except Exception:
            pass
    con.commit()
    return row_doc(con, con.execute("SELECT * FROM documents WHERE id=?", (did,)).fetchone(), u["id"])

@app.get("/api/documents/{did}")
def get_doc(did: int, req: Request):
    u = user_of(req, required=False)
    con = db()
    r = con.execute("SELECT * FROM documents WHERE id=? AND deleted_at IS NULL", (did,)).fetchone()
    if not r:
        raise HTTPException(404, "Document not found")
    con.execute("UPDATE documents SET views = views + 1 WHERE id=?", (did,))
    con.commit()
    d = row_doc(con, r, u["id"] if u else None)
    d["views"] += 1
    d["can_edit"] = bool(u and (u["id"] == r["owner_id"] or u["role"] == "teacher"))
    return d

@app.put("/api/documents/{did}")
async def upd_doc(did: int, req: Request):
    u = user_of(req)
    con = db()
    r = con.execute("SELECT * FROM documents WHERE id=? AND deleted_at IS NULL", (did,)).fetchone()
    if not r:
        raise HTTPException(404, "Document not found")
    if r["owner_id"] != u["id"] and u["role"] != "teacher":
        raise HTTPException(403, "Only the owner (or a teacher) can edit this")
    b = await req.json()
    title = safe_title(b.get("title", r["title"]))
    if len(title) < 3:
        raise HTTPException(422, "Title must be at least 3 characters")
    dtype = b.get("type", r["type"])
    if dtype not in ("book", "slides", "notes", "archive"):
        dtype = r["type"]
    tags = ",".join(t for t in (x.strip().lower() for x in str(b.get("tags", "")).split(","))
                    if t and len(t) <= 24)[:120]
    con.execute(
        "UPDATE documents SET title=?, description=?, type=?, course_id=?, tags=?, updated_at=? "
        "WHERE id=?",
        (title, safe_title(b.get("description", r["description"])), dtype,
         int(b["course_id"]) if str(b.get("course_id", "")).isdigit() else None,
         tags, now(), did))
    con.commit()
    return row_doc(con, con.execute("SELECT * FROM documents WHERE id=?", (did,)).fetchone(), u["id"])

@app.delete("/api/documents/{did}")
def del_doc(did: int, req: Request):
    u = user_of(req)
    con = db()
    r = con.execute("SELECT * FROM documents WHERE id=? AND deleted_at IS NULL", (did,)).fetchone()
    if not r:
        raise HTTPException(404, "Document not found")
    if r["owner_id"] != u["id"] and u["role"] != "teacher":
        raise HTTPException(403, "Only the owner (or a teacher) can delete this")
    con.execute("UPDATE documents SET deleted_at=? WHERE id=?", (now(), did))
    con.commit()
    return {"ok": True, "soft": True}

@app.post("/api/documents/{did}/restore")
def restore_doc(did: int, req: Request):
    u = user_of(req)
    con = db()
    r = con.execute("SELECT * FROM documents WHERE id=? AND deleted_at IS NOT NULL", (did,)).fetchone()
    if not r:
        raise HTTPException(404, "Nothing to restore")
    if r["owner_id"] != u["id"] and u["role"] != "teacher":
        raise HTTPException(403, "Not yours to restore")
    con.execute("UPDATE documents SET deleted_at=NULL WHERE id=?", (did,))
    con.commit()
    return {"ok": True}

@app.post("/api/documents/{did}/favorite")
def fav_doc(did: int, req: Request):
    u = user_of(req)
    con = db()
    if not con.execute("SELECT 1 FROM documents WHERE id=? AND deleted_at IS NULL",
                       (did,)).fetchone():
        raise HTTPException(404, "Document not found")
    on = con.execute("SELECT 1 FROM favorites WHERE user_id=? AND doc_id=?",
                     (u["id"], did)).fetchone() is None
    if on:
        con.execute("INSERT INTO favorites(user_id,doc_id,created_at) VALUES (?,?,?)",
                    (u["id"], did, now()))
    else:
        con.execute("DELETE FROM favorites WHERE user_id=? AND doc_id=?", (u["id"], did))
    con.commit()
    return {"favorited": on}

@app.get("/api/documents/{did}/download")
def download_doc(did: int, req: Request):
    user_of(req)
    con = db()
    r = con.execute("SELECT * FROM documents WHERE id=? AND deleted_at IS NULL", (did,)).fetchone()
    if not r:
        raise HTTPException(404, "Document not found")
    con.execute("UPDATE documents SET downloads = downloads + 1 WHERE id=?", (did,))
    con.commit()
    p = file_path(r["stored_name"])
    if not os.path.exists(p):
        raise HTTPException(410, "Stored file is missing — re-upload it")
    return FileResponse(p, filename=r["filename"], media_type=r["mime"] or None)

@app.get("/api/documents/{did}/preview")
def preview_doc(did: int, req: Request):
    user_of(req)
    con = db()
    r = con.execute("SELECT * FROM documents WHERE id=? AND deleted_at IS NULL", (did,)).fetchone()
    if not r:
        raise HTTPException(404, "Document not found")
    p = file_path(r["stored_name"])
    if r["mime"] != "application/pdf" or not os.path.exists(p):
        raise HTTPException(415, "Inline preview is available for PDFs only")
    return FileResponse(p, media_type="application/pdf",
                        headers={"Content-Disposition": "inline"})

@app.get("/api/documents/{did}/thumb")
def thumb_doc(did: int, req: Request):
    p = os.path.join(THUMB_DIR, f"doc{int(did)}.png")
    if not os.path.exists(p):
        raise HTTPException(404, "no thumbnail")
    return FileResponse(p, media_type="image/png",
                        headers={"Cache-Control": "public, max-age=3600"})

# ---------------------------------------------------------------- dashboard
@app.get("/api/stats")
def stats(req: Request):
    u = user_of(req, required=False)
    me = u["id"] if u else None
    con = db()
    tot = con.execute("SELECT COUNT(*) n, COALESCE(SUM(size),0) b, COALESCE(SUM(downloads),0) d,"
                      " COALESCE(SUM(views),0) v FROM documents WHERE deleted_at IS NULL").fetchone()
    nc = con.execute("SELECT COUNT(*) n FROM courses").fetchone()["n"]
    def pack(rows):
        return [row_doc(con, r, me) for r in rows]
    recent = pack(con.execute("SELECT d.* FROM documents d WHERE d.deleted_at IS NULL "
                              "ORDER BY d.created_at DESC LIMIT 6").fetchall())
    top = pack(con.execute("SELECT d.* FROM documents d WHERE d.deleted_at IS NULL "
                           "ORDER BY d.downloads DESC LIMIT 5").fetchall())
    bycourse = [dict(r) for r in con.execute(
        "SELECT c.code, c.title, COUNT(d.id) n, COALESCE(SUM(d.downloads),0) d "
        "FROM courses c LEFT JOIN documents d ON d.course_id=c.id AND d.deleted_at IS NULL "
        "GROUP BY c.id ORDER BY d DESC LIMIT 6").fetchall()]
    return {"totals": {"documents": tot["n"], "bytes": tot["b"], "downloads": tot["d"],
                       "views": tot["v"], "courses": nc},
            "recent": recent, "top": top, "by_course": bycourse,
            "me": {"name": u["name"].split()[0], "role": u["role"]} if u else None}

# ---------------------------------------------------------------- SPA
@app.get("/")
def index():
    return FileResponse(os.path.join(store.STATIC_DIR, "index.html"))

app.mount("/assets", StaticFiles(directory=store.STATIC_DIR), name="assets")
