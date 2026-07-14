"""Persistent, audited onboarding orchestration (Sprint 2).

Turns the Sprint 1 engines into a durable lifecycle over a DB session:
  register_upload -> set_mapping -> run_validation -> run_dq -> add_correction
  -> revalidate -> approve -> activate / admin_override.

Invariants (Gold Standard):
  * Raw is NEVER mutated. Corrections are overlays; rows are re-materialized from
    raw + mapping + overlays every time.
  * Every transition writes an AuditLog row.
  * Every function is tenant-scoped; cross-tenant access raises LookupError.
  * The governed two-gate model (services.gate) decides approval/activation/override.
"""
from __future__ import annotations

from datetime import datetime, timezone

from ..models.governance import (
    RawFile, UploadBatch, DatasetVersion, CorrectionOverlay, MappingProfile,
    ReviewItem, ValidationIssue, DQResult, OverrideRecord,
)
from ..core.security import Role
from ..services import (
    tabular, mapping as mp, validation as vd, dq_score, quarantine, gate,
)
from ..services.storage import get_store
from ..services.hashing import sha256_bytes
from ..services import audit

FILE_KIND_TABLE = {"policy": "policy_master", "member": "member_master",
                   "claims": "claims", "client": "client_master"}


class GateError(Exception):
    """Raised when a governed transition is not permitted by the DQ gate."""


def _now():
    return datetime.now(timezone.utc)


def _table(file_kind: str) -> str:
    if file_kind not in FILE_KIND_TABLE:
        raise ValueError(f"unknown file_kind '{file_kind}'")
    return FILE_KIND_TABLE[file_kind]


def _get_batch(db, tenant: str, batch_id: str) -> UploadBatch:
    b = db.get(UploadBatch, batch_id)
    if b is None or b.tenant_id != tenant:      # tenant isolation
        raise LookupError("batch not found for tenant")
    return b


def _latest_version(db, batch_id: str) -> DatasetVersion | None:
    return (db.query(DatasetVersion)
            .filter(DatasetVersion.upload_batch_id == batch_id)
            .order_by(DatasetVersion.version_no.desc()).first())


def materialize(db, batch: UploadBatch) -> dict:
    """Re-derive canonical-mapped rows from IMMUTABLE raw + confirmed mapping +
    correction overlays. Raw bytes are read, never written."""
    raw = db.get(RawFile, batch.raw_file_id)
    if raw is None or raw.tenant_id != batch.tenant_id:
        raise LookupError("raw file not found for tenant")
    data = get_store().get(raw.storage_key)
    parsed = tabular.parse_table(data)
    table = _table(batch.file_kind)
    field_map = batch.field_map or {
        s["source_header"]: s["suggested_canonical"]
        for s in mp.suggest_mapping(parsed["headers"], table)["suggestions"]
        if s["suggested_canonical"]}
    mapped = mp.remap_rows(parsed["rows"], field_map)
    # apply overlays (row-level, field-level) — never touches raw
    overlays = (db.query(CorrectionOverlay)
                .filter(CorrectionOverlay.upload_batch_id == batch.id).all())
    ov = {(o.raw_row_index, o.field): o.corrected_value for o in overlays}
    if ov:
        for row in mapped:
            idx = row.get("__raw_row_index")
            for (oidx, field), val in ov.items():
                if oidx == idx:
                    row[field] = val
    return {"parsed": parsed, "mapped": mapped, "table": table, "raw": raw}


# --------------------------------------------------------------------------- #
# Lifecycle transitions
# --------------------------------------------------------------------------- #
def register_upload(db, *, tenant, actor, file_kind, file_name, data) -> UploadBatch:
    table = _table(file_kind)
    digest = sha256_bytes(data)
    key = f"{tenant}/{file_kind}/{digest}/{file_name}"
    res = get_store().put_immutable(key, data)
    raw = RawFile(tenant_id=tenant, file_kind=file_kind, file_name=file_name,
                  storage_key=key, sha256=digest, size_bytes=res["size"],
                  uploaded_by=actor, immutable=True)
    db.add(raw); db.flush()
    batch = UploadBatch(tenant_id=tenant, raw_file_id=raw.id, file_kind=file_kind,
                        status="UPLOADED")
    db.add(batch); db.flush()
    audit.record(db, tenant_id=tenant, actor=actor, action="UPLOAD",
                 entity_type="upload_batch", entity_id=batch.id,
                 meta={"sha256": digest, "file_kind": file_kind, "written": res["written"]})
    db.commit()
    return batch


