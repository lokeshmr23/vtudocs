# Deploying VTU Docs to Render (free tier)

This folder is the complete, git-ready app. Everything it needs lives inside
it — the FastAPI server, the SPA, and a `library/` folder with the 44 MB of
real course PDFs/PPTXs the demo seeds itself from at first boot.

## One-time: push to GitHub

    cd vtudocs-deploy
    git init && git add -A
    git commit -m "VTU Docs — deployable bundle"
    gh repo create vtudocs --public --push --source .   # or make an empty repo on github.com, then:
    # git branch -M main
    # git remote add origin git@github.com:YOU/vtudocs.git
    # git push -u origin main

(The largest file is 6.7 MB — well under GitHub's 100 MB limit. No LFS needed.)

## Create the Render service

1. [render.com](https://render.com) → **Sign up with GitHub** (no credit card needed for the free tier).
2. **New +** → **Blueprint** → pick the `vtudocs` repo. Render finds `render.yaml`
   and previews the service; hit **Apply**.
   *Manual alternative:* New → Web Service → same repo → Runtime **Python** →
   Build `pip install -r requirements.txt` → Start `uvicorn server:app --host 0.0.0.0 --port $PORT`
   → Instance type **Free** → add env var `VTUDOCS_EPHEMERAL=1`.
3. Wait for the build (~2 min: pip install + a 44 MB repo clone). First boot
   auto-seeds: 23 documents, 22 thumbnails, 6 users — then you get
   `https://vtudocs.onrender.com`.

## What the free tier will and won't do (know these before you share the link)

- **Cold starts**: the service sleeps after ~15 min without traffic; the first
  visitor then waits ~30–60 s while it boots and re-seeds. Everything after is fast.
- **Ephemeral disk**: files survive normal uptime, but every redeploy/restart
  wipes `data/`. This app *self-heals* — `VTUDOCS_EPHEMERAL=1` makes each cold
  boot detect missing files and rebuild the demo library — so the site never
  breaks. What you lose across a restart is anything **users uploaded or
  registered**. Treat it as a live demo of the product, not a shared drive.
- **Sessions**: logins expire on cold boot unless you set `VTUDOCS_SECRET`
  (see `render.yaml`). Users just log back in — harmless for a demo.
- **512 MB RAM / light CPU**: fine for a handful of concurrent viewers, not a
  campus-wide rollout.
- If you outgrow it: **Starter ($7/mo)** on the same service, or move the same
  repo to an Oracle Always-Free ARM VM (persistent disk → uploads survive).

## Smoke checklist (run against your live URL)

    curl -s https://vtudocs.onrender.com/api/session | head -c 80   # {"user": null...}
    # browser: sign in with the demo chip  aarathi.r@vtustudents.edu / vtu12345
    # dashboard stats nonzero · favorites = 4 · open a book · download one (bytes match)
    # upload a PDF from the modal · star it · edit it · delete → Undo toast restores it

## Local run, identical to Render

    pip install -r requirements.txt
    VTUDOCS_EPHEMERAL=1 python3 -m uvicorn server:app --port 8010
    # open http://localhost:8010
