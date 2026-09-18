# Optional Google Sign-In — setup (15 minutes)

**Nothing on the site needs this.** The library is public: browsing, inline reading
and downloads all work without it. Google sign-in only puts a name in the top bar so
a returning reader is greeted personally. There are no passwords anywhere in this app
— not in the database, not in the API, not in the browser.

The button appears automatically as soon as the two environment variables below are
set, and stays hidden otherwise.

## 1. Create the OAuth client

1. Go to <https://console.cloud.google.com/> and sign in.
2. Top bar → project picker → **New project** → name it e.g. `VTU Docs` → **Create**.
3. **APIs & Services → OAuth consent screen**
   * User type: **External** → *Create*.
   * App name: `VTU Docs`, user support email: `lokesh@ajiet.edu.in`, developer contact: same.
   * Scopes: leave the defaults; **Save and continue** through the steps.
   * Test users (while the app is unpublished): add your own Gmail address so you can
     sign in during testing.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   * Application type: **Web application**.
   * Name: `VTU Docs web`.
   * **Authorised redirect URIs** — add both, exactly:
     * `https://<your-render-service>.onrender.com/auth/google/callback`
     * `http://localhost:8010/auth/google/callback`  *(for local testing)*
   * **Create** → copy the **Client ID** and **Client secret**.

## 2. Give the values to the app

Local:

```bash
export GOOGLE_CLIENT_ID="....apps.googleusercontent.com"
export GOOGLE_CLIENT_SECRET="GOCSPX-...."
export VTUDOCS_SECRET="any-long-random-string"   # keeps sessions valid across restarts
python3 -m uvicorn server:app --port 8010
```

Render (Dashboard → your service → **Environment**):

| Key | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | the client id |
| `GOOGLE_CLIENT_SECRET` | the client secret |
| `VTUDOCS_SECRET` | any long random string |
| `OAUTH_REDIRECT_BASE` | *(only if you use a custom domain, e.g. `https://vtudocs.example.com`)* |

Or uncomment the corresponding block in `render.yaml` and let the blueprint manage them.

## 3. Check it

```bash
curl -s https://<your-service>.onrender.com/api/auth/config
# {"google":true}      → button is live
# {"google":false}     → env vars are not visible to the running service yet
```

Open the site, click **Sign in with Google**, and you should land back on the page with
your first name in the top bar and a green “Signed in” note.

## What gets stored

One row in the `users` table: your name, email, a role (`reader`) and the date. No token
from Google, no access to Gmail, Drive or anything else — the scope is `openid email
profile` only. The session is this app's own signed cookie (`vtu_reader`), and
**Sign out** deletes it.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `redirect_uri_mismatch` from Google | The URI in step 1 must match the service URL character for character (https, no trailing slash, `/auth/google/callback`). |
| Button missing | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` not set on the running instance, or the service was not restarted after adding them. |
| “Sign-in attempt expired” | The tab sat on the Google screen for more than 10 minutes; click again. |
| Signed in, then logged out after a restart | Set `VTUDOCS_SECRET` (free hosts wipe the generated key on redeploy). |
