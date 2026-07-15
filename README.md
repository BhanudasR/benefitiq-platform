# BenefitIQ Platform — Pilot Production (Sprint 0 foundation)

Production foundation for the BenefitIQ **Data Onboarding & Trust Engine**. Sprint 0
is foundation only — **no dashboards, no AI, no analytics, no renewal UI, no engines yet.**

Production principles (enforced from day one):
- No dashboard before trusted data · no analytics before canonical data · no AI before governed facts.
- **Raw data is immutable** (content-addressed, hashed, write-once). Corrections are overlays.
- Every upload/correction/revalidation/activation is auditable. Backend calculates official numbers; the UI never does.

## Stack
React+TS (frontend, later) · Python **FastAPI** · **PostgreSQL** (canonical + governance + audit) ·
S3-compatible object storage (**MinIO**/AWS Mumbai) for immutable raw files · JWT + RBAC + tenant isolation.

## Run (local)
```bash
cd infra && docker compose up -d postgres minio        # Postgres + MinIO
cd ../backend && pip install -r requirements.txt
cp ../.env.example ../.env
uvicorn app.main:app --reload                            # http://localhost:8000/docs
pytest -q                                                # unit tests (no external services)
```

## What Sprint 0 delivers
- Immutable raw upload + SHA-256 hashing (`services/storage.py`, `api/routes_upload.py`).
- Canonical + governance schema aligned to IRDAI **F15** and the BenefitIQ v2 data dictionaries
  (`models/canonical.py`, `models/governance.py`, `canonical/registry.py`).
- Audit-log baseline (append-only) and Auth/RBAC skeleton (ADMIN>REVIEWER>ANALYST, tenant-scoped).
- Masked sample fixtures (`fixtures/`) and unit tests (`backend/tests/`).

## SOURCE OF TRUTH & REFERENCES
**This repository (`benefitiq-platform/`) is the single production source of truth for BenefitIQ.**

- The earlier **Codex** repository and its commits (through `139acf3 Sprint 2 Step 8B: policy and
  member canonical loaders`) are **archived / reference only**. This codebase does **not** depend on
  Codex, does not reconcile against it, and does not copy Codex code unless explicitly instructed.
- The earlier **demo UI** (`BenefitIQ_Demo.html` and its React `.js` sources in the parent folder)
  is a **UX/visual reference only** — it is not production code, carries no production data, and none
  of its hard-coded demo values are used here. Official numbers are computed by this backend.

Governing sources for all schema and logic: the **IRDAI F15 / IIB** health data dictionaries, the
**BenefitIQ v2** data dictionaries, the **BenefitIQ Master Context**, and the approved **Pilot
Production MVP roadmap**. See `ARCHITECTURE.md`.

## What Sprint 1 delivers — Data Onboarding, Validation & Data Quality Score
Sprint 1 adds the governed onboarding pipeline (still no dashboards / no analytics KPIs):

- **Profiling** (`services/tabular.py`, `services/profiling.py`) — decode raw CSV/TSV,
  detect the header row (skips TPA title/preamble rows), per-column dtype/null/distinct/samples.
- **Mapping engine** (`services/mapping.py`) — synonym + fuzzy suggestion of canonical fields,
  per-field and mandatory-weighted overall confidence, reviewer confirm, layout-signature
  **profile reuse**, plus `MappingProfile` model.
- **Validation engine** (`services/validation.py`) — required / type / code-master / business-rule
  checks; field classification **Critical / Important / Optional** (from the registry) mapped to
  **Error / Warning / Info**; governed nuance (an Outstanding claim with no paid amount is INFO, not
  a false error).
- **Data Quality Score** (`services/dq_score.py`) — 8 weighted components with a reconciling
  **explainability object** (`sum(weighted_points) == overall_score`), readiness bands
  (≥85 Analytics Ready · 70–84 Conditional · <70 Not Reliable), and top gaps.
- **Quarantine / review queue** (`services/quarantine.py`) — row-level split (never file-level);
  quarantined rows carry their issues + a proposed correction action.
- **API** (`api/routes_onboarding.py`) — `/onboarding/profile`, `/mapping/suggest`,
  `/mapping/confirm` (REVIEWER+), `/mapping/reuse`, `/validate`, `/dq-score` (full pipeline).

Principle enforced: **no dashboard before trusted data, no analytics before canonical data.** A low
score never blocks raw upload — it blocks *blind* analytics and shows exactly what to fix.

