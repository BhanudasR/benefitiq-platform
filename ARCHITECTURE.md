# Architecture note — Sprint 0

> **Single source of truth:** this repo is the sole production codebase. The Codex repo (through
> `139acf3`) is archived/reference only; the `BenefitIQ_Demo.html` UI is a visual reference only,
> not production code and carrying no production values. Governing sources: IRDAI F15/IIB + BenefitIQ
> v2 dictionaries, BenefitIQ Master Context, and the approved Pilot Production MVP roadmap.

## Layers (five-layer, per BenefitIQ Master Context)
1. Ingestion — immutable raw store (content-addressed, hashed). `services/storage.py`.
2. Normalization — mapping → standardize → validate → DQ → quarantine (next sprint).
3. Warehouse — PostgreSQL canonical tables + governance + overlays + versions + lineage.
4. Analytics/metric engine — backend-only (next sprint).
5. Presentation — API-driven React UI (later).

## Onboarding state machine (governance)
UPLOADED → PROFILED → MAPPING_SUGGESTED → MAPPING_CONFIRMED → STANDARDIZED → VALIDATED →
DQ_SCORED → REVIEW(quarantine+overlays) → REVALIDATED → APPROVED → CANONICAL_LOADED → ANALYTICS_READY.
Sprint 0 implements UPLOADED (+ immutability, hashing, audit, RBAC). The rest are scaffolded in the schema.

## Data model
- Governance: raw_file, upload_batch, dataset_version, correction_overlay, validation_issue, dq_result, audit_log.
- Canonical (F15-aligned): client_master, policy_master, member_master, claim, claim_bill_component.
- Every canonical row carries lineage: dataset_version_id + upload_batch_id + raw_file_id + raw_row_index.
- Governed value normalization: claim_status (1/2/3/4), relationship, gender masters in `canonical/registry.py`.

## Immutability & corrections
Raw objects are write-once (SHA-256 addressed; overwrite with different bytes is refused). Corrections
are stored as `correction_overlay` rows (raw_row_index + field + raw_value + corrected_value) and applied
at canonical load — raw is never mutated.

## Security
JWT bearer + role hierarchy (ADMIN>REVIEWER>ANALYST). Every principal carries tenant_id; all governance and
canonical rows are tenant-scoped. Encryption at rest.

**RBAC → Settings/Admin evolution (future sprint, additive — no redesign):** the pilot ladder evolves into
a persisted **User / Role / Permission / Assignment** model with a role→permission mapping and a
permission-based dependency (`require_permission`) alongside `require_role`. Backend stays the **source of
truth** for permissions; the frontend renders access from backend-provided permissions (no hard-coded
access logic in UI). Tenant isolation, JWT issuance and AuditLog are unchanged — the expanded broker/client
roles and permission groups are a superset of today's model. See `PRODUCT_NOTES.md` → "Settings / Admin
Panel (roadmap)". Every user/role/permission change is audited; admin override requires a reason; deleting
a user never removes audit history.

## Sprint 1 — Onboarding pipeline (Normalization layer)
State machine advanced: UPLOADED -> **PROFILED -> MAPPING_SUGGESTED -> MAPPING_CONFIRMED ->
VALIDATED -> DQ_SCORED -> REVIEW**. Engines are pure/testable (stdlib only) and operate on
canonical-mapped rows carrying `__raw_row_index` for lineage back to immutable raw.

- Profiling: header-row detection by column-width consistency + label heuristics.
- Mapping: registry-governed synonym/fuzzy match; confidence; `layout_signature` for profile reuse.
- Validation: tier->severity (Critical=Error/quarantine, Important=Warning, Optional=Info) + claims
  business rules (paid<=claimed, discharge>=admission, settled-has-paid); outstanding-claim exception.
- DQ score: 8 weighted components (0.25/0.15/0.15/0.15/0.10/0.10/0.05/0.05); explainability
  reconciles to the overall; bands drive the analytics gate. This is the Data Readiness Score.
- Quarantine: row-level review queue; corrections will land as overlays (raw never mutated).

Not yet wired: DB-session persistence of MappingProfile/ValidationIssue/DQResult (models exist);
correction-overlay apply + re-validate loop; canonical loaders. Those are Sprint 2 candidates.

## Sprint 2 — Persistence, Correction & Governed Load (Warehouse layer)
State machine now persisted on UploadBatch + DatasetVersion:
UPLOADED → MAPPED → VALIDATED → DQ_SCORED → IN_REVIEW → REVALIDATED → APPROVED → ACTIVE(/Restricted)
→ LOADED. Orchestration in `services/onboarding_service.py`; every transition writes AuditLog.