def set_mapping(db, *, tenant, actor, batch_id, field_map, save_profile=False,
                profile_name="default") -> dict:
    batch = _get_batch(db, tenant, batch_id)
    m = materialize(db, batch)
    headers = m["parsed"]["headers"]
    result = mp.confirm_mapping(headers, m["table"], field_map)
    batch.field_map = result["field_map"]
    batch.status = "MAPPED"
    if save_profile and result["confirmed"]:
        db.add(MappingProfile(tenant_id=tenant, file_kind=batch.file_kind,
                              name=profile_name, signature=result["signature"],
                              field_map=result["field_map"], created_by=actor))
    audit.record(db, tenant_id=tenant, actor=actor, action="MAP",
                 entity_type="upload_batch", entity_id=batch.id,
                 meta={"confirmed": result["confirmed"], "missing": result["missing_mandatory"]})
    db.commit()
    return result


def run_validation(db, *, tenant, actor, batch_id) -> dict:
    batch = _get_batch(db, tenant, batch_id)
    m = materialize(db, batch)
    result = vd.validate(m["table"], m["mapped"])
    review = quarantine.build_review_queue(result, m["mapped"])
    # regenerate persisted issues + review items for this batch
    db.query(ValidationIssue).filter(ValidationIssue.upload_batch_id == batch.id).delete()
    db.query(ReviewItem).filter(ReviewItem.upload_batch_id == batch.id).delete()
    for i in result["issues"]:
        db.add(ValidationIssue(
            tenant_id=tenant, upload_batch_id=batch.id, raw_row_index=i["raw_row_index"],
            severity=i["severity"], field=i["field"], rule=i["rule"], message=i["message"],
            quarantined=(result["row_status"].get(i["raw_row_index"]) == "quarantine")))
    for idx, status in result["row_status"].items():
        entry = next((q for q in review["quarantine"] if q["raw_row_index"] == idx), None)
        db.add(ReviewItem(
            tenant_id=tenant, upload_batch_id=batch.id, raw_row_index=idx, status=status,
            proposed_action=(entry or {}).get("proposed_action"),
            issues=[i for i in result["issues"] if i["raw_row_index"] == idx]))
    batch.status = "VALIDATED"
    audit.record(db, tenant_id=tenant, actor=actor, action="VALIDATE",
                 entity_type="upload_batch", entity_id=batch.id, meta=result["counts"])
    db.commit()
    return result


def run_dq(db, *, tenant, actor, batch_id) -> dict:
    batch = _get_batch(db, tenant, batch_id)
    m = materialize(db, batch)
    sug = mp.suggest_mapping(m["parsed"]["headers"], m["table"])
    result = vd.validate(m["table"], m["mapped"])
    lineage = {"sha256": m["raw"].sha256, "version_no": 1, "is_active_version": True}
    dq = dq_score.compute_dq(m["table"], m["mapped"], sug, result, lineage)
    dqrow = DQResult(tenant_id=tenant, upload_batch_id=batch.id,
                     overall_score=dq["overall_score"], readiness=dq["readiness"],
                     components=dq["components"])
    db.add(dqrow); db.flush()
    version = _latest_version(db, batch.id)
    if version is None:
        version = DatasetVersion(tenant_id=tenant, upload_batch_id=batch.id, version_no=1,
                                 status="DRAFT")
        db.add(version)
    version.dq_score = dq["overall_score"]
    version.dq_result_id = dqrow.id
    version.readiness_status = gate.readiness_for(dq["overall_score"])  # indicative until activation
    batch.status = "DQ_SCORED"
    audit.record(db, tenant_id=tenant, actor=actor, action="DQ",
                 entity_type="dataset_version", entity_id=version.id,
                 meta={"score": dq["overall_score"], "readiness": dq["readiness"]})
    db.commit()
    return {"dq": dq, "dataset_version_id": version.id}


def add_correction(db, *, tenant, actor, batch_id, raw_row_index, field, corrected_value) -> dict:
    batch = _get_batch(db, tenant, batch_id)
    m = materialize(db, batch)
    current = next((r.get(field) for r in m["mapped"]
                    if r.get("__raw_row_index") == raw_row_index), None)
    overlay = CorrectionOverlay(
        tenant_id=tenant, upload_batch_id=batch.id, raw_row_index=raw_row_index,
        field=field, raw_value=(None if current is None else str(current)),
        corrected_value=str(corrected_value), corrected_by=actor)
    db.add(overlay); db.flush()
    batch.status = "IN_REVIEW"
    audit.record(db, tenant_id=tenant, actor=actor, action="CORRECT",
                 entity_type="correction_overlay", entity_id=overlay.id,
                 meta={"raw_row_index": raw_row_index, "field": field,
                       "from": overlay.raw_value, "to": overlay.corrected_value})
    db.commit()
    return {"overlay_id": overlay.id, "raw_row_index": raw_row_index, "field": field,
            "raw_value": overlay.raw_value, "corrected_value": overlay.corrected_value}


