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