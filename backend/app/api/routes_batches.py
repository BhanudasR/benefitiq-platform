"""Batch-scoped onboarding API (Sprint 2): the persistent, audited lifecycle.

upload -> mapping -> validate -> dq -> review-queue -> corrections -> revalidate
-> approve -> activate | override -> load-canonical. Each transition is RBAC-gated
and writes an AuditLog row (in the service layer). No analytics/KPIs here."""
from __future__ import annotations

import json
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session

from ..api.deps import require_role
from ..core.security import Role
from ..db.session import get_db
from ..models.governance import UploadBatch, DatasetVersion, ReviewItem
from ..services import onboarding_service as svc, canonical_loader, mapping_workflow

router = APIRouter(prefix="/batches", tags=["onboarding-lifecycle"])


def _run(fn, *a, **k):
    """Map service exceptions to HTTP status codes."""
    try:
        return fn(*a, **k)
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except svc.GateError as e:
        raise HTTPException(409, str(e))
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


def _ctx(principal):
    return principal["tenant_id"], principal["sub"], Role(principal["role"])


@router.post("")
async def create_batch(file: UploadFile = File(...), file_kind: str = Form(...),
                       principal: dict = Depends(require_role(Role.ANALYST)),
                       db: Session = Depends(get_db)):
    tenant, actor, _ = _ctx(principal)
    data = await file.read()
    batch = _run(svc.register_upload, db, tenant=tenant, actor=actor,
                 file_kind=file_kind, file_name=file.filename, data=data)
    return {"batch_id": batch.id, "status": batch.status, "file_kind": batch.file_kind}


@router.post("/{batch_id}/mapping")
def confirm_mapping(batch_id: str, field_map: str = Form(...),
                    save_profile: bool = Form(default=False),
                    profile_name: str = Form(default="default"),
                    principal: dict = Depends(require_role(Role.REVIEWER)),
                    db: Session = Depends(get_db)):
    tenant, actor, _ = _ctx(principal)
    try:
        fm = json.loads(field_map)
    except json.JSONDecodeError:
        raise HTTPException(400, "field_map must be a JSON object")
    return _run(svc.set_mapping, db, tenant=tenant, actor=actor, batch_id=batch_id,
                field_map=fm, save_profile=save_profile, profile_name=profile_name)


@router.get("/{batch_id}/mapping/review")
def mapping_review(batch_id: str, principal: dict = Depends(require_role(Role.ANALYST)),
                   db: Session = Depends(get_db)):
    tenant, _, _ = _ctx(principal)
    return _run(mapping_workflow.review, db, tenant=tenant, batch_id=batch_id)


@router.post("/{batch_id}/mapping/manual")
def mapping_manual(batch_id: str, raw_column: str = Form(...), decision: str = Form(...),
                   canonical: str = Form(default=""), reason: str = Form(default=""),
                   save_alias: bool = Form(default=False),
                   principal: dict = Depends(require_role(Role.REVIEWER)),
                   db: Session = Depends(get_db)):
    tenant, actor, _ = _ctx(principal)
    return _run(mapping_workflow.manual_decision, db, tenant=tenant, actor=actor,
                batch_id=batch_id, raw_column=raw_column, decision=decision,
                canonical=(canonical or None), reason=(reason or None), save_alias=save_alias)


@router.post("/{batch_id}/validate")
def validate_batch(batch_id: str, principal: dict = Depends(require_role(Role.ANALYST)),
                   db: Session = Depends(get_db)):
    tenant, actor, _ = _ctx(principal)
    r = _run(svc.run_validation, db, tenant=tenant, actor=actor, batch_id=batch_id)
    return {"counts": r["counts"], "clean_rows": r["clean_rows"],
            "warn_rows": r["warn_rows"], "quarantined_rows": r["quarantined_rows"]}


@router.post("/{batch_id}/dq")
def dq_batch(batch_id: str, principal: dict = Depends(require_role(Role.ANALYST)),
             db: Session = Depends(get_db)):
    tenant, actor, _ = _ctx(principal)
    r = _run(svc.run_dq, db, tenant=tenant, actor=actor, batch_id=batch_id)
    return {"dataset_version_id": r["dataset_version_id"],
            "overall_score": r["dq"]["overall_score"], "readiness": r["dq"]["readiness"],
            "components": r["dq"]["components"], "top_gaps": r["dq"]["top_gaps"]}


