# Deploying VTU Docs (free tier) — one public page, no login

This folder is the complete, git-ready app: a FastAPI server, a one-page site, the
subject cover plates, and a `library/` folder with the 45 MB of real course PDFs and
slide decks the app seeds itself from on first boot. Written and maintained by
**Dr. Lokesh M R**, Professor, Department of Information Science and Engineering,
A J Institute of Engineering and Technology, Mangaluru.

Anyone who opens the site can read a manual in the browser or download it. There is
no sign-up, no password and no login wall; Google sign-in is optional and off until
you configure it (see `GOOGLE-SIGNIN.md`).

## One-time: push to GitHub

    gh repo create vtudocs --public --source . --push       # from the repo root
    # or: git remote add origin git@github.com:YOU/vtudocs.git && git push -u origin main

The repository root already contains `render.yaml`, which points Render at this
subfolder via `rootDir: vtudocs-deploy`.

## Create the Render service

1. [render.com](https://render.com) → **Sign up with GitHub** (no card needed for free).
2. **New +** → **Blueprint** → pick the repo → Render reads `render.yaml` → **Apply**.
   *Manual alternative:* New → Web Service → same repo → root directory `vtudocs-deploy`
   → Runtime **Python** → Build `pip install -r requirements.txt`
   → Start `uvicorn server:app --host 0.0.0.0 --port $PORT` → Free instance
   → env var `VTUDOCS_EPHEMERAL=1`.
3. Wait for the build (~2 min). First boot seeds 23 documents, 9 subject covers and
   22 page thumbnails, then the site is live.

## What the free tier will and won't do

- **Cold starts**: the service sleeps after ~15 min idle; the first visitor waits
  30–60 s while it boots and re-seeds. Everything after is fast.
- **Ephemeral disk**: `data/` is wiped on every deploy/restart, so
  `VTUDOCS_EPHEMERAL=1` makes each cold boot rebuild the library from `library/` and
  `cover-art/`. The library is read-only from the browser, so nothing a visitor does
  can be lost. (Uploaded files are not part of the product any more.)
- **Google sign-in**: off by default. Set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`
  to switch it on; set `VTUDOCS_SECRET` so signed-in readers survive a restart.
- **512 MB RAM / light CPU**: fine for a class, not for a campus-wide rollout.
- Outgrowing it: **Starter ($7/mo)** on the same service, or the same repo on an
  Oracle Always-Free ARM VM with a persistent disk.

## Smoke checklist (run against your live URL)

    curl -s https://<service>.onrender.com/api/auth/config     # {"google":false} by default
    curl -s https://<service>.onrender.com/api/library | head -c 120
    # browser: subject tiles show their covers · click "Operating Systems" → shelf opens
    # → "Read" renders the PDF inline · "Download" saves the same file (bytes match)
    # → search "python", filter to "Classroom slides", sort by newest
    # footer credits Dr. Lokesh M R · Department of ISE, AJIET Mangaluru

## Local run, identical to Render

    pip install -r requirements.txt
    VTUDOCS_EPHEMERAL=1 python3 -m uvicorn server:app --host 0.0.0.0 --port 8010
    # open http://localhost:8010

## Rebuilding the subject covers

    python3 covers.py            # all nine plates → static/covers/*.jpg
    python3 covers.py 1BCS304    # just one

Artwork lives in `cover-art/`; the titles, course codes and the author credit are
drawn as vector text on top (see `covers.py`), so they are always sharp and spelled
exactly right.
