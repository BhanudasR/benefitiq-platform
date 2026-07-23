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

## Sprint 25 — Governed Client Pack / Export foundation
Read-only **export composition** over the existing governed engines (**no migration, no new dependency,
no binary generation**) + a guided board-pack workflow + a print-ready pack view.
- **`/exports/client-pack/sections`**: per-section export-readiness for a client (ready / caveated /
  restricted / no-data) + an overall "OK to send?" verdict (min-band-gated).
- **`/exports/client-pack/preview`**: the governed **pack contract** — cover + selected content sections
  + Data Quality / Source Evidence appendix. Each section carries `{value, data_quality_status, caveats,
  source_tables, confidence, evidence, readiness}`; pack trust is **min-band-gated** (any Restricted
  section stamps the whole pack directional). Pure read (no audit).
- **`/exports/client-pack/generate`** (POST): returns the same contract **and writes exactly one
  append-only `AuditLog` EXPORT event**. On-demand, **not persisted**, no file generated.
- **`ExportClientPack.tsx`** (the `/export` tab): guided workflow — client selector, pack-type selector
  (Full Board / Renewal / Placement), section checklist with readiness chips, export-readiness panel +
  DQ/Restricted warning, governed preview cards, evidence-appendix preview, "Generate board pack".
- **`ClientPackPrint.tsx`** (`/export/print`, full-screen, no Shell chrome): boardroom-styled render of the
  governed pack (cover + sections + evidence appendix + caveat footer) with `@media print` CSS → browser
  **Print → PDF**. v1 is dependency-free; the PPTX slide schema is defined as a foundation for a later binder.
- Every figure comes from a governed engine (no frontend math, guard NONE); missing → "Not available";
  no raw member/claim rows, no PII; client_id required + client-scoped (foreign → 403). Nav 20 / 7-6-4-7 preserved.

## Sprint 24 — Source Evidence / Data Quality trust command center
Read-only **evidence composition** over the existing governance tables (**no migration**, no DQ recomputation,
no writes) + one premium trust dashboard wired into the existing Source Evidence tab.
- **`/data-quality/overview`**: headline readiness by **MIN-BAND-GATES** over active datasets (Restricted <
  Conditional < Analytics Ready — a healthy policy/member dataset can never mask a Restricted claims dataset),
  with a **records-weighted DQ score** as the secondary score (`Σ(DQ × records)/Σ(records)`), a `gating_reason`,
  per-dataset scores, issue severity summary and mapping confidence.
- **`/data-quality/issues`**: severity split (ERROR→critical / WARNING→warning / INFO→info), grouping by rule and
  by field, affected records/fields, quarantined subset; each field carries the modules it impacts.
- **`/data-quality/module-readiness`**: advisory module readiness from the centralized **`EVIDENCE_MODULE_MAP`**
  (claims→Claims/ICR/Ailment/Hospital/Settlement/Maternity/Rejection/Large Claims; member→Demographics/Employee &
  Family/Relation/SI Utilization; policy→Broker/Client Portfolio/Renewal/Placement; terms→Benchmarking/Sandbox/
  Balanced; wellness→Wellness, claims fallback). Non-blocking unless the source dataset is Restricted.
- **`/data-quality/lineage`**: file → upload_batch → dataset_version chain (content-addressed sha256, immutable).
- **`/data-quality/evidence/{kind}`**: reconciling explainability — dataset DQ = Σ(component `weighted_points`)
  (dq_score.py 8-component model); 404 on unknown kind.
- **`DataQuality.tsx`** (Source Evidence tab): trust-verdict hero (**DQ Gauge** + "Can I trust this?" verdict +
  gating reason), KPI band (weighted DQ, active datasets, critical issues, affected records, mapping confidence),
  issue-severity **Donut** + issues-by-rule **BarH**, module-readiness grid, source-lineage timeline, impacted-
  analytics table, recommended-fix cards, evidence drawer, FourQuestions, polished No-Data / Not-available states.
- Guardrails held: pages math-free (chart geometry in `components/ui/charts/`), governed API values only, no DQ
  recomputation, no writes, tenant isolation + client scoping (foreign `client_id` → 403), nav 20 / 7-6-4-7 preserved.

