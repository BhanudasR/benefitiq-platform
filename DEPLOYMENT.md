# BenefitIQ — Deployment Runbook (Render pilot)

**Baseline:** `master` (Sprint 26 live) · backend 319 tests · Alembic head `a3d7e9f1c2b4`.
**Track:** PILOT on **masked / synthetic data only**. **No real employee / member / claim PII.**
**Result:** a real HTTPS URL for the SPA, talking to a hosted API + managed Postgres + S3 storage.

> ⚠️ **Read section 13 (DPDP) and 14 (what not to upload) before you load any data.**

Architecture: **Render Static Site (SPA)** → **Render Docker Web Service (FastAPI API)** → **Render Managed Postgres** + **S3-compatible bucket** (raw uploads). Secrets live only in the Render dashboard — never in the repo.

Repo artifacts that support this runbook: `backend/Dockerfile` (+ `backend/start.sh`), `render.yaml`, `frontend/public/_redirects`, `.env.example`, `frontend/.env.production.example`.

---

## 1. Render account setup
1. Create an account at https://render.com and connect your **GitHub** account.
2. Give Render access to the `benefitiq-platform` repository.
3. (Optional, fastest) Use the **Blueprint**: New → **Blueprint** → pick the repo → Render reads `render.yaml` and proposes the DB + API + static site. You'll still set the `sync: false` values (S3, CORS, VITE_API_BASE) in the dashboard. If the Blueprint schema errors, follow the manual steps below (they're version-proof).

