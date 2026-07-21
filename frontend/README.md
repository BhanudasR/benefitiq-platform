# BenefitIQ Frontend (Sprint 7 — Production UI Foundation)

Premium, light, API-driven CXO/broker workspace. Preserves the approved demo's
navigation, module coverage and decision-first storytelling, wired to the **governed
backend APIs** — no mock values, no browser-side KPI math.

## Navigation (demo-parity)
**20 top-level tabs** in 6 groups, in the approved demo order — Data Onboarding and
Source Evidence / Data Quality sit at the END (Data Trust & Admin) so the trust
modules never interrupt the CXO/broker journey. Two demo modules are **not** top-level
tabs — they are **sub-tabs under Renewal Intelligence**.

- **Renewal Intelligence** — exactly the 6 demo sub-tabs: Overview · Claims Drivers ·
  Benefit & Savings Sandbox · Balanced Benefit Design · Recommended Strategy ·
  Placement Trigger / Next Best Action. (Room rent, co-pay, parent co-pay, disease cap,
  maternity sub-limit, corporate buffer and the multi-lever scenario are sections/controls
  **inside** Benefit & Savings Sandbox — not separate sub-tabs.)
- **Wellness Intelligence** — exactly the 4 demo sub-tabs: Wellness Overview ·
  Opportunity & Recommendation · Wellness Planner · ROI & Impact Tracking.

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
## Sprint 8 — Renewal Intelligence (6 demo sub-tabs) + Wellness (4 demo sub-tabs)
Renewal Intelligence is a **parent** (`src/pages/RenewalShell.tsx`) hosting exactly the 6 demo sub-tabs
via nested routes; every sub-tab is governed & API-driven (no client-side math):
- **Overview** (`src/pages/RenewalIntelligence.tsx`) — operational / paid / outstanding ICR
  (`/metrics/icr`), YoY trend (`/metrics/trends`), large-claim one-off candidates (`/metrics/large-claims`),
  and a **separate, labelled Adjusted / Defendable ICR** view (`/simulation/adjusted-icr`) — operational ICR
  is always shown and never replaced.
- **Claims Drivers** (`src/pages/ClaimsDrivers.tsx`) — frequency vs severity and top ailment contributors
  from `/metrics/claims` + `/metrics/ailment`.
- **Benefit & Savings Sandbox** (`src/pages/SavingsSandbox.tsx`) — lever controls that **call**
  `/simulation/{room-rent,copay,parent-copay,disease-cap,maternity-sublimit,corporate-buffer,scenario}`;
  portfolio saving, revised ICR, affected claims, **employee/member impact**, `term_basis`, formula,
  assumptions and caveats are all rendered from the API response. (These levers are sections/controls in
  this one sub-tab — not separate sub-tabs.)
- **Balanced Benefit Design** (`src/pages/BalancedBenefitDesign.tsx`) — six-dimension lever scoring +
  classification (Preferred / Good option / Use carefully / High employee impact / Not recommended unless
  critical) from `/simulation/balanced-design`.
- **Recommended Strategy** (`src/pages/RecommendedStrategy.tsx`) — negotiation stance, defend/negotiate/
  redesign, justification, employer & employee impact, evidence + caveats — a governed composition of the
  ICR / adjusted-ICR / balanced-design responses. The stance itself is a backend output; where an endpoint
  does not yet return it, the screen shows the governed evidence and a clear "pending" state (never a guess).
- **Placement Trigger / Next Best Action** (`src/pages/PlacementTrigger.tsx`) — trigger decision, incumbent
  defence vs RFQ, insurer negotiation evidence (large one-off claims), next best broker action.

**Wellness Intelligence** is a parent (`src/pages/WellnessShell.tsx`) hosting exactly the 4 demo sub-tabs
(`src/pages/Wellness.tsx`): Wellness Overview · Opportunity & Recommendation · Wellness Planner · ROI &
Impact Tracking. Governed wellness endpoints are pending, so these render premium, intentional scaffolds
stating the decision each will answer — never mock numbers.

- Sub-tab navigation: `src/components/SubTabNav.tsx`; a polished **Evidence drawer**
  (`src/components/ui/sandbox.tsx`) is available for important numbers.
- The no-frontend-KPI-math guard test covers all pages; **20 top-level routes** + nested Renewal/Wellness
  sub-routes are all exercised by the route tests.

## Sprint 9 — Renewal Intelligence complete (6 sub-tabs, demo-parity depth)
All six Renewal sub-tabs are now built to the demo portal's analytical depth, each answering the four
questions (So what / Why / What next / Can I trust it) via a shared `FourQuestions` block
(`components/ui/primitives.tsx`). Every figure is governed and API-driven; no browser-side math.
- **Overview** — Operational/Paid/Outstanding ICR, premium basis, multi-year trend, a **large-claim /
  one-off impact** summary (`/metrics/large-claims`), a separate labelled Adjusted / Defendable ICR view,
  caveats and evidence.