## Sprint 23 — Broker + Client Portfolio (CXO command center) + Exec FourQuestions
Two new governed backend composition endpoints (**no migration**) + two premium landing dashboards + a
small storytelling fix.
- **`/portfolio/broker-overview`** (`BrokerPortfolio.tsx`): book command center — KPI band (clients, lives,
  premium, portfolio ICR, claims), renewals-due **BarV** (overdue/30/60/90/later from `policy_end_date`),
  risk-distribution **Donut** (governed RecommendationConfig ICR bands), readiness **Donut**, top-clients grid
  (risk badge, ICR, lives, premium, renewal countdown, DQ → deep-link to the client), broker next-best-actions,
  evidence drawer. Client-scoped (a Client HR Viewer's book auto-scopes to their client).
- **`/portfolio/client-overview`** (`ClientPortfolio.tsx`): client-360 control tower — KPI band (lives, premium,
  ICR, next renewal), health cards (DQ / Benchmarking / Placement / Wellness — governed status or "Not available"),
  next-best-action, quick-links to the module dashboards, FourQuestions, evidence. **Reconciles with the module
  tabs** (same single-source engines; e.g. client ICR == `/metrics/icr`). Reads `?client_id`; offers a governed
  client picker when absent.
- Both compose the existing governed engines (metrics/benchmarking/placement/wellness/recommendation) — no new
  decision logic, no fabricated rollups; lives are **client-scoped** (no cross-client double-count). Registered for
  `/portfolio/evidence/{kind}`.
- **Executive Summary:** added the FourQuestions storytelling block (additive) so the landing screen matches every
  other analytics tab; existing governed widgets untouched.
- Guardrails held: pages math-free (chart geometry in `components/ui/charts/`), governed API values only, evidence/
  caveats/confidence, tenant isolation + client scoping, missing fields "Not available", nav 20 / 7-6-4-7 preserved.

## Sprint 22 — Settlement + Maternity + Rejection (governed claim analytics + dashboards)
Three new governed metric endpoints (read-only over canonical `claim` [+ `claim_bill_component`,
confirmed `benefit_term`], **no migration**) + three chart-led dashboards.
- **`/metrics/settlement`** (`Settlement.tsx`): status-mix **Donut**, paid-vs-outstanding **StackedBar**,
  cashless-vs-reimbursement **Donut**, deduction (from bill breakup where available). Reimbursement **TAT
  is a governed "Not available"** card — the canonical claim has no receipt/payment date fields; TAT is
  never computed from admission/discharge or substituted.
- **`/metrics/maternity`** (`Maternity.tsx`): conservative governed identification (keyword list + ICD-10
  chapter-O on `diagnosis_code_l1`; non-matching/undiagnosed excluded, never inferred); count/incurred/avg,
  normal-vs-C-section **Donut** only where distinguishable (else "Not available"), maternity-limit + newborn-
  cover from **confirmed benefit terms only** (else "Not available"), identification-rule caveat. No medical advice.
- **`/metrics/rejection`** (`Rejection.tsx`): rejection = `claim_status='Repudiated'` only; ratio **Gauge**,
  by-claim-type **Donut**, rejected amount. **Top reasons and wrongful-rejection render "Not available"** (no
  reason / reprocessing field on the canonical claim) — never fabricated.
- All three registered for `/metrics/evidence/{metric}`; evidence/caveats/confidence + No-Data + "Not
  available" states throughout; pages math-free (chart geometry in `components/ui/charts/`); nav unchanged
  (20 / 7-6-4-7; Settings outside).

## Sprint 21 — Demographics + SI Utilization (governed endpoints + premium dashboards)
Two new governed backend metric endpoints (read-only aggregation over canonical member/policy/claim,
**no migration**) + two chart-led dashboards on the Sprint 19 kit.
- **`/metrics/demographics`** (`Demographics.tsx`): age-band **BarV**, gender **Donut** (or "Not available"),
  relationship **Donut**, KPI band (members, senior share age≥60, average age, dependent ratio). Uses
  `member.age` directly — no DOB inference; missing age/gender are caveated and excluded, never fabricated.
- **`/metrics/si-utilization`** (`SIUtilization.tsx`): SI-band **BarV**, average-utilization **Gauge**,
  utilization-band **BarH**, under/over-insured **signal** cards, family-floater "Available / Not available".
  Utilization = member incurred ÷ member SI is **backend-computed**; the page passes the API fraction to the
  gauge (geometry in the chart layer). **Aggregate only — no member-level rows / no PII.** Missing SI and
  claims not linked via `member_reference_key` are caveated; under/over-insured are utilization-vs-SI *signals*,
  not actuarial verdicts.
- Both wired in `routes.tsx` `WIRED` (`/demographics`, `/si-utilization`), evidence via `/metrics/evidence/{metric}`,
  No-Data + caveats + confidence preserved. Nav unchanged (20 / 7-6-4-7; Settings outside); pages math-free.

## Sprint 20 — Demo visual parity wave 2: Employee & Family + Renewal / Benchmarking chart retrofit
Frontend-only, reusing the Sprint 19 governed SVG chart kit (no backend, no migration, no new dependency).
- **Employee & Family** (`src/pages/EmployeeFamily.tsx`) moves Placeholder → chart-led dashboard, wired to the
  existing `/metrics/relation` API: KPI band (relationships, top consumer, top share, parent-claim share),
  incurred-by-relationship BarH, relationship-share Donut, drill table, FourQuestions, evidence drawer, No-Data.
  `Unknown`-relationship claims are surfaced as a caveat (never merged); absent parent-share renders "Not available".
- **Renewal Intelligence** Overview retrofit: governed ICR **gauge** + ICR **trend sparkline** (values from
  `/metrics/icr` + `/metrics/trends`) added additively; existing KPIs, adjusted-ICR panel, large-claim summary,
  evidence and decision text preserved. Claims Drivers retrofit: relation **donut**, ailment frequency×severity
  **quadrant**, top-hospital **bar** added above the existing drill tables. No sub-tab count change (still 6).
- **Benefits & Benchmarking** light retrofit: classification-counts **donut** on Overview (from API
  `classification_counts`) and per-feature **client-vs-peer bars** on Benefit Design Features (same-unit, numeric
  rows only). Benchmarking stays benefit-design + policy-T&C only — no claims/ICR/utilization; Not-Comparable and
  evidence states preserved. No sub-tab count change (still 7).
- Guardrail unchanged: all chart geometry stays in `components/ui/charts/`; pages remain KPI/business-math free and
  pass only governed API values. Nav structure intact (20 / 7-6-4-7; Settings outside).

## Sprint 19 — Demo visual parity: chart kit + Executive Summary + Claims / Ailment / Hospital
A reusable **governed SVG chart kit** (`src/components/ui/charts/`) — `KpiStat, Donut, BarH, BarV,
StackedBar, Gauge, Sparkline, Quadrant, Heatmap` + an evidence-aware `ChartFrame` (title, DQ badge,
caveat overlay, No-Data state, evidence drawer). No chart library / no new dependency.
- **Chart-math guardrail:** value→pixel geometry lives ONLY in the charts layer, which is outside the
  no-KPI-math guard path (guard scans `src/pages/*` + `format.ts`). Pages stay strictly math-free and
  pass only governed API values in; displayed numbers are always the API value, formatted for the eye.
- **Executive Summary** upgraded to a premium CXO dashboard: hero KPI band, ICR **gauge**, top claim-driver
  **bar**, claim-mix **donut**, ICR **trend** sparkline, and governed summary widgets (renewal
  recommendation, placement state, benchmark comparable, wellness posture) — all from existing APIs, with
  evidence/caveats retained.
- **Claims / Ailment / Hospital** tabs move from Placeholder to chart-led governed dashboards wired to
  `/metrics/{claims,trends,large-claims,ailment,hospital}`: paid-vs-outstanding, cashless-vs-reimbursement,
  status mix, claim trend, large-claim indicator (Claims); top ailments, frequency×severity quadrant,
  recurring groups, share (Ailment); top providers, network split, concentration, avg claim size (Hospital).
- **No fabrication:** fields the API does not return (hospital city/location, ailment taxonomy beyond
  `diagnosis_code_l1`) render **"Not available"**. Every dashboard has a governed No-Data state, caveats,
  confidence and an evidence drawer. Nav structure unchanged (20 tabs / 7-6-4-7 sub-tabs / Settings outside).

## Sprint 18 — Placement Intelligence (parent tab + 7 sub-tabs)
Placement Intelligence becomes a **parent tab** (`PlacementShell`) — still one of the 20 analytics
tabs — with exactly 7 sub-tabs (`src/pages/Placement.tsx`), each single-sourced from the governed
Sprint 18 `/placement/*` composition APIs via `api.placement(name)`: Placement Overview (`/overview`) ·
Incumbent Defence (`/incumbent-defence`) · RFQ Readiness (`/rfq-readiness`) · Quote Comparison
(`/quote-comparison`) · Terms Comparison (`/terms-comparison`) · Recommendation (`/recommendation`) ·
Evidence (`/evidence/{kind}`).
- The stay-defend / negotiate / RFQ decision is **reused** from the placement-trigger engine, not
  recomputed — Recommendation shows an explicit "Source: renewal Placement Trigger engine" basis and
  matches `/recommendations/placement-trigger`. No browser-side placement or quote math.
- **Quote Comparison** shows a governed **pending / no-quote state** (`quote_data_available: false`) with
  the expected comparison shape — no insurer quotes or pricing are ever fabricated (quote ingestion is a
  future capability).
- **Terms Comparison** is sourced only from Benefit Benchmarking (benefit design + policy terms, claims-
  free) — terms to protect + benchmark gaps to raise, plus Sprint-17 gap actions already sent downstream.
- Operational ICR is shown unchanged and Adjusted / Defendable ICR is kept separate; every view shows DQ
  status, source basis, caveats and an evidence drawer.

## Sprint 17 — Benchmark Gap → Renewal / Savings Sandbox linkage (one-way, governed)
A broker can flag a Benefit Benchmarking gap or send it downstream to the Savings Sandbox for
impact simulation — strictly one-way. On the Benchmarking Gap Analysis and Benefit Design
Features views each row shows a **Simulation-ready / Discussion-only** indicator, a **Flag for
discussion** button and (only for the six mapped features — room rent, co-pay, parent co-pay,
disease cap, maternity limit, corporate buffer) a **Send to Savings Sandbox** button, plus an
action-status badge once acted. Buttons appear only for users with the `benchmark_action`
capability (mirrors the backend write guard; Read-only Testers and Client HR Viewers never see
them). All action creation is server-derived from governed benchmarking data via
`api.benchmarkActions.*` — the browser computes no benchmark or simulation math.
- A fixed caveat states impact simulation runs in Renewal Intelligence / Savings Sandbox and
  that Benchmarking does not compute cost impact.
- The Savings Sandbox shows a read-only **"From benchmark gap"** context banner when opened via
  `?fromAction=<id>` (feature, client value, benchmark value, peer group, classification,
  confidence) — display only. Impact figures still come from the governed simulation service;
  operational ICR is unchanged and output remains a scenario estimate, not a guaranteed saving.
- No claims / ICR / utilization ever appears in the benchmark action payload (design + T&C only).

## Sprint 16 — Benefit Benchmarking UI (parent tab + 7 sub-tabs)
Benefits & Benchmarking becomes a **parent tab** (`BenchmarkingShell`) — still one of the 20 analytics
tabs — hosting exactly 7 sub-tabs (`src/pages/Benchmarking.tsx`), each single-sourced from the governed
Sprint 15 `/benchmarking/*` APIs via `api.benchmarking(name)`: Benchmark Overview (`/overview`) · Benefit
Design Features (`/features`) · Policy Terms Comparison (`/policy-terms-comparison`) · Market / Peer
Comparison (`/peer-comparison`) · Benefit Gap Analysis (`/gap-analysis`) · Discussion Points
(`/discussion-points`) · Evidence / Export (`/evidence/{kind}`).
- Benefit DESIGN + policy terms only — the UI never requests, renders or computes claims / ICR /
  utilization / ailment / hospital-usage / premium-adequacy (asserted by a claims-specific denylist test
  that does not false-positive on legitimate benefit terms like "pre / post hospitalization" or "co-pay").
- Governance states: invalid / too-small peer group → clear "Not Comparable — peer group too small" banner
  (no fabricated benchmark); Not-Comparable features show their reason; missing response → premium pending
  state; every view shows the peer-group definition, confidence and evidence/caveats. Classification badges
  (Same / Above / Below / Different / Not Comparable), evidence drawer, no browser-side benchmark math.

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
