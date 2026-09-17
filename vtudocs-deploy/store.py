#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Shared storage layer for VTU Docs: paths, schema, auth primitives."""
import base64, hashlib, hmac, json, os, re, sqlite3, time

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
STORE_DIR = os.path.join(DATA, "files")
THUMB_DIR = os.path.join(DATA, "thumbs")
DB_PATH = os.path.join(DATA, "vtudocs.db")
STATIC_DIR = os.path.join(ROOT, "static")
for d in (DATA, STORE_DIR, THUMB_DIR):
    os.makedirs(d, exist_ok=True)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, pass TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  dept TEXT DEFAULT '', semester TEXT DEFAULT '', avatar TEXT DEFAULT '#6366f1',
  created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS courses(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
  dept TEXT DEFAULT '', semester TEXT DEFAULT '', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS documents(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  course_id INTEGER REFERENCES courses(id),
  title TEXT NOT NULL, description TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'book',
  filename TEXT NOT NULL, stored_name TEXT NOT NULL,
  mime TEXT DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL, sha TEXT NOT NULL, tags TEXT DEFAULT '',
  downloads INTEGER NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  deleted_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_doc_course ON documents(course_id);
CREATE INDEX IF NOT EXISTS idx_doc_owner  ON documents(owner_id);
CREATE TABLE IF NOT EXISTS favorites(
  user_id INTEGER NOT NULL, doc_id INTEGER NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, doc_id));
"""

def connect():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    return con

def init_db():
    connect().executescript(SCHEMA)

def now():
    return int(time.time())

# ---------------------------------------------------------------- passwords
def hash_password(pw):
    salt = os.urandom(12).hex()
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 100_000)
    return f"pbkdf2_sha256$100000${salt}${dk.hex()}"

def verify_password(pw, stored):
    try:
        _alg, iters, salt, hexd = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), int(iters))
        return hmac.compare_digest(dk.hex(), hexd)
    except Exception:
        return False

# ---------------------------------------------------------------- tokens
SECRET_FILE = os.path.join(DATA, "secret.key")
def _secret():
    env = os.environ.get("VTUDOCS_SECRET")
    if env:
        return env.encode()
    if not os.path.exists(SECRET_FILE):
        open(SECRET_FILE, "w").write(os.urandom(32).hex())
    return open(SECRET_FILE).read().strip().encode()

def _b64u(b):  return base64.urlsafe_b64encode(b).decode().rstrip("=")
def _unb64u(s): return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))

def make_token(uid, days=30):
    payload = _b64u(json.dumps({"uid": uid, "exp": now() + days * 86400}).encode())
    sig = _b64u(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{sig}"

def read_token(tok):
    try:
        payload, sig = tok.rsplit(".", 1)
        want = _b64u(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, want):
            return None
        data = json.loads(_unb64u(payload))
        return data if data.get("exp", 0) > now() else None
    except Exception:
        return None

# ---------------------------------------------------------------- files
ALLOWED_EXT = {"pdf", "pptx", "ppt", "zip", "png", "jpg", "jpeg", "csv", "md", "txt"}
MAX_UPLOAD = 60 * 1024 * 1024
MIME = {"pdf": "application/pdf", "pptx": "application/vnd.openxmlformats-officedocument"
        ".presentationml.presentation", "ppt": "application/vnd.ms-powerpoint",
        "zip": "application/zip", "png": "image/png", "jpg": "image/jpeg",
        "jpeg": "image/jpeg", "csv": "text/csv", "md": "text/markdown",
        "txt": "text/plain"}

def save_bytes(name, raw):
    sha = hashlib.sha256(raw).hexdigest()
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else "bin"
    stored = f"{sha[:16]}.{ext}"
    path = os.path.join(STORE_DIR, stored)
    if not os.path.exists(path):
        with open(path, "wb") as f:
            f.write(raw)
    return stored, sha, len(raw)

def file_path(stored):
    return os.path.join(STORE_DIR, os.path.basename(stored))

def safe_title(s):
    return re.sub(r"\s+", " ", str(s)).strip()

def row_doc(con, r, me_id=None):
    if not r:
        return None
    d = dict(r)
    o = con.execute("SELECT name, role, avatar FROM users WHERE id=?",
                    (d["owner_id"],)).fetchone()
    c = con.execute("SELECT code, title, semester, dept FROM courses WHERE id=?",
                    (d["course_id"],)).fetchone() if d["course_id"] else None
    fav = con.execute("SELECT 1 FROM favorites WHERE user_id=? AND doc_id=?",
                      (me_id, d["id"])).fetchone() if me_id else None
    thumb = os.path.exists(os.path.join(THUMB_DIR, f"doc{d['id']}.png"))
    for k in ("owner", "course"):
        d.pop(k, None)
    return {"id": d["id"], "title": d["title"], "description": d["description"],
            "type": d["type"], "filename": d["filename"], "size": d["size"],
            "sha": d["sha"], "tags": [t for t in (d["tags"] or "").split(",") if t],
            "downloads": d["downloads"], "views": d["views"],
            "created_at": d["created_at"], "updated_at": d["updated_at"],
            "owner": dict(o) if o else None, "course": dict(c) if c else None,
            "course_id": d["course_id"], "is_fav": bool(fav), "has_thumb": thumb,
            "mime": d["mime"]}


