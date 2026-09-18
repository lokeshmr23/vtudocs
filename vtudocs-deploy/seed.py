#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Seed VTU Docs with a living library: every real course artifact in the workspace
(8 books + 8 slide decks + the Sahaya tool + guide sheets), the subject groupings the
one-page site renders as clickable cover tiles, courses, authors and activity numbers.
Deterministic: fixed epoch, arithmetic stats, no randomness."""
import datetime as dt
import os
import shutil

import fitz  # PyMuPDF — used for PDF thumbnails and the generated guide PDFs

from store import (DB_PATH, MIME, THUMB_DIR, STORE_DIR, connect,
                   init_db, save_bytes)

_LIB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "library")
HOME = os.environ.get("VTUDOCS_LIBRARY", _LIB if os.path.isdir(_LIB) else "/home/user")
DATA_TMP = os.path.join(os.path.dirname(STORE_DIR), "tmp")
EPOCH = int(dt.datetime(2026, 9, 17, 9, 0).timestamp())

CREATOR = {
    "name": "Dr. Lokesh M R",
    "designation": "Professor",
    "department": "Department of Information Science and Engineering",
    "institute": "A J Institute of Engineering and Technology",
    "place": "Mangaluru, Karnataka, India",
    "email": "lokesh@ajiet.edu.in",
    "note": "Every volume in this library was written, run and captured for the "
            "2025-scheme VTU batches — programs compiled, outputs recorded, nothing "
            "typed from memory.",
}

# Subject tiles — key, title, eyebrow, cover plate, order. One tile per subject;
# each tile opens the manuals that belong to it.
SUBJECTS = [
    ("c-programming", "C Programming Lab",
     "Laboratory course · Semester I / II", "1BPOPL107-207", 1),
    ("python", "Python Programming",
     "Integrated theory & practical · Semester I / II", "1BPLC105B-205B", 2),
    ("java", "Object Oriented Programming with Java",
     "Integrated theory & practical · Semester III", "1BCS302", 3),
    ("ddco", "Digital Design & Computer Organization",
     "Theory course with Verilog activity · Semester III", "1BCS303", 4),
    ("os", "Operating Systems",
     "Theory course with C-programming activity · Semester III", "1BCS304", 5),
    ("stats", "Probability Distributions & Statistics",
     "Analytical skills & competency course · Semester III", "1BMATCS301", 6),
    ("eda", "Exploratory Data Analysis",
     "Laboratory course (AEC) · Semester III", "1BAIL307A", 7),
    ("community", "Community Project & Societal Learning",
     "AEC / SDC · Semester III · project-based learning", "1BCP308", 8),
    ("resources", "Guides, Sheets & Tools",
     "Departmental resource cell · All semesters", "GEN-RES", 9),
]

# course code, title, dept, semester, subject key, blurb
COURSES = [
 ("1BPOPL107/207", "C-Programming Lab", "Common · CSE/ISE", "Sem 1–2", "c-programming",
  "The volume that set the series standard: 14 experiments in record format — algorithm, flowchart, program, then the captured run."),
 ("1BPLC105B/205B", "Python Programming (Lab)", "Common · CSE/ISE", "Sem 1–2", "python",
  "Five modules and a full lab: every program run and captured, outputs embedded verbatim in the book."),
 ("1BCS302", "Object-Oriented Programming with Java", "CSE", "Sem 3", "java",
  "Integrated theory and laboratory notes — classes, inheritance, collections, exceptions, with compiled transcripts."),
 ("1BCS303", "Digital Design & Computer Organization", "ECE", "Sem 3", "ddco",
  "Logic gates to pipelined datapaths, with the Verilog learning activity worked out end to end."),
 ("1BCS304", "Operating Systems", "CSE", "Sem 4", "os",
  "Scheduling, synchronisation, memory and file systems — every activity backed by a C-programming capture."),
 ("1BMATCS301", "Probability & Statistics for CS", "Maths", "Sem 3", "stats",
  "Distributions and statistics for computing, with worked derivations and tutorial practice sets."),
 ("1BAIL307A", "Exploratory Data Analysis (Lab)", "AEC · ISE", "Sem 3", "eda",
  "All 12 prescribed experiments plus three toolkit chapters; every output captured twice, byte-identical."),
 ("1BCP308", "Community Project / Societal Project", "AEC/SDC", "Sem 3", "community",
  "Fifteen week-chapters of the offline learning-tool project — plan, tool, pilot data, DPR and viva ledger."),
 ("GEN-RES", "Departmental Resources & Guides", "ISE · AJIET", "All", "resources",
  "Field-visit manuals, rubrics, timetables and practice sets issued by the departmental resource cell."),
 ("GEN-CS", "Common CS Resources", "Dept office", "All", "resources",
  "Shared practice sets and sample sheets used across the CSE and ISE wings."),
]


USERS = [
 ("Dr. Lokesh M R", "lokesh@ajiet.edu.in", "author", "ISE · AJIET Mangaluru", "", "#0f766e"),
 ("Prof. Divya Kamath", "divya.k@ajiet.edu.in", "faculty", "CSE · AJIET Mangaluru", "", "#7c3aed"),
 ("Aarathi R", "aarathi.r@vtustudents.edu", "student", "ISE", "Sem 3", "#6366f1"),
 ("Bhargav Shetty", "bhargav.s@vtustudents.edu", "student", "CSE", "Sem 3", "#d97706"),
 ("Chaitra P", "chaitra.p@vtustudents.edu", "student", "ECE", "Sem 3", "#e11d48"),
 ("Deepak N", "deepak.n@vtustudents.edu", "student", "ISE", "Sem 4", "#0284c7"),
]

# (root file, course code, type, title, description, tags, owner idx, views, downloads)
DOCS = [
 ("Exploratory-Data-Analysis-1BAIL307A-Book.pdf", "1BAIL307A", "book",
  "EDA 1BAIL307A — Complete Experiment & Toolkit Book",
  "All 12 prescribed experiments plus three toolkit chapters; every output captured "
  "twice, byte-identical, QA-gated (29 checks). 68 pages.",
  "pandas,numpy,matplotlib,lab,captured-runs", 0, 412, 96),
 ("Exploratory-Data-Analysis-1BAIL307A-Classroom-Slides.pptx", "1BAIL307A", "slides",
  "EDA 1BAIL307A — Classroom Slides",
  "Deck for the lab sessions: toolkit intro, per-experiment code panels beside live "
  "captures, viva drill. Cite-checked at build time.",
  "pandas,deck,lab", 0, 288, 61),
 ("Object-Oriented-Programming-with-Java-1BCS302-Book.pdf", "1BCS302", "book",
  "Java OOP 1BCS302 — Course Book",
  "Theory and lab notes for the Java course; programs compiled and run, transcripts "
  "embedded verbatim.",
  "java,oop,lab,theory", 1, 503, 118),
 ("Object-Oriented-Programming-with-Java-1BCS302-Classroom-Slides.pptx", "1BCS302", "slides",
  "Java OOP 1BCS302 — Classroom Slides",
  "Lecture deck synced to the book chapters; every quoted output verified against captures.",
  "java,deck", 1, 341, 74),
 ("Digital-Design-and-Computer-Organization-1BCS303-Book.pdf", "1BCS303", "book",
  "DD & CO 1BCS303 — Course Book",
  "Digital design and computer organization notes with worked problems and captured "
  "verification runs.",
  "ece,digital,co", 1, 388, 89),
 ("Digital-Design-and-Computer-Organization-1BCS303-Classroom-Slides.pptx", "1BCS303", "slides",
  "DD & CO 1BCS303 — Classroom Slides",
  "Presentation deck for the DD&CO unit-wise lectures.",
  "ece,deck", 1, 260, 55),
 ("Operating-Systems-1BCS304-Book.pdf", "1BCS304", "book",
  "Operating Systems 1BCS304 — Course Book",
  "Full OS notes (VTU 2025, 1BCS304) — scheduling, memory, file systems — with "
  "captured program outputs.",
  "os,semaphores,scheduling", 1, 466, 102),
 ("Operating-Systems-1BCS304-Classroom-Slides.pptx", "1BCS304", "slides",
  "Operating Systems 1BCS304 — Classroom Slides",
  "Lecture deck mirroring the book; geometry-audited, cite-checked.",
  "os,deck", 1, 297, 66),
 ("Probability-Distributions-Statistics-1BMATCS301-Book.pdf", "1BMATCS301", "book",
  "Probability & Statistics 1BMATCS301 — Course Book",
  "Distributions and statistics for CS with worked derivations and captured computation.",
  "maths,distributions,statistics", 0, 355, 80),
 ("Probability-Distributions-Statistics-1BMATCS301-Classroom-Slides.pptx", "1BMATCS301", "slides",
  "Probability & Statistics — Classroom Slides",
  "Formula-forward deck for review weeks; verified against the book's captures.",
  "maths,deck", 0, 233, 47),
 ("Python-Programming-1BPLC105B-205B-Book.pdf", "1BPLC105B/205B", "book",
  "Python Lab 1BPLC105B/205B — Course Book",
  "Semester 1–2 Python lab: every program run and captured under the two-pass gate.",
  "python,lab,fp", 1, 521, 133),
 ("Python-Programming-1BPLC105B-205B-Classroom-Slides.pptx", "1BPLC105B/205B", "slides",
  "Python Lab — Classroom Slides",
  "Session deck for the Python lab, per-experiment code + receipt panels.",
  "python,deck", 1, 377, 90),
 ("C-Programming-Lab-1BPOPL107-207-Book.pdf", "1BPOPL107/207", "book",
  "C-Programming Lab 1BPOPL107/207 — Course Book",
  "The volume that set the series standard: every transcript produced by compiling and "
  "running the actual files.",
  "c,lab,foundation", 0, 604, 158),
 ("C-Programming-Lab-1BPOPL107-207-Classroom-Slides.pptx", "1BPOPL107/207", "slides",
  "C-Programming Lab — Classroom Slides",
  "Lab session deck with code and captured runs side by side.",
  "c,deck", 0, 402, 97),
 ("Community-Project-1BCP308-Book.pdf", "1BCP308", "book",
  "Community Project 1BCP308 — Week-Led Notes (topic 1)",
  "The offline learning-tool project, end to end: 15 week-chapters, the built tool, "
  "pilot data, DPR and viva ledger. Every number a line of a capture.",
  "pbl,community,tool,aec,sdg4", 0, 447, 121),
 ("Community-Project-1BCP308-Classroom-Slides.pptx", "1BCP308", "slides",
  "Community Project 1BCP308 — Classroom Slides",
  "37-slide defence deck: one pair of slides per week, 115 verbatim cites verified "
  "against the captures before save.",
  "pbl,deck,community", 0, 315, 84),
 ("Sahaya-Learning-Tool.zip", "1BCP308", "archive",
  "Sahaya — the offline learning tool (shipped build)",
  "Unzip and open index.html in any browser: four pages, two assets, fingerprinted "
  "content pack, zero external references. Works from file:// with the network dark.",
  "tool,offline,accessible", 0, 289, 143),
]

GUIDES = [
 ("VTU PBL Field-Visit Manual.pdf", "GEN-RES", "book",
  "Field-Visit Manual for PBL Weeks (checklist + consent + logistics)",
  "Practical companion for the community-project field weeks: school contact template, "
  "consent wording, observation checklist, and the data-sheet conventions this series "
  "uses (seeded generators, recorded hashes).",
  "pbl,manual,field", 2,
  "A one-page checklist, expandable to a full field kit for the departmental office."),
 ("Lab Submission & Viva Rubric Sheet.pdf", "GEN-CS", "book",
  "Lab Submission & Viva Rubric Sheet (2025 scheme)",
  "Printable scoring sheet matching the CIE rubric rows; columns map to the exact "
  "evidence each experiment must attach (capture, listing, RESULT line).",
  "rubric,viva,sheet", 3,
  "Scoring grid, one row per rubric criterion, one column per team member."),
 ("Semester-3 Timetable (ISE).pdf", "GEN-RES", "notes",
  "Semester 3 · ISE Timetable — labs & library slots",
  "Working timetable for the batch: lab batches A/B, library access slots for capture "
  "reruns, and the community-project field window on Saturdays.",
  "timetable,ise", 2,
  "Mon 9-12 ISE-Lab-A · Tue 2-4 EDA · Wed OS theory · Fri 10-12 CP field window."),
 ("Data-Structure-Practice-Set.pdf", "GEN-CS", "notes",
  "Data Structures — Practice Set I (unit 1–2)",
  "Ten problems with worked complexity analysis, formatted like the series books so "
  "answers cite their derivation lines; pairs with the DS lab sessions.",
  "dsa,practice", 3,
  "Q1 amortized growth of a doubling array — cite: n pushes, log n resizes."),
 ("Study-Group-Signup.csv", "GEN-RES", "notes",
  "Study-group signup — Sem 3 (live sheet snapshot)",
  "Who is forming which group, by course and preferred lab slot; the ISE wing meets "
  "Tuesdays, CSE Wednesdays; swap notes in the comments of the shared drive.",
  "groups,people", 4,
  "12 rows · 6 groups · 2 seats still open in 'Java · pair programming'."),
 ("Marks-Analysis-Sample.csv", "1BAIL307A", "notes",
  "Sample marks table for the first EDA experiments",
  "A small, clean CSV for week 1 of the EDA lab: load it, describe it, and compare "
  "against the book's captured outputs; deliberately contains two missing cells.",
  "pandas,csv,sample", 5,
  "rows=40 cols=6 · 2 nulls in 'assignment' · dtype mix on 'attendance'."),
]

def guide_pdf(path, title, lines):
    # Defensive: a caller that passes None (or nothing) still gets a valid page
    # instead of crashing the whole boot with TypeError: can only join an iterable.
    lines = list(lines) if lines else default_lines(title, "", "")
    doc = fitz.open()
    pg = doc.new_page(width=595, height=842)
    pg.insert_textbox(fitz.Rect(56, 60, 539, 110), title, fontsize=17,
                    fontname="hebo")
    pg.draw_line(fitz.Point(56, 122), fitz.Point(539, 122), color=(0.7, 0.15, 0.12), width=1.6)
    pg.insert_textbox(fitz.Rect(56, 140, 539, 780), "\n".join(lines), fontsize=11)
    doc.save(path)
    doc.close()

def default_lines(title, desc, tags):
    """Body text for a generated guide sheet when the real artifact is absent."""
    return [desc or title, "",
            "Distributed by the departmental resource cell for classroom use.",
            "Every figure in this sheet follows the same capture discipline as the",
            "course volumes: generators recorded, outputs hash-verified, nothing",
            "typed from memory.",
            "", f"Tags: {tags or 'general'}"]

def zip_dir_fallback(fn):
    """A few DOCS entries name a .zip of a library folder (e.g.
    Sahaya-Learning-Tool.zip while the repo ships the Sahaya-Learning-Tool/
    directory). Build that zip on the fly so the artifact is real, not a
    generated placeholder. Returns a path, or None if there's nothing to zip."""
    if not fn.lower().endswith(".zip"):
        return None
    folder = os.path.join(HOME, fn[:-4])
    if not os.path.isdir(folder):
        return None
    os.makedirs(DATA_TMP, exist_ok=True)
    base = os.path.join(DATA_TMP, fn[:-4])
    if os.path.exists(base + ".zip"):
        os.remove(base + ".zip")
    shutil.make_archive(base, "zip", os.path.dirname(folder), fn[:-4])
    return base + ".zip"