- **Claims Drivers** — frequency vs severity, paid-vs-outstanding movement (+ governed YoY from
  `/metrics/trends`), large-claim effect, claim-type/status split, and **relation / hospital / ailment**
  concentration from `/metrics/{relation,hospital,ailment}` (Option A). Each dimension has a premium
  governed empty/caveat state; nothing is computed in the browser. `fmtShare` renders API share fractions
  as percentages (display-only Intl formatting, no arithmetic).
- **Benefit & Savings Sandbox** — 7 levers as controls; all figures from `/simulation/*`.
- **Balanced Benefit Design** — 6-dimension scoring + classification + a **recommended-design summary**.
- **Recommended Strategy** — governed composition of ICR / adjusted-ICR / balanced-design; the defend /
  negotiate / redesign call renders only from a backend field, otherwise a **governed pending-state** (no
  frontend recommendation math).
- **Placement Trigger / Next Best Action** — governed evidence (large one-off claims) with a **governed
  pending-state** for the trigger; no frontend trigger math.
- Tests: `renewal`, `claims-drivers`, `sandbox`, `balanced`, `recommended-strategy`, `placement-trigger`,
  plus `nav` (20 tabs), `subtabs` (6 Renewal / 4 Wellness), `routes`, and the no-frontend-math guard.

## Sprint 14 — Settings / Admin (User Management & RBAC)
A capability-gated **Settings / Admin** area (`src/pages/AdminUsers.tsx`) — reached from a Settings entry
at the bottom of the sidebar, **not** one of the 20 analytics tabs — lets an admin create users, assign
roles & client access, reset passwords (one-time temporary-password reveal) and deactivate/activate. It is
driven by the governed `api.admin.*` client (`/admin/*`) and by `POST /auth/login` for real users.
- The Settings entry shows only when the principal has the `manage_users` capability (`useAuth().hasCapability`);
  the `/settings/users` route is guarded client-side (`RequireCapability`) **and** enforced server-side.
- Backend is the source of truth for access; the frontend only mirrors permissions. Read-only Testers and
  non-admins never see or reach the admin page. No passwords are handled in the browser beyond the one-time
  temp-password reveal returned by the API.

## Sprint 13 — Wellness Intelligence 4 sub-tabs wired to the /wellness engines
All four Wellness sub-tabs (`src/pages/Wellness.tsx`) are **single-sourced** from the governed Sprint 12
`/wellness/*` APIs via `api.wellness(name)` (`src/lib/api.ts`); the Sprint-8 placeholders are removed. No
browser-side wellness/ROI math.
- **Wellness Overview** (`/wellness/overview`) — posture, top wellness categories (claim-driven),
  preventable vs supportive incurred, chronic/recurring signal, engagement-baseline "pending".
- **Opportunity & Recommendation** (`/wellness/recommendations` only) — ranked cohort-level opportunities,
  each with ailment category, potential impact (estimate), claim driver, suggested intervention, employer/
  employee impact, confidence and next best action.
- **Wellness Planner** (`/wellness/planner`) — sequenced intervention plan + foundation status.
- **ROI & Impact Tracking** (`/wellness/roi-impact`) — per-category tracking basis, estimate/tracking-basis
  labels, pending actuals — no guaranteed-saving language.
- Privacy-safe throughout: k-anonymity suppression surfaced as a privacy note; cohort-level only, no PII, no
  individual targeting, no medical advice. Restricted → advisory-blocked; Conditional → caveats; Pending /
  No-Data → premium pending state. The no-frontend-math guard covers the page.

## Sprint 11 — Recommended Strategy & Placement Trigger wired to the recommendation engines
Both sub-tabs are now **single-sourced** from the governed Sprint 10 recommendation APIs via
`api.recommendation(name)` (`src/lib/api.ts`); the earlier `/metrics/icr`, `/simulation/adjusted-icr` and
`/simulation/balanced-design` page queries are removed. No decision is computed in the browser.
- **Recommended Strategy** (`/recommendations/renewal`) — renders stance, confidence + reliability,
  reasoning bullets, source metrics used, employer/employee impact, broker talking points, next best
  action, caveats, evidence, and Operational vs Adjusted / Defendable ICR (kept separate; operational never
  replaced) + config/threshold basis.
- **Placement Trigger / NBA** (`/recommendations/placement-trigger`) — renders placement_triggered
  (yes/no/review), incumbent-defence score, RFQ readiness, trigger reason, negotiation evidence (with the
  one-off claim table), next best action, confidence and caveats.
- Governance states preserved: Restricted → advisory-blocked banner; Conditional → caveats; No-Data /
  missing → premium pending state. Evidence drawer opens on the full governed response. The
  no-frontend-math guard covers both pages.
