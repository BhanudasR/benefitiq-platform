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
canonical rows are tenant-scoped. Encryption at rest
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