Two-gate model (`services/gate.py`):
- Row gate (always): critical/quarantined rows never load; warn/info load with caveats.
- Dataset gate (by DQ): >=85 Analytics Ready · 70-84 Conditional · <70 Restricted via Admin override
  (mandatory reason, OverrideRecord captures user/timestamp/tenant/version/score/failed-components/
  impacted-modules/reason/resulting-status). Restricted + caveat flags propagate onto canonical rows.

Immutability: raw bytes are read from the object store and re-materialised with confirmed mapping +
correction overlays on every validate/dq/load. Corrections are overlays (CorrectionOverlay); raw is
never rewritten. Canonical loader (`services/canonical_loader.py`) is idempotent (keyed by dataset
version + claim_number) and Sprint-2-scoped to claims + claim_bill_component only.

Migrations: Alembic baseline under `migrations/` (target_metadata = Base.metadata; sqlite batch mode
for dev, Postgres for prod). Dev/pilot may auto-create tables on startup (BIQ_AUTO_CREATE_TABLES).
Still future: analytics/metric engine, Renewal simulation, policy/member loaders, dashboards, AI.

## Sprint 10 — Recommendation engines (Analytics/decision-support layer)
Backend-only governed decision-support in `services/recommendations/`, composing EXISTING governed
outputs (metric + simulation + terms) into an explainable renewal stance, a placement-trigger decision
and broker next-best-actions. No raw-data access, no frontend math, no AI, no hard-coded recommendations.
- `config.py` reads a new per-tenant **RecommendationConfig** (governed thresholds: ICR bands,
  defensibility / RFQ cutoffs, confidence weights, `config_version`) with documented safe defaults when
  absent. Migration `c7f1a2b3d4e5` (down_revision `bf5b4e9e2a15`) — Alembic chain intact.
- `base.py` gathers signals once (icr/trends/claims/large-claims + adjusted-icr/balanced-design), computes
  a transparent confidence (governed DQ reliability blended with evidence completeness, config-weighted),
  enforces guardrails and assembles the shared explainability envelope.
- `rules.py` is the single, ordered, documented rule set: decision THRESHOLDS come from config (never
  literals); each rule emits its own explanation + evidence reference so output reconciles to source
  metric values. Pure & deterministic.
- `renewal.py` → stance (Defend/Negotiate/Redesign/Place/Monitor); `placement.py` → yes/no/review with
  incumbent-defence score + RFQ readiness + negotiation evidence; `nba.py` → ordered broker actions.
- Read-only API `routes_recommendations.py`: `GET /recommendations/{renewal,placement-trigger,
  next-best-action,evidence/{kind}}` — `require_role(ANALYST)`, tenant-isolated, additive.
Guardrails (enforced + tested): Operational ICR read unchanged; Adjusted / Defendable ICR kept separate and
never substituted; one-off review never deletes claims; savings are scenario evidence, not guaranteed;
Restricted → advisory blocked; Conditional → caveats; missing data → cautious/pending, never fake
certainty; low evidence completeness lowers confidence. Frontend wiring of these engines into the Sprint 9
pending-states is a future sprint.

## Sprint 14 — Admin User Management + RBAC foundation (additive)
Real, admin-managed users land without disturbing the pilot auth or existing tests. New `app_user` table
(migration `e9c3f7a1b2d4`, down_revision `d8a2b4c6e1f3`) stores email/bcrypt-hash/base_role/user_role/
tenant/broker/client_ids/status. `POST /auth/login` authenticates real users (bcrypt, blocks inactive,
updates last_login, audits LOGIN) and mints a token carrying the base role (for existing `require_role`
routes) **plus** granular `user_role`, capabilities, broker_id and client_ids. `/auth/token` and `/auth/me`
are unchanged (backward-compatible; `/auth/me` additively echoes the new fields when present).
- **Roles → capabilities** (`core/security.py` `ROLE_DEFS`): Platform/Broker Admin · EB Head · Consultant/RM
  · Analyst · Client HR Viewer · Read-only Tester, each mapped to a base `Role` + capability set
  (admin/manage_users/upload/approve/view/client_scoped/read_only).
- **Guards** (`api/deps.py`): `require_capability` and `require_admin` are backward-compatible — legacy
  tokens (no `capabilities` claim) are unrestricted, so existing routes/tests are untouched; only real-login
  users are constrained. `enforce_client_scope` restricts Client HR Viewers to their assigned clients on the
  data routers.
- **Admin API** (`routes_admin.py`, `services/users.py`): `/admin/users` CRUD + reset-password/deactivate/
  activate/clients + `/admin/roles`; temporary password shown once (never stored/logged in plain text);
  every action audited via the append-only `AuditLog`. Backend is the source of truth; the SPA Settings/Admin
  area is capability-gated (client + server) and is NOT one of the 20 analytics tabs.

