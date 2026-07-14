"""Canonical loader skeleton (Sprint 2).

Loads governed rows from an ACTIVE dataset version into canonical tables. Sprint 2
scope is claims + claim_bill_component ONLY (readiness loader, not analytics).

Governance enforced here:
  * Loads only from an ACTIVE DatasetVersion.
  * Critical rows (quarantined) are NEVER written to canonical tables.
  * Each canonical row inherits data_quality_caveat + restricted from the version,
    so downstream metrics honour the dataset's trust level.
  * Idempotent: re-running does not duplicate rows (keyed by dataset_version + claim).
No KPI/ICR/analytics is computed here — that is a later sprint.
"""
from __future__ import annotations

from ..models.governance import UploadBatch, DatasetVersion, ReviewItem, RawFile
from ..models.canonical import Claim, ClaimBillComponent
from ..canonical.registry import CLAIM_STATUS_MASTER
from ..services.profiling import parse_number, parse_date, is_blank
from ..services import audit, gate
from ..services.onboarding_service import materialize, _get_batch, _latest_version, GateError

_TRUE = {"y", "yes", "true", "1"}
_FALSE = {"n", "no", "false", "0"}

_BILL_COMPONENTS = [
    ("room_charges_claimed", "room", True),
    ("nursing_charges_claimed", "nursing", False),
    ("surgery_charges_claimed", "surgery", False),
]


def _to_date(v):
    d = parse_date(v)
    return d.date() if d else None


def _to_bool(v):
    if is_blank(v):
        return None
    s = str(v).strip().lower()
    return True if s in _TRUE else False if s in _FALSE else None


def _norm_status(v):
    return CLAIM_STATUS_MASTER.get(str(v).strip(), str(v).strip() or None)


def load_canonical(db, *, tenant, actor, batch_id) -> dict:
    batch = _get_batch(db, tenant, batch_id)
    version = _latest_version(db, batch.id)
    if version is None or version.status != "ACTIVE":
        raise GateError("dataset version must be ACTIVE before canonical load")
    if batch.file_kind != "claims":
        # Sprint 2 skeleton: only the claims loader is implemented.
        raise GateError(f"canonical loader for '{batch.file_kind}' is not in Sprint 2 scope")

    m = materialize(db, batch)
    raw: RawFile = m["raw"]
    caveat = gate.carries_caveat(version.readiness_status)
    restricted = bool(version.restricted)

    # rows quarantined at last validation (critical) -> never loaded
    quarantined = {ri.raw_row_index for ri in
                   db.query(ReviewItem).filter(ReviewItem.upload_batch_id == batch.id,
                                               ReviewItem.status == "quarantine").all()}
    # idempotency: claim_numbers already loaded for this dataset version
    existing = {c.claim_number for c in
                db.query(Claim).filter(Claim.dataset_version_id == version.id).all()}

    loaded, skipped_dupe, excluded, bill_rows = 0, 0, 0, 0
    for row in m["mapped"]:
        idx = row.get("__raw_row_index")
        if idx in quarantined:
            excluded += 1
            continue
        claim_no = str(row.get("claim_number", "")).strip()
        if not claim_no:
            excluded += 1
            continue
        if claim_no in existing:
            skipped_dupe += 1
            continue
        claim = Claim(
            tenant_id=tenant, dataset_version_id=version.id, upload_batch_id=batch.id,
            raw_file_id=raw.id, raw_row_index=idx,
            data_quality_caveat=caveat, restricted=restricted,
            policy_number=str(row.get("policy_number", "")).strip() or None,
            claim_number=claim_no,
            member_reference_key=str(row.get("member_reference_key", "")).strip() or None,
            diagnosis_code_l1=str(row.get("diagnosis_code_l1", "")).strip() or None,
            hospital_name=str(row.get("hospital_name", "")).strip() or None,
            date_of_admission=_to_date(row.get("date_of_admission")),
            date_of_discharge=_to_date(row.get("date_of_discharge")),
            sum_insured=parse_number(row.get("sum_insured")),
            total_amount_claimed=parse_number(row.get("total_amount_claimed")),
            total_claim_paid=parse_number(row.get("total_claim_paid")),
            claim_status=_norm_status(row.get("claim_status")),
            hospital_is_network=_to_bool(row.get("hospital_is_network")),
            copay_percentage=parse_number(row.get("copay_percentage")),
        )
        db.add(claim)
        existing.add(claim_no)
        loaded += 1
        for src_field, comp_name, rr_linked in _BILL_COMPONENTS:
            amt = parse_number(row.get(src_field))
            if amt is not None and amt > 0:
                db.add(ClaimBillComponent(
                    tenant_id=tenant, dataset_version_id=version.id, upload_batch_id=batch.id,
                    raw_file_id=raw.id, raw_row_index=idx,
                    data_quality_caveat=caveat, restricted=restricted,
                    claim_number=claim_no, component=comp_name,
                    amount_claimed=amt, room_rent_linked=rr_linked))
                bill_rows += 1

    batch.status = "LOADED"
    summary = {"claims_loaded": loaded, "claims_skipped_duplicate": skipped_dupe,
               "rows_excluded_quarantined": excluded, "bill_components_loaded": bill_rows,
               "data_quality_caveat": caveat, "restricted": restricted,
               "readiness_status": version.readiness_status}
    audit.record(db, tenant_id=tenant, actor=actor, action="LOAD",
                 entity_type="dataset_version", entity_id=version.id, meta=summary)
    db.commit()
    return summary