## What Sprint 2 delivers — Persistence, Correction & Governed Canonical Load
Sprint 2 turns the Sprint 1 engines into a durable, audited lifecycle (still no dashboards / AI / KPIs):

- **Persistent onboarding lifecycle** (`services/onboarding_service.py`): upload → mapping → validate
  → dq → correct → revalidate → approve → activate/override → load. Every step persists artifacts,
  writes an `AuditLog` row, and is tenant-scoped. Raw is re-materialised from immutable bytes +
  confirmed mapping + correction overlays — **never mutated**.
- **Persistence** of `MappingProfile`, `ValidationIssue`, `ReviewItem` (review queue), `DQResult`,
  `DatasetVersion`, `CorrectionOverlay`, `OverrideRecord`.
- **Two-gate canonical load** (`services/gate.py`, `services/canonical_loader.py`):
  - Row-level: CRITICAL rows are quarantined and **never** loaded; warn/info load with caveats.
  - Dataset-level: DQ ≥85 → Analytics Ready (Reviewer approval); 70–84 → Conditional (Reviewer
    approval, KPI caveats); <70 → blocked, **Admin override only** → Restricted (mandatory reason +
    full audit; never loads critical rows; downstream advisory outputs stay blocked/caveated).
- **Idempotent claims + bill-component loader skeleton** — writes only clean rows from an ACTIVE
  version, propagating `data_quality_caveat` + `restricted` onto every canonical row.
- **Alembic** migration baseline for the full schema (`migrations/`), plus dev startup auto-create.
- Batch-scoped API (`api/routes_batches.py`); 66 tests (SQLite-backed), including tenant isolation,
  audit-per-transition, override rules, and loader idempotency.

*Not in scope (future):* analytics/KPIs, ICR, Renewal simulation, dashboards, AI Copilot — no
analytics is computed in Sprint 2; this is the trusted-data foundation those will consume.

## What Sprint 3 delivers — Multi-Year Canonical Loaders + Governed Manual Mapping
Sprint 3 expands canonical loading and makes manual mapping a first-class governed workflow (still no analytics/KPIs/dashboards/simulation):

- **Multi-year foundation** — `PolicyVersion` (business policy-year / renewal cycle) is distinct from
  `DatasetVersion` (upload governance). Every canonical Policy/Member/Claim/BillComponent row links to
  `policy_version_id` + `policy_year` where resolvable. Prior years are never overwritten; supports
  1–5+ years dynamically; separate-per-year or combined multi-year files.
- **Policy-year precedence** (`services/policy_version.py`): mapped year → claim/admission date within
  a policy period → file-level default → else `linkage_status='unresolved'` (+ caveat, never silent).
- **Expanded loaders** (`services/canonical_loader.py`): `load_policy`, `load_member` (year-wise
  `member_coverage`), `load_claims` (policy-version + member/policy linkage, outstanding/incurred/
  type/provider, `bill_breakup_available`), and bill-components (room/nursing/surgery today, wider
  vocabulary supported). ACTIVE-only, critical rows excluded, caveat/restricted propagated, idempotent.
- **LoadOutcome** — loaded / skipped / quarantined / warning / unresolved-linkage / caveat / restricted
  / lineage-count / idempotency **plus** policy_years_detected, records_by_policy_year,
  unresolved_policy_year_rows, duplicate_year_or_version_conflicts.
- **Governed manual mapping** (`services/mapping_workflow.py`): confidence tiers (high/medium/low/
  unmapped); Low + Unmapped block confirmation until the user maps or ignores-with-reason; user aliases
  are learned (`MappingProfile` versioned, higher priority) and reused across TPAs/insurers/years;
  every decision written to `MappingAudit` (before/after, confidence, user, reason).
- **Alembic** second migration for all additions; ~14 new tests (80 total).

*Not built (future):* multi-year analytics, ICR/loss-ratio, room-rent maths, Renewal simulation,
dashboards, AI. Sprint 3 only prepares the trusted multi-year canonical data.

## What Sprint 4 delivers — Multi-Year Metric Engine + Core Analytics APIs
Backend-only, read-only metric engine over **governed, activated** canonical data (no dashboards, no KPIs in frontend, no simulation):

