# VTU Docs — public course-manual library

A one-page website that gives VTU 2025-scheme students instant access to the course
manuals, lab books and classroom slide decks written for their subjects. No login, no
sign-up, no password — a student clicks a subject cover and reads or downloads the
manual.

**Creator:** Dr. Lokesh M R, Professor, Department of Information Science and
Engineering, A J Institute of Engineering and Technology, Mangaluru, Karnataka.

## What the page does

| Part | Behaviour |
| --- | --- |
| **Hero** | States the deal up front — “no sign-in, open to every student” — with live counts (subjects, manuals, courses, downloads) and the author card. |
| **Subject covers** | Nine illustrated cover plates, one per subject. Click one → its shelf opens with the course book, the classroom slides and any tool/pdf that belongs to it. |
| **Whole shelf** | All 23 manuals with search, subject filter, file-type filter and sorting by downloads / recency / reads / title. |
| **Reader** | PDF manuals open inline in a full-height reader; “Open in new tab” gives the phone-friendly full-screen view. Non-PDF files download directly. |
| **Creator** | Dr. Lokesh M R's profile, the writing rule behind the series (*a number is only written after a capture*) and contact. |
| **Google sign-in** | Optional and off by default. When enabled it only puts a first name in the top bar — nothing is gated. See `vtudocs-deploy/GOOGLE-SIGNIN.md`. |

## Layout of the repository

    render.yaml                 Render blueprint (looks for render.yaml at the repo root)
    vtudocs-deploy/
      server.py                 FastAPI app: public read-only API + optional Google sign-in
      store.py                  SQLite schema, file store, session cookies
      seed.py                   Deterministic seed: subjects, courses, documents, stats
      covers.py                 Builds the subject cover plates (vector text over artwork)
      cover-art/                Text-free background artwork, one per subject
      static/
        index.html              The single page
        app.css                 Design system for the page
        app.js                  Rendering, filters, reader modal, sign-in UI
        covers/*.jpg            Finished cover plates served to the browser
      library/                  The real course PDFs and slide decks (45 MB)
      DEPLOY.md                 Deploying to Render + smoke checklist
      GOOGLE-SIGNIN.md          Optional Google OAuth setup

## Run it locally

```bash
cd vtudocs-deploy
pip install -r requirements.txt
VTUDOCS_EPHEMERAL=1 python3 -m uvicorn server:app --host 0.0.0.0 --port 8010
# → http://localhost:8010
```

First boot seeds the database from `library/`; `VTUDOCS_EPHEMERAL=1` makes every later
boot heal itself if the host wiped `data/`.

## API (all public)

| Route | Purpose |
| --- | --- |
| `GET /api/library` | Everything the page needs: creator, subjects, manuals, totals |
| `GET /api/subjects/{key}` | A single subject with its shelf |
| `GET /api/manuals?q=&subject=&type=&sort=` | Filtered/sorted manual list |
| `GET /api/documents/{id}` | One manual (`?count=true` also counts a read) |
| `GET /api/documents/{id}/preview` | Inline PDF for the reader |
| `GET /api/documents/{id}/download` | The file itself |
| `GET /api/auth/*`, `GET /auth/google*` | Optional Google sign-in |

There are deliberately **no write routes**: the browser cannot upload, edit or delete
anything, and no password is ever stored or checked.

## Credits

All manuals, the capture discipline behind them and the subject cover compositions are
by Dr. Lokesh M R, Department of Information Science and Engineering, A J Institute of
Engineering and Technology, Mangaluru — `lokesh@ajiet.edu.in`.
