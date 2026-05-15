# Deploying to Vercel

This repo is configured to deploy as a single Vercel project:

- **Frontend** — the Vite React app under `client/`, output served as static.
- **API** — the Express app under `server/`, wrapped as a single serverless function via `api/index.js`.
- **Files** — uploads go to Cloudinary in production. Local dev keeps the existing on-disk flow.
- **Database** — MongoDB Atlas (or any reachable MongoDB).

Total setup time: ~30 minutes if you don't already have the accounts.

---

## 1. Prerequisites — three free accounts

### a) MongoDB Atlas
1. Create a free **M0** cluster at https://cloud.mongodb.com.
2. **Network Access** → add `0.0.0.0/0` (Vercel's outbound IPs are not fixed; Atlas M0 allows this).
3. **Database Access** → create a user with read/write to the DB.
4. **Connect → Drivers** → copy the connection string. Replace `<password>` and the DB name (e.g. `keusmania_crm`).
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/keusmania_crm?retryWrites=true&w=majority
   ```

### b) Cloudinary
1. Sign up at https://cloudinary.com (free tier: 25 GB storage + 25 GB bandwidth/month).
2. Dashboard → **Account Details** → copy **Cloud Name**, **API Key**, **API Secret**.

### c) Vercel
1. Sign up at https://vercel.com with GitHub.
2. Push this repo to GitHub.
3. Vercel → **Add New Project** → import the repo.

---

## 2. Vercel environment variables

In the Vercel project settings → **Environment Variables**, add the following for **Production** (and ideally Preview):

| Variable | Value |
|---|---|
| `MONGO_URI` | The Atlas connection string from step 1a |
| `JWT_SECRET` | A long random string — generate with `openssl rand -base64 48` |
| `CLOUDINARY_CLOUD_NAME` | From the Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | From the Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | From the Cloudinary dashboard |
| `CLOUDINARY_FOLDER` | `keusmania` (or whatever subfolder you want) |
| `VITE_API_URL` | `/api` *(same-origin in production)* |

Do **not** set `PORT` or `CLIENT_URL` — Vercel handles routing.

---

## 3. Deploy

Click **Deploy** in the Vercel dashboard. The first build takes a couple of minutes; subsequent pushes to `main` redeploy automatically.

The build runs:
```
npm install                       (root)
npm install --prefix client       (Vite + React)
npm install --prefix server       (Express + Mongoose + Cloudinary)
npm install --prefix api          (serverless-http)
npm run vercel-build              (vite build into client/dist)
```

Vercel then publishes `client/dist/` as static files and turns `api/index.js` into a serverless function. Routing is handled by `vercel.json`:

- `/api/*` → the Express function
- `/*` → `client/dist/index.html` (so React Router works)

---

## 4. Verify the deployment

1. Hit `https://<your-project>.vercel.app/api/health` — should return `{ env: "vercel", ... }`.
2. Log in with your existing credentials (the user collection isn't touched by the migration).
3. Try uploading a passport scan — confirm the resulting URL starts with `https://res.cloudinary.com/`.

---

## 5. Local development is unchanged

Run as before:

```bash
# terminal 1
cd server && npm install && npm run dev

# terminal 2
cd client && npm install && npm run dev
```

If you don't set the Cloudinary env vars locally, uploads keep going to `server/uploads/` on disk — same as today. **You only need Cloudinary for the deployed environment.** This makes onboarding new contributors painless: they don't need a Cloudinary account.

---

## 6. Files & limits worth knowing

- **Vercel Hobby tier**: 4.5 MB request body limit. For now this is the ceiling on a single passport scan upload. If you regularly upload files larger than this, upgrade to **Pro ($20/mo)** — that lifts it to 50 MB. Alternatively, switch to Cloudinary's signed direct-upload pattern so the browser uploads straight to Cloudinary, bypassing Vercel entirely (~1 hour of work; ask when you need it).
- **Function timeout**: 30 s on Hobby. None of our endpoints come close.
- **Cold start**: first request after ~5 min of inactivity adds ~1-2 s. Subsequent requests are warm (<100 ms).
- **Atlas M0 sleeps** after long idle periods. First wake-up takes ~30 s. Upgrade to M2 ($9/mo) to avoid this if it bothers you.

---

## 7. Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| `Mongo connection error: serverSelectionTimeout` on the first request after deploy | Atlas IP allowlist | Confirm `0.0.0.0/0` is in Network Access |
| 401 on every request | `JWT_SECRET` differs from the one that signed existing tokens | Log out + log in, OR set it to the same value as your local `.env` |
| Uploads fail with "Cloudinary upload failed" | Wrong / missing Cloudinary credentials | Re-paste them, redeploy |
| 404 on every page reload of `/ledger`, `/packages`, etc. | Missing SPA fallback | The `vercel.json` rewrite rule handles this — confirm the file is in the deployed commit |
| API route 500s with no detail | Vercel function logs | Vercel dashboard → Project → Deployments → click the deployment → **Functions** tab |

---

## 8. Rolling back

Vercel keeps every deployment. From the project dashboard → **Deployments**, hover over any previous one → **Promote to Production**. Instant rollback, no rebuild needed.

The codebase itself is dual-mode: deleting all `CLOUDINARY_*` env vars and reverting to disk-based hosting (Render, Railway, a VPS, etc.) requires zero code changes — uploads fall back to the local `server/uploads/` flow automatically.