def revalidate(db, *, tenant, actor, batch_id) -> dict:
    batch = _get_batch(db, tenant, batch_id)
    validation = run_validation(db, tenant=tenant, actor=actor, batch_id=batch_id)
    dq = run_dq(db, tenant=tenant, actor=actor, batch_id=batch_id)
    batch = _get_batch(db, tenant, batch_id)
    batch.status = "REVALIDATED"
    audit.record(db, tenant_id=tenant, actor=actor, action="REVALIDATE",
                 entity_type="upload_batch", entity_id=batch.id,
                 meta={"score": dq["dq"]["overall_score"]})
    db.commit()
    return {"validation": validation, "dq": dq["dq"]}


def approve(db, *, tenant, actor, role: Role, batch_id) -> DatasetVersion:
    batch = _get_batch(db, tenant, batch_id)
    version = _latest_version(db, batch.id)
    if version is None or version.dq_score is None:
        raise GateError("dataset must be DQ-scored before approval")
    score = float(version.dq_score)
    if not gate.can_approve_normally(score):
        raise GateError(f"DQ {score} below {gate.THRESHOLD_CONDITIONAL}: reviewer approval not "
                        "allowed; requires Admin override")
    version.status = "APPROVED"
    version.approved_by = actor
    version.approved_at = _now()
    audit.record(db, tenant_id=tenant, actor=actor, action="APPROVE",
                 entity_type="dataset_version", entity_id=version.id, meta={"score": score})
    db.commit()
    return version


def activate(db, *, tenant, actor, batch_id) -> DatasetVersion:
    batch = _get_batch(db, tenant, batch_id)
    version = _latest_version(db, batch.id)
    if version is None or version.status != "APPROVED":
        raise GateError("dataset must be APPROVED before activation")
    score = float(version.dq_score)
    if gate.requires_admin_override(score):
        raise GateError(f"DQ {score} below threshold: normal activation blocked; Admin override required")
    version.status = "ACTIVE"
    version.readiness_status = gate.readiness_for(score)
    version.restricted = False
    version.activated_by = actor
    version.activated_at = _now()
    batch.status = "ACTIVE"
    audit.record(db, tenant_id=tenant, actor=actor, action="ACTIVATE",
                 entity_type="dataset_version", entity_id=version.id,
                 meta={"score": score, "readiness": version.readiness_status})
    db.commit()
    return version


def admin_override(db, *, tenant, actor, role: Role, batch_id, reason: str) -> dict:
    if role != Role.ADMIN:
        raise PermissionError("only Admin may override a below-threshold dataset")
    if not reason or not reason.strip():
        raise ValueError("override reason is mandatory")
    batch = _get_batch(db, tenant, batch_id)
    version = _latest_version(db, batch.id)
    if version is None or version.dq_score is None:
        raise GateError("dataset must be DQ-scored before override")
    score = float(version.dq_score)
    if not gate.requires_admin_override(score):
        raise GateError(f"DQ {score} is at/above threshold: no override required (use normal approval)")
    dqrow = db.get(DQResult, version.dq_result_id) if version.dq_result_id else None
    failed = gate.failed_components(dqrow.components if dqrow else [])
    impacted = gate.impacted_modules(failed)
    rec = OverrideRecord(
        tenant_id=tenant, dataset_version_id=version.id, upload_batch_id=batch.id,
        admin_user=actor, dq_score=score, failed_components=failed,
        impacted_modules=impacted, reason=reason.strip(), resulting_status=gate.RESTRICTED)
    db.add(rec); db.flush()
    version.status = "ACTIVE"
    version.readiness_status = gate.RESTRICTED
    version.restricted = True
    version.activated_by = actor
    version.activated_at = _now()
    batch.status = "ACTIVE"
    audit.record(db, tenant_id=tenant, actor=actor, action="OVERRIDE",
                 entity_type="dataset_version", entity_id=version.id,
                 meta={"score": score, "reason": reason.strip(),
                       "impacted_modules": impacted, "resulting_status": gate.RESTRICTED})
    db.commit()
    return {"override_id": rec.id, "dataset_version_id": version.id,
            "readiness_status": gate.RESTRICTED, "impacted_modules": impacted,
            "failed_components": failed}
