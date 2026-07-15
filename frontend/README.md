# BenefitIQ Frontend (Sprint 7 — Production UI Foundation)

Premium, light, API-driven CXO/broker workspace. Preserves the approved demo's
navigation, module coverage (all 22 tabs) and decision-first storytelling, wired to
the **governed backend APIs** — no mock values, no browser-side KPI math.

## Stack
React 18 + TypeScript + Vite 5 + Tailwind 3 + React Router 6 + TanStack Query 5 · Vitest 2 + Testing Library.
All toolchain versions are **exact-pinned** in `package.json` for deterministic installs.

## Node version (important)
Use **Node 20 LTS or Node 22 LTS** (see `.nvmrc` and `package.json` "engines": `>=20 <23`).
Node 24 is not a supported target for this toolchain and can produce broken transitive installs
(e.g. missing `std-env` / `ts-interface-checker`). With `nvm`:
```bash
nvm install 20 && nvm use 20     # or: nvm use   (reads .nvmrc)
```

## Clean install & validate (run this after any dependency issue)
```bash
cd frontend
rm -rf node_modules package-lock.json     # (Git Bash) — start from a clean tree
npm install                                # generates a committed package-lock.json
npm test                                   # Vitest + Testing Library (all Sprint 7 tests)
npm run build                              # tsc --noEmit + vite build
npm run dev                                # http://localhost:5173
```
Commit the generated `package-lock.json` so installs are reproducible.
Config: `VITE_API_BASE` (default `http://localhost:8000`). The backend must allow the SPA origin via
`BIQ_CORS_ORIGINS` (config-driven).

## Backend tests (from the repo)
The backend is Python; run it from the `backend/` directory (not `frontend/`). `pytest` as a bare
command may not be on PATH — use the module form:
```bash
cd ../backend
python -m pytest            # Windows: py -m pytest   (or: python3 -m pytest)
```
## Sprint 8 — Renewal Intelligence + Savings Sandbox
Three strategic tabs are now wired to the governed backend APIs (no client-side math):
- **Renewal Intelligence** (`src/pages/RenewalIntelligence.tsx`) — operational / paid / outstanding ICR
  (`/metrics/icr`), YoY trend (`/metrics/trends`), large-claim one-off candidates (`/metrics/large-claims`),
  and a **separate, labelled Adjusted / Defendable ICR** view (`/simulation/adjusted-icr`) — operational ICR
  is always shown and never replaced.
- **Benefit & Savings Sandbox** (`src/pages/SavingsSandbox.tsx`) — lever controls that **call**
  `/simulation/{room-rent,copay,parent-copay,disease-cap,maternity-sublimit,corporate-buffer,scenario}`;
  portfolio saving, revised ICR, affected claims, **employee/member impact**, `term_basis`, formula,
  assumptions and caveats are all rendered from the API response.
- **Balanced Benefit Design** (`src/pages/BalancedBenefitDesign.tsx`) — six-dimension lever scoring +
  classification (Preferred / Good option / Use carefully / High employee impact / Not recommended unless
  critical) from `/simulation/balanced-design`.
- A polished **Evidence drawer** (`src/components/ui/sandbox.tsx`) is available for important numbers.
- The no-frontend-KPI-math guard test covers the new pages; all 22 routes remain intact.