@router.get("/{batch_id}/review-queue")
def review_queue(batch_id: str, principal: dict = Depends(require_role(Role.ANALYST)),
                 db: Session = Depends(get_db)):
    tenant, _, _ = _ctx(principal)
    batch = _run(svc._get_batch, db, tenant, batch_id)
    items = db.query(ReviewItem).filter(ReviewItem.upload_batch_id == batch.id).all()
    q = [{"raw_row_index": i.raw_row_index, "status": i.status,
          "proposed_action": i.proposed_action, "issues": i.issues}
         for i in items if i.status == "quarantine"]
    return {"batch_id": batch.id, "total": len(items),
            "quarantined_count": len(q), "quarantine": q}


@router.post("/{batch_id}/corrections")
def add_correction(batch_id: str, raw_row_index: int = Form(...), field: str = Form(...),
                   corrected_value: str = Form(...),
                   principal: dict = Depends(require_role(Role.REVIEWER)),
                   db: Session = Depends(get_db)):
    tenant, actor, _ = _ctx(principal)
    return _run(svc.add_correction, db, tenant=tenant, actor=actor, batch_id=batch_id,
                raw_row_index=raw_row_index, field=field, corrected_value=corrected_value)


@router.post("/{batch_id}/revalidate")
def revalidate(batch_id: str, principal: dict = Depends(require_role(Role.ANALYST)),
               db: Session = Depends(get_db)):
    tenant, actor, _ = _ctx(principal)
    r = _run(svc.revalidate, db, tenant=tenant, actor=actor, batch_id=batch_id)
    return {"counts": r["validation"]["counts"], "overall_score": r["dq"]["overall_score"],
            "readiness": r["dq"]["readiness"]}


@router.post("/{batch_id}/approve")
def approve(batch_id: str, principal: dict = Depends(require_role(Role.REVIEWER)),
            db: Session = Depends(get_db)):
    tenant, actor, role = _ctx(principal)
    v = _run(svc.approve, db, tenant=tenant, actor=actor, role=role, batch_id=batch_id)
    return {"dataset_version_id": v.id, "status": v.status, "approved_by": v.approved_by}


@router.post("/{batch_id}/activate")
def activate(batch_id: str, principal: dict = Depends(require_role(Role.REVIEWER)),
             db: Session = Depends(get_db)):
    tenant, actor, _ = _ctx(principal)
    v = _run(svc.activate, db, tenant=tenant, actor=actor, batch_id=batch_id)
    return {"dataset_version_id": v.id, "status": v.status,
            "readiness_status": v.readiness_status, "restricted": v.restricted}


@router.post("/{batch_id}/override")
def override(batch_id: str, reason: str = Form(...),
             principal: dict = Depends(require_role(Role.ADMIN)),
             db: Session = Depends(get_db)):
    tenant, actor, role = _ctx(principal)
    return _run(svc.admin_override, db, tenant=tenant, actor=actor, role=role,
                batch_id=batch_id, reason=reason)


@router.post("/{batch_id}/load-canonical")
def load_canonical(batch_id: str, file_default_year: int = Form(default=None),
                   principal: dict = Depends(require_role(Role.REVIEWER)),
                   db: Session = Depends(get_db)):
    tenant, actor, _ = _ctx(principal)
    return _run(canonical_loader.load_canonical, db, tenant=tenant, actor=actor,
                batch_id=batch_id, file_default_year=file_default_year)


@router.get("/{batch_id}")
def get_batch(batch_id: str, principal: dict = Depends(require_role(Role.ANALYST)),
              db: Session = Depends(get_db)):
    tenant, _, _ = _ctx(principal)
    batch = _run(svc._get_batch, db, tenant, batch_id)
    v = svc._latest_version(db, batch.id)
    return {"batch_id": batch.id, "status": batch.status, "file_kind": batch.file_kind,
            "dataset_version": None if not v else {
                "id": v.id, "status": v.status, "dq_score": float(v.dq_score) if v.dq_score is not None else None,
                "readiness_status": v.readiness_status, "restricted": v.restricted}}