- **Governed base** (`services/metrics/base.py`): every metric sources only from ACTIVE dataset
  versions, is tenant-scoped and PolicyVersion/policy-year aware, excludes non-loaded (critical/
  quarantined) rows, propagates Conditional caveats + Restricted status, and returns a reconciling
  evidence object (formula, value, numerator, denominator, source tables, policy_version/year,
  included/excluded rows, caveats, data_quality_status, restricted/conditional, premium_basis, reliability).
- **Metric groups**: portfolio, claims, ICR, multi-year trends, relation, hospital, ailment, large-claims.
- **Formulas**: incurred = paid + outstanding; ICR (operational/paid/outstanding) = ÷ earned premium ×100,
  falling back to **written premium with `basis='written'` + caveat** when earned is unavailable
  (never silent). Medical-inflation **proxy** = YoY Δ average claim size (labelled a proxy).
- **Large claims**: tenant-configurable `MetricConfig` threshold (default ₹10 lakh) — flagged as one-off
  review candidates, never removed from ICR; no adjusted ICR.
- **Read-only APIs** (`api/routes_metrics.py`): `/metrics/{portfolio,claims,icr,trends,relation,hospital,
  ailment,large-claims}` + `/metrics/evidence/{metric}`, with filters (client, policy_id,
  policy_version_id, policy_year, year_range, insurer, TPA, relation, ailment, hospital). Restricted
  datasets return `restricted=true` + advisory-blocked.
- Alembic migration for `metric_config`; ~16 new tests (96 total).

*Not built (future):* dashboards/UI, Renewal simulation, projected/adjusted ICR, room-rent maths,
AI Copilot, Wellness/Placement/PPT, benchmarking/k-anonymity.

## Production UI/UX principle
Production BenefitIQ must preserve the approved demo's premium CXO/broker dashboard experience,
module coverage (all 22 tabs) and decision-first storytelling, while replacing all mock/demo logic with
governed API-driven production data. Backend-first for now; UI starts only after metric/simulation APIs
are stable. Full detail in `PRODUCT_NOTES.md`.

## What Sprint 5 delivers — Renewal Simulation & Savings Sandbox Engine (backend)
Backend-only, read-only what-if simulation over **governed, activated** canonical data — no dashboards, no UI, no AI, no frontend math. Operational ICR is always shown unchanged.

- **Room-rent proportionate deduction** (`simulation/room_rent.py`): Allowed=SI×%, Ratio=Allowed/Actual,
  Deduction%=Max(0,1−Ratio), Claim Saving=Eligible-linked-bill×Deduction%, Portfolio Saving=Σ, Revised
  ICR=(Incurred−Portfolio)/Premium×100. Guardrails: only affected hospitalization claims where actual>allowed,
  only eligible linked components, exclude package/fixed, proxy (lower reliability + caveat) when breakup missing,
  never blanket-applied.
- **Co-pay + parent co-pay** (`copay.py`): Saving = eligible×co-pay%; member out-of-pocket shown; parent scoped to Father/Mother.
- **Disease/procedure cap + maternity sub-limit** (`caps.py`): Saving = Σ Max(0, eligible−cap); employer saving + employee gap risk.
- **Corporate buffer** (`corporate_buffer.py`): estimated floater draw above individual SI.
- **Multi-lever scenario** (`scenario.py`): per-lever + combined (overlap-caveated) revised ICR.
- **Adjusted / Defendable ICR** (`adjusted_icr.py`): excludes one-off large claims for a defensibility VIEW,
  labelled *"Adjusted ICR / Defendable ICR view based on one-off claim review assumptions"* — never replaces
  operational ICR; large claims stay in operational ICR.
- **Balanced Benefit Design** (`balanced_benefit.py`): backend scoring on expected saving, ICR impact, employee
  friction, feasibility, renewal defensibility, data reliability → classification (Preferred / Good option /
  Use carefully / High employee impact / Not recommended unless critical).
- Every result carries a reconciling evidence object (formula, inputs, source fields/tables, included/excluded
  claims + reasons, assumptions, caveats, DQ status, restricted/conditional/advisory-blocked, reliability).
- Read-only `/simulation/*` APIs; `SimulationConfig` (tenant lever defaults); Alembic migration; ~23 new tests.

*Not built (future):* simulation UI (gated until stable), Ask BenefitIQ, Wellness/Placement, PPT/export,
benchmarking/k-anonymity, earned-premium loader (would upgrade denominators from written→earned).