## Sprint 12 — Wellness Intelligence engines (Analytics/decision-support layer)
Backend-only, claim-pattern-driven wellness intelligence in `services/wellness/`, composing existing
governed metric outputs (ailment / claims / relation / trends / demographics). Cohort-level and
privacy-safe; no raw data, no PII, no individual targeting, no AI, no medical advice, no guaranteed ROI.
- `registry.py` — a **deterministic, documented** diagnosis→wellness-category map (ICD-10 chapter/prefix +
  keyword fallback; free-text is gated out of the chapter rule): metabolic, cardiovascular, maternity,
  musculoskeletal, mental wellbeing, respiratory, oncology (awareness/screening, sensitive wording), and an
  explicit "Other/unmapped" bucket (caveated). No LLM/AI classification.
- `config.py` reads a per-tenant **WellnessConfig** (opportunity cutoffs, k-anonymity min cohort size,
  confidence weights, `config_version`) with safe defaults. Migration `d8a2b4c6e1f3` (down_revision
  `c7f1a2b3d4e5`) — Alembic chain intact.
- `base.py` gathers governed metrics once, aggregates claims into wellness categories, enforces
  **k-anonymity suppression** (cohorts below the minimum are dropped, never exposed), computes a transparent
  confidence, and assembles the shared explainability envelope (opportunity/label, affected cohort, claim
  driver, ailment category, potential impact [estimate], confidence, evidence, caveats, DQ status,
  employer/employee impact, suggested intervention, ROI tracking basis, assumptions, next best action).
- Engines: `overview`, `opportunities`, `recommendations`, `planner` (foundation), `roi_impact` (foundation
  — tracking basis only, actuals pending). Read-only API `routes_wellness.py`:
  `GET /wellness/{overview,opportunities,recommendations,planner,roi-impact,evidence/{kind}}` —
  `require_role(ANALYST)`, tenant-isolated, additive.
Guardrails (enforced + tested): claim-pattern-based (not generic); ROI is estimate/tracking basis, never
guaranteed; missing → pending/low confidence; Restricted → advisory blocked; Conditional → caveats; unmapped
share caveated; cohort-level only with k-anonymity; no PII, no individual targeting, no diagnosis advice.
Frontend wiring of the Wellness 4 sub-tabs to these APIs is a future sprint.

## Procedure Intelligence Repository + Benchmark Master (future — governed reference/intelligence layer)
A governed, **versioned** reference layer (distinct from tenant claim data — it is cross-tenant benchmark
intelligence, not client PII) modelling **Specialty → Procedure Group → Procedure → Benchmark Rule →
Benefit Design Rule** for ~350–500 procedures. It sits beside the canonical warehouse and **feeds** the
analytics/metric and simulation engines; it never lets the frontend compute pricing. Design principles:
every benchmark row carries `benchmark_source` + `source_confidence` + `last_updated` (+ `evidence_notes`);
city-tier / hospital-tier variation is first-class; a `suggested_cap` is a candidate that the metric/
simulation engine surfaces **with evidence + caveats + employee-impact**, never as an automatic tariff;
stale rows are flagged; `active_flag` + version history preserve auditability. Procedure mapping reuses the
onboarding mapping/alias discipline (aliases + ICD-10 + free-text claim-description tolerance) so
TPA/hospital naming variation resolves to a governed procedure. Simulation reads it read-only; it is
advisory intelligence, not absolute truth. See `PRODUCT_NOTES.md` → "Procedure Intelligence Repository +
Benchmark Master (roadmap)". Not implemented — direction only.

## Sprint 3 — Multi-Year Canonical Loaders + Governed Manual Mapping
Multi-year model: DatasetVersion (upload/governance) vs PolicyVersion (business policy-year/renewal).
New tables: policy_version, member_coverage, mapping_audit. Canonical rows gain _YearLink
(policy_version_id, policy_year, linkage_status) + retain _Lineage (+ caveat/restricted).

Loaders (services/canonical_loader.py) dispatch by file_kind (policy|member|claims); ACTIVE-only,
exclude quarantined/critical rows, propagate caveat/restricted, idempotent, audited. Policy-year
precedence (services/policy_version.py): mapped year -> date-in-period -> file default -> unresolved
(+caveat, never silent). Members load year-wise coverage (no overwrite); claims link to the correct
policy_version and never mix years; bill components carry year lineage + a bill_breakup_available flag
for future room-rent/renewal simulation. LoadOutcome adds policy-year detail.

Manual mapping (services/mapping_workflow.py): system suggests -> user reviews -> corrects -> system
learns aliases -> audited. Confidence tiers gate confirmation (Low/Unmapped block until mapped or
ignored-with-reason). Aliases persist in a versioned MappingProfile (higher priority) and are reused
across TPAs/insurers/clients/years; MappingAudit records every before/after decision.

