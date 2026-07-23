# Deployment guide

The app is two independent parts, deployed separately:

| Folder | What it is | Deploy to | Its env file |
|---|---|---|---|
| `client/` | Vite + React frontend (static) | **Vercel** | `client/.env` (`VITE_API_URL`) |
| `server/` | Express + Mongoose backend (API) | **Render** | `server/.env` (DB, secrets, Cloudinary) |

**Why Render for the backend, not Vercel/Netlify?** Vercel & Netlify are
serverless — in this setup they connect to MongoDB but the query hangs and the
function times out. Render (and Railway) run an always-on server, exactly like
local, so it just works.

Data lives in **MongoDB Atlas**; uploaded files in **Cloudinary**.

---

## 1. Prerequisites (free accounts)

- **MongoDB Atlas** — free M0 cluster. Network Access → add `0.0.0.0/0`.
  Copy the `mongodb+srv://…` string (Connect → Drivers), fill in the password and
  db name (`keusmania_crm`).
- **Cloudinary** — free. Copy Cloud Name / API Key / API Secret.
- **GitHub** — push this repo.
- **Render** (backend) and **Vercel** (frontend) — sign up with GitHub.

---

## 2. Backend → Render

Render → **New → Web Service** → pick this repo, then:

| Setting | Value |
|---|---|
| Root Directory | `server` |
| Build Command | `npm install` |
| Start Command | `node server.js` |
| Instance Type | Free |

**Environment variables** (Render → Environment) — see `server/.env.example`:

| Variable | Value |
|---|---|
| `MONGO_URI` | Atlas `mongodb+srv://…` string |
| `JWT_SECRET` | long random string |
| `CLIENT_URL` | your Vercel URL (for CORS), e.g. `https://keusmaina-crm.vercel.app` |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | from Cloudinary |
| `CLOUDINARY_FOLDER` | `keusmania` |

Do **not** set `PORT` or `RENDER_EXTERNAL_URL` — Render provides both.

Deploy → you get a URL like `https://keusmania-api.onrender.com`.
Verify: open `…/api/health` → `{ "success": true }`.

### Keep it awake (free tier sleeps after 15 min idle)
- **Built-in:** the server self-pings `/api/health` every 10 min using
  `RENDER_EXTERNAL_URL` — automatic, no setup.
- **Recommended backup:** add a free **UptimeRobot** monitor hitting
  `…/api/health` every 5 min (also alerts you if it goes down).
- One always-on service uses ~730 of Render's 750 free hours/month — fits free.

---

## 3. Frontend → Vercel

Vercel → **Add New Project** → pick this repo, then:

| Setting | Value |
|---|---|
| Root Directory | `client` |
| Framework Preset | Vite (auto-detected) |

**Environment variable** (Vercel → Settings → Environment Variables) — see
`client/.env.example`:

| Variable | Value |
|---|---|
| `VITE_API_URL` | your Render backend URL + `/api`, e.g. `https://keusmania-api.onrender.com/api` |

⚠️ Vite bakes this in at **build time** — after changing it, **redeploy**.
SPA routing (page refresh on `/ledger`, etc.) is handled by `client/vercel.json`.

Deploy → open the site, log in with `admin@keusmania.com` / `admin123`
(change the password immediately).

---

## 4. Local development

```bash
# terminal 1 — backend on :5000 (connects to Atlas)
cd server && npm install && npm run dev

# terminal 2 — frontend on :5173
cd client && npm install && npm run dev
```

Local env: `server/.env` (`MONGO_URI`, `JWT_SECRET`, `CLIENT_URL=http://localhost:5173`)
and `client/.env` (`VITE_API_URL=http://localhost:5000/api`).

If you don't set Cloudinary vars locally, uploads fall back to `server/uploads/`.

---

## 5. Common pitfalls

| Symptom | Fix |
|---|---|
| CORS error in the browser console | `CLIENT_URL` on Render must exactly match the Vercel URL (no trailing slash) |
| Login "network error" | `VITE_API_URL` on Vercel must be the Render URL + `/api`; redeploy after changing |
| First request slow (~30–60s) | Render free cold start — the keep-alive + UptimeRobot minimize it |
| DB connection error | Atlas Network Access must include `0.0.0.0/0`; check the `MONGO_URI` password |
| 404 on page refresh | `client/vercel.json` provides the SPA fallback — confirm it's deployed |

---

## 6. Leftover files (safe to delete once the split works)

These were for the old single-Vercel serverless attempt and are no longer used:
`api/`, the root `vercel.json`, and the root `package.json` build scripts. The
frontend now deploys from `client/` and the backend from `server/`.