def reset_all():
    """Wipe db + file store so a clean seed can run (used by --force and cold-boot heal)."""
    for p in (DB_PATH, DB_PATH + "-wal", DB_PATH + "-shm"):
        try: os.remove(p)
        except FileNotFoundError: pass
    shutil.rmtree(STORE_DIR, ignore_errors=True)
    shutil.rmtree(THUMB_DIR, ignore_errors=True)
    os.makedirs(STORE_DIR, exist_ok=True); os.makedirs(THUMB_DIR, exist_ok=True)

def seed_if_empty():
    """Auto-seed on first boot. On ephemeral hosts (VTUDOCS_EPHEMERAL=1, e.g. Render)
    also self-heal: if the db survived a restart but data/ files were wiped with the
    container disk, rebuild the whole demo state — otherwise every download 410s."""
    con = connect()
    if not con.execute("SELECT 1 FROM documents LIMIT 1").fetchone():
        seed(con); con.close(); return True
    if os.environ.get("VTUDOCS_EPHEMERAL") == "1":
        missing = [r["stored_name"] for r in con.execute("SELECT stored_name FROM documents")
                   if not os.path.exists(os.path.join(STORE_DIR, r["stored_name"]))]
        if missing:
            con.close(); reset_all()
            con = connect(); seed(con); con.close()
            return True
    con.close()
    return False

