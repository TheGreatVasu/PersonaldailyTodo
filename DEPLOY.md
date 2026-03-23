# Deploy: Vercel (frontend) + Render (API)

Architecture: **React** on [Vercel](https://vercel.com), **Express** on [Render](https://render.com). The browser calls your Render URL via `VITE_API_URL`.

## 1. Deploy the API on Render

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Render: **New +** → **Blueprint** (or **Web Service**).
3. Connect the repo and use:
   - **Root directory:** `server`
   - **Build command:** `npm install`
   - **Start command:** `npm start`
4. **Environment variables** (Render → your service → Environment):
   - `CORS_ORIGINS` — your Vercel URL(s), comma-separated, **no trailing slash**  
     Example: `https://rastogi-todo-list.vercel.app`
   - Optional: `DATA_DIR` — if you add a **persistent disk**, set to the mount path (e.g. `/var/data`) so todos survive redeploys. Free tier uses ephemeral storage otherwise.
5. Copy the service URL, e.g. `https://rastogi-todo-api.onrender.com`.

Health checks: `GET /health` or `GET /api/health` → `{ "ok": true }`.

## 2. Deploy the client on Vercel

1. **New Project** → import the same repo.
2. Configure:
   - **Root Directory:** leave **empty** (repo root) so `vercel.json` applies, **or** set root to `client` and adjust build settings manually.
   - If using repo root with `vercel.json` here: install/build/output are already set.
3. **Environment variables** (Production + Preview as needed):
   - `VITE_API_URL` — your Render API URL, **no trailing slash**  
     Example: `https://rastogi-todo-api.onrender.com`
4. Deploy. After the first deploy, update **`CORS_ORIGINS`** on Render to include the exact Vercel URL Vercel shows (including `https://`).

## 3. Local production check

```bash
cd server && npm install && npm start
cd client && echo VITE_API_URL=http://localhost:3001 > .env && npm run build && npm run preview
```

## Notes

- **Cold starts:** Render free tier may spin down; first request can be slow.
- **HTTPS:** Both platforms use HTTPS; set `CORS_ORIGINS` to the exact browser origin.
- **Monorepo:** This repo keeps `client/` and `server/` separate; no code change needed beyond env vars.
