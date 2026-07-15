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
If dependencies aren't installed yet: `pip install -r requirements.txt` (ideally in a venv).

## What Sprint 7 delivers
- Premium light design system (`src/components/ui/primitives.tsx`): KPI card, section header,
  decision/action summary, evidence panel, source-evidence chips, data-quality badge,
  caveat / restricted (advisory-blocked) banners, loading skeleton, empty & error states.
- Navigation shell with **all 22 tabs** (`src/nav/tabs.ts`, `src/components/Shell.tsx`).
- Auth (JWT via `/auth/token`) + tenant/RBAC context (`src/lib/auth.tsx`); typed governed
  API client (`src/lib/api.ts`); React Query data layer.
- **Executive Summary** and **Data Onboarding** wired end-to-end to real governed APIs;
  the other 20 tabs are premium, state-scaffolded placeholders.
- Governance UX everywhere: Restricted → advisory-blocked banner; Conditional → caveats;
  No-Data → premium empty state.
- Component gallery at `/gallery`.

## Guardrails (enforced)
No mock/demo KPI values · no frontend KPI/simulation math (guard test in
`src/test/guard-no-kpi-math.test.ts`) · all official numbers come from the governed APIs ·
`src/lib/format.ts` performs display formatting only.