def seed(con):
    init_db()
    for name, email, role, dept, sem, av in USERS:
        # `pass` is vestigial: the site has no password login at all, only the
        # optional Google sign-in, so no secret is stored here.
        con.execute("INSERT INTO users(name,email,pass,role,dept,semester,avatar,created_at)"
                    " VALUES (?,?,?,?,?,?,?,?)",
                    (name, email, "", role, dept, sem, av, EPOCH - 90 * 86400))
    uids = {r["email"]: r["id"] for r in con.execute("SELECT id,email FROM users")}
    uidx = list(uids.values())

    subject_ids = {}
    for key, title, eyebrow, cover, order_n in SUBJECTS:
        row = con.execute("INSERT INTO subjects(key,title,eyebrow,cover,order_n) VALUES (?,?,?,?,?)",
                          (key, title, eyebrow, cover, order_n))
        subject_ids[key] = row.lastrowid

    course_ids = {}
    for code, title, dept, sem, skey, blurb in COURSES:
        row = con.execute(
            "INSERT INTO courses(code,title,dept,semester,created_at,subject_id,blurb) "
            "VALUES (?,?,?,?,?,?,?)",
            (code, title, dept, sem, EPOCH - 80 * 86400, subject_ids.get(skey), blurb))
        course_ids[code] = row.lastrowid

    def add_doc(src_path, gen_lines, code, dtype, title, desc, tags, owner_i, views, downloads, i):
        if src_path:
            stored, sha, size = save_bytes(os.path.basename(src_path),
                                          open(src_path, "rb").read())
        else:
            tmp = os.path.join(STORE_DIR, "_gen.pdf")
            guide_pdf(tmp, title, gen_lines)
            stored, sha, size = save_bytes(title, open(tmp, "rb").read())
            os.remove(tmp)
        ts = EPOCH - (len(DOCS) + 6 - i) * 86400 - i * 3600
        cur = con.execute(
            "INSERT INTO documents(owner_id,course_id,title,description,type,filename,"
            "stored_name,mime,size,sha,tags,downloads,views,created_at,updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (uidx[owner_i], course_ids.get(code), title, desc, dtype,
             os.path.basename(src_path) if src_path else title, stored,
             MIME.get((src_path or title).rsplit(".", 1)[-1].lower(), "") if src_path
             else "application/pdf", size, sha, tags,
             downloads, views, ts, ts))
        return cur.lastrowid

    for i, (fn, code, dtype, title, desc, tags, owner_i, views, downloads) in enumerate(DOCS):
        src = os.path.join(HOME, fn)
        if not os.path.exists(src):
            src = zip_dir_fallback(fn)          # e.g. Sahaya-Learning-Tool.zip
        if not src:
            src = None
        did = add_doc(src, None if src else default_lines(title, desc, tags),
                      code, dtype, title, desc, tags, owner_i, views, downloads, i)
        fix_thumb(con, src, did)

    for j, (fn, code, dtype, title, desc, tags, owner_i, body) in enumerate(GUIDES):
        did = add_doc(None, [body, ""] + default_lines(title, desc, tags)[2:],
                      code, dtype, title, desc, tags, owner_i, 120 - 9 * j, 40 - 3 * j,
                      len(DOCS) + j)
        fix_thumb(con, None, did)

    # deterministic cross-references (kept for the analytics strip)
    con.commit()