Migrations: second Alembic revision chains on the Sprint 2 baseline. Still future: multi-year
analytics, ICR, room-rent maths, Renewal simulation, dashboards, AI, policy-terms/benchmark loaders.

## Sprint 4 — Multi-Year Metric Engine (Analytics layer, backend-only)
services/metrics/: base.py (MetricContext + trust rollup + evidence/result builder), portfolio.py,
claims.py, icr.py, trends.py, dimensions.py (relation/hospital/ailment), large_claims.py. New model:
MetricConfig (tenant large-claim threshold, default Rs 10 lakh). Read-only API routes_metrics.py.

Governance: metrics read ONLY rows whose dataset_version is ACTIVE; tenant-scoped; PolicyVersion/
policy-year partitioned (no cross-year mixing); critical/quarantined rows never reached canonical so
are structurally excluded; Conditional -> caveat, Restricted -> restricted=true + advisory_blocked.
Incurred = paid + outstanding. ICR uses earned premium where present else written premium with
basis='written' + caveat (no silent substitution). Medical inflation is an explicit YoY avg-claim-size
proxy. Large claims flagged (configurable threshold) but never removed from ICR; no adjusted/projected
ICR. Every metric returns a reconciling evidence object. Migration: third Alembic revision chains on
Sprint 3. Still future: dashboards, Renewal simulation, adjusted ICR, room-rent maths, AI, benchmarking.

## Production UI/UX principle (roadmap)
The production frontend must recreate the approved demo's premium CXO/broker UX (all 22 tabs,
decision-first storytelling, explainability + source-evidence chips) on governed, API-driven data — never
hard-coded demo values or frontend KPI math. UI work begins only after metric/simulation APIs stabilise.
See `PRODUCT_NOTES.md`.

## Sprint 5 — Renewal Simulation & Savings Sandbox (backend-only)
services/simulation/: base.py (SimContext reusing the metric engine's governed row-set + operational ICR
+ evidence builder), room_rent.py, copay.py, caps.py, corporate_buffer.py, scenario.py, adjusted_icr.py,
balanced_benefit.py. New model SimulationConfig (tenant lever defaults). Read-only routes_simulation.py.

All simulations are WHAT-IF over the same ACTIVE, tenant-scoped, non-quarantined canonical data used by
metrics; Conditional -> caveat, Restricted -> restricted=true + advisory_blocked. Operational ICR is always
reported unchanged; Adjusted/Defendable ICR is a separate labelled VIEW (large claims stay in operational).
Room-rent enforces its guardrails (affected hospitalization claims only, actual>allowed, eligible linked
components only, package exclusion, proxy+lower-reliability when breakup missing, never blanket). Every output
reconciles (portfolio saving = Σ claim savings) and returns formula/inputs/source/included-excluded/assumptions/
caveats/reliability. Migration: fourth Alembic revision chains on Sprint 4. Still future: simulation UI,
Ask BenefitIQ, export, benchmarking, earned-premium loader.

## Sprint 6 — Policy Terms / PDF Intelligence (backend-only)
New: canonical BenefitTerm (linked to PolicyVersion, year-wise, status candidate/confirmed/rejected/ignored +
source evidence), governance TermsAudit, registry 'terms' table, file_kinds terms + terms_pdf. Structured terms
load via the governed pipeline -> status='confirmed' (method structured). PDF wording -> deterministic Stage-1
regex extractor -> candidates only (never auto-applied); reviewer confirm/reject (reason) writes TermsAudit.
Simulation (services/simulation) resolves confirmed terms first (resolve_lever: confirmed_policy_term >
request_input > config_default) with term_basis + caveat; restricted terms excluded, conditional caveated;
scope = the simulated claims' PolicyVersion(s) (no cross-year bleed). Migration: fifth Alembic revision chains on
Sprint 5. No AI/LLM, no auto-apply, no UI. Still future: AI extraction, OCR, endorsement diffing, terms/renewal UI.

## Sprint 7 — Frontend foundation
frontend/ (React+TS+Vite+Tailwind) API-driven SPA: design system, 22-tab nav shell, auth/tenant/RBAC,
typed governed API client, React Query, shared evidence/caveat/restricted renderer; Executive Summary +
Data Onboarding wired to metrics/onboarding APIs, other tabs premium placeholders. Backend: additive
config-driven CORS + /auth/me only. All numbers from governed APIs; no frontend KPI math.

## Sprint 8 — Renewal/Sandbox UI
frontend/src/pages/{RenewalIntelligence,SavingsSandbox,BalancedBenefitDesign}.tsx wired to /metrics/* and
/simulation/* ; evidence drawer + governance UX reused; api client extended (simulation, terms); no backend
business-logic change; no frontend KPI/savings/scenario math (guard-tested); all 22 routes intact.