## 2. Backend service creation (Docker Web Service)
1. New → **Web Service** → the repo.
2. **Runtime:** Docker. **Dockerfile path:** `backend/Dockerfile`. **Docker context:** `backend`.
3. **Health check path:** `/health`.
4. **Instance type:** Free (pilot) — note free instances sleep after inactivity (slow first request).
5. Create it (it will fail/incomplete until the DB + env vars from steps 3–4 exist — that's expected).

## 3. Managed Postgres creation
1. New → **Postgres**. Name `benefitiq-db`, database `benefitiq`, user `biq`, Free plan (pilot).
2. After it provisions, copy the **Internal Connection String** (starts `postgresql://…`).
   - SQLAlchemy accepts `postgresql://…` (defaults to psycopg2). The app's default form is `postgresql+psycopg2://…`; either works.
3. You'll paste this into the API's `BIQ_DATABASE_URL` (step 4). Prefer the **internal** URL (private network, not public).

## 4. Required backend env variables (set on the API service → Environment)
| Key | Value | Notes |
|---|---|---|
| `BIQ_ENV` | `production` | |
| `BIQ_AUTO_CREATE_TABLES` | `false` | **critical** — schema comes only from Alembic |
| `BIQ_DATABASE_URL` | *(managed PG internal URL)* | from step 3; secret |
| `BIQ_JWT_SECRET` | *(strong random)* | generate one (`openssl rand -hex 32`) or let Render generate; secret |
| `BIQ_STORAGE_BACKEND` | `s3` | |
| `BIQ_S3_ENDPOINT` | *(S3 endpoint)* | e.g. `https://s3.<region>.amazonaws.com` or R2 endpoint |
| `BIQ_S3_BUCKET` | *(bucket name)* | private bucket from step 9 |
| `BIQ_S3_ACCESS_KEY` | *(key)* | secret |
| `BIQ_S3_SECRET_KEY` | *(secret)* | secret |
| `BIQ_S3_REGION` | *(region)* | e.g. `ap-south-1` |
| `BIQ_CORS_ORIGINS` | *(set in step 8)* | leave blank until the SPA URL exists |

Save → the API redeploys.

## 5. Alembic migration step
- **Automatic:** `backend/start.sh` runs `alembic upgrade head` on **every deploy**, before serving. So once `BIQ_DATABASE_URL` is set and the service deploys, the schema (head `a3d7e9f1c2b4`) is applied to the managed Postgres — no manual step.
- **Verify:** open the API deploy logs → you should see `[release] applying migrations: alembic upgrade head` then `[serve] uvicorn …`.
- **Manual (if ever needed):** open a Render **Shell** on the API service and run `alembic upgrade head`.

## 6. Frontend static site creation
1. New → **Static Site** → the repo.
2. **Build command:** `cd frontend && npm ci && npm run build`.
3. **Publish directory:** `frontend/dist`.
4. **Rewrite rule (SPA):** add a rewrite `Source: /*  →  Destination: /index.html  (Rewrite)`. (`frontend/public/_redirects` also provides this; the dashboard rule is the belt-and-suspenders.)
5. Create it — but first set the env var in step 7 (the build bakes it in).

## 7. Required frontend env variable — `VITE_API_BASE`
- On the static site → Environment, add **`VITE_API_BASE` = the API's HTTPS URL** (e.g. `https://benefitiq-api.onrender.com`).
- This is **build-time** — it's compiled into the bundle. If it's missing, the SPA calls `http://localhost:8000` and fails in the cloud (the #1 mistake).
- Set it **before** the first successful build. If you set it after, trigger a **Manual Deploy → Clear build cache & deploy**.

## 8. CORS update after the frontend URL is known
1. Copy the static site URL (e.g. `https://benefitiq-web.onrender.com`).
2. On the **API** service, set `BIQ_CORS_ORIGINS` to that exact URL (comma-separated if more than one; **no trailing slash, no wildcard**).
3. Save → the API redeploys. Now the SPA origin is allowed and sign-in will connect.

## 9. S3-compatible storage setup
1. Create a **private** bucket (AWS S3, Cloudflare R2, or Render Disk-backed MinIO). Region of your choice for the pilot.
2. Create a **scoped access key/secret** limited to this bucket (get/put/list on the bucket only).
3. Block all public access / no public listing (raw uploads are sensitive even when masked).
4. Put the endpoint, bucket, key, secret, region into the API env vars (step 4).
- **Pilot shortcut:** you may instead set `BIQ_STORAGE_BACKEND=local` + a Render **persistent disk** mounted at `BIQ_STORAGE_LOCAL_ROOT`. S3 is the production-correct choice; local-disk is acceptable for a quick masked-data pilot.

## 10. Test login / user setup guidance
- **Quick pilot login (dev mint):** the app's dev login (username / tenant / role) still works — sign in as `analyst` / `acme` / `Analyst`. Convenient, but these tokens are **unrestricted**; fine for a masked-data pilot, **not** for real data.
- **Proper admin user:** sign in as `Admin`, open **Settings → Users** (or `POST /admin/users` in `/docs`) to create a real user with an email + temporary password, then log in via the real login. Use this path once you care about RBAC / client-scoping.
- **Fresh DB = empty:** analytics tabs show governed "No Data" until you onboard data (via `/docs`, using the masked fixtures in `fixtures/`).

## 11. Smoke test checklist (post-deploy)
- [ ] `https://<api>/` returns `{"app":"BenefitIQ Platform","docs":"/docs"}`.
- [ ] `https://<api>/health` returns `{"status":"ok",...}` (host health check green).
- [ ] `https://<api>/docs` (Swagger) loads over HTTPS.
- [ ] API deploy logs show `alembic upgrade head` ran successfully.
- [ ] `https://<web>` loads the SPA (BenefitIQ sign-in card).
- [ ] **Sign-in works** — no "Failed to fetch" (confirms `VITE_API_BASE` + CORS are correct).
- [ ] A deep link survives refresh: open `https://<web>/ask-benefitiq` directly → page renders (SPA fallback works).
- [ ] A governed **empty-state** tab renders cleanly (no crash) on a fresh DB.
- [ ] **Ask BenefitIQ** returns a governed *unsupported* answer for "give me a member's medical history".
- [ ] (Optional) Onboard the masked fixtures via `/docs` → one analytics tab populates.

## 12. Common errors and fixes
| Symptom | Cause | Fix |
|---|---|---|
| SPA "Failed to fetch" on sign-in | `VITE_API_BASE` not baked in | Set it on the static site, **Clear cache & deploy** (§7). |
| CORS error in browser console | `BIQ_CORS_ORIGINS` ≠ SPA URL | Set it to the exact SPA origin, redeploy API (§8). |
| API deploy fails at start | Alembic can't reach DB | Check `BIQ_DATABASE_URL` (use the **internal** PG URL); DB provisioned. |
| `relation ... does not exist` at runtime | migrations didn't run | Confirm `start.sh` ran `alembic upgrade head` (logs); `BIQ_AUTO_CREATE_TABLES=false`. |
| Deep link 404 on refresh | SPA fallback missing | Add the `/*  → /index.html` rewrite (§6) / ensure `_redirects` shipped. |
| First request very slow | Free instance cold start | Expected on free tier; upgrade instance, or warm it before a demo. |
| Uploads fail | S3 misconfig | Verify endpoint/bucket/keys/region; bucket private but key has put/get. |
| 401 after a while | JWT TTL (60 min) | Sign in again. |

## 13. DPDP / real-PII warning
- This pilot runs on **masked / synthetic data only**. Do **not** load real member / employee / claim PII.
- For a real-PII production deployment, plan a separate track: **India data residency (AWS Mumbai / ap-south-1)** — RDS Postgres + S3 Mumbai + a container service (ECS/App Runner) in-region — plus DPDP obligations (consent, retention, DPO, breach process). Tenant isolation, k-anonymity (k≥5), and audit logging are already enforced in the app, but residency + contractual controls must be added before real data.

## 14. What NOT to upload in the pilot
- No real names, member/employee IDs, government IDs, contact details, or actual medical records.
- No production TPA/insurer files containing real PII.
- Only the repo's masked `fixtures/*.csv` or your own **synthetic/masked** files.
- Treat the pilot URL as **internal/demo** — don't share it publicly or index it.

## 15. Go / No-Go checklist
**Must-pass (any ❌ = No-Go):**
- [ ] API up on HTTPS; `/health` green; `/docs` loads.
- [ ] Migrations applied (Alembic head `a3d7e9f1c2b4` in the logs); `BIQ_AUTO_CREATE_TABLES=false`.
- [ ] SPA loads; **sign-in connects** (no fetch/CORS error).
- [ ] `BIQ_CORS_ORIGINS` = exact SPA URL (no wildcard); JWT/DB/S3 secrets only in the host store (not in git).
- [ ] SPA deep links work on refresh.
- [ ] Only masked/synthetic data present; no real PII.

**Rollback / troubleshooting:**
- Render keeps prior deploys — **Rollback** to the last good deploy from the service's *Deploys* tab.
- Bad migration? The schema is versioned; `alembic downgrade -1` from a Render Shell reverts one step (pilot data is disposable — you can also drop/recreate the Free DB).
- Config-only issues (CORS / VITE_API_BASE) don't need a rollback — fix the env var and redeploy.

**Verdict:** ☐ GO (share pilot URL) · ☐ GO with notes · ☐ NO-GO (fix must-pass first)