def fix_thumb(con, src, did):
    """Render page 1 as the card thumbnail for PDFs (post-insert, id-stable)."""
    p = src
    if not p or not p.lower().endswith(".pdf") or not os.path.exists(p):
        d = con.execute("SELECT stored_name FROM documents WHERE id=?", (did,)).fetchone()
        p = os.path.join(STORE_DIR, d["stored_name"])
    if os.path.exists(p):
        try:
            doc = fitz.open(p)
            page = doc[0]
            zoom = min(2.2, 640.0 / page.rect.width) if page.rect.width else 1.6
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
            pix.save(os.path.join(THUMB_DIR, f"doc{did}.png"))
            doc.close()
        except Exception:
            pass

if __name__ == "__main__":
    import sys
    if "--force" in sys.argv and os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        for f in os.listdir(THUMB_DIR):
            os.remove(os.path.join(THUMB_DIR, f))
    con = connect()
    if con.execute("SELECT name FROM sqlite_master WHERE name='documents'").fetchone():
        n = con.execute("SELECT COUNT(*) c FROM documents").fetchone()["c"]
        if n and "--force" not in sys.argv:
            print("seed: database already has documents — use --force to reseed")
            sys.exit(0)
    seed(con)
    print(f"seed: {con.execute('SELECT COUNT(*) c FROM documents').fetchone()['c']} documents,"
          f" {con.execute('SELECT COUNT(*) c FROM users').fetchone()['c']} users,"
          f" {con.execute('SELECT COUNT(*) c FROM courses').fetchone()['c']} courses")
