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
