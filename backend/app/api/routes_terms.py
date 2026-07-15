"""Policy Terms / PDF Intelligence APIs (Sprint 6, read + governed review).

Structured terms load via the existing onboarding pipeline (file_kind='terms').
PDF wording (file_kind='terms_pdf') is uploaded immutably, then Stage-1 deterministic
extraction produces CANDIDATES only — a reviewer confirms/rejects (audited) before any
simulation may use them. No AI, no auto-apply."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Form, Query, HTTPException
from sqlalchemy.orm import Session

from ..api.deps import require_role
from ..core.security import Role
from ..db.session import get_db
from ..models.canonical import BenefitTerm
from ..services.terms import service as terms

router = APIRouter(prefix="/terms", tags=["policy-terms"])
brouter = APIRouter(prefix="/batches", tags=["policy-terms"])


def _run(fn, *a, **k):
    try:
        return fn(*a, **k)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@brouter.post("/{batch_id}/terms/extract")
def terms_extract(batch_id: str, policy_version_id: str = Form(default=""),
                  policy_year: int = Form(default=None),
                  principal: dict = Depends(require_role(Role.REVIEWER)),
                  db: Session = Depends(get_db)):
    return _run(terms.extract_pdf_candidates, db, tenant=principal["tenant_id"],
                actor=principal["sub"], batch_id=batch_id,
                policy_version_id=(policy_version_id or None), policy_year=policy_year)


@brouter.get("/{batch_id}/terms/review")
def terms_review(batch_id: str, principal: dict = Depends(require_role(Role.ANALYST)),
                 db: Session = Depends(get_db)):
    tenant = principal["tenant_id"]
    rows = db.query(BenefitTerm).filter(BenefitTerm.tenant_id == tenant,
                                        BenefitTerm.upload_batch_id == batch_id,
                                        BenefitTerm.status == "candidate").all()
    cands = [terms._term_dict(t) | {"review_required": (t.confidence is not None and float(t.confidence) < 0.85),
                                    "auto_applied": False} for t in rows]
    return {"batch_id": batch_id, "candidate_count": len(cands), "candidates": cands}


@router.post("/{term_id}/confirm")
def terms_confirm(term_id: str, value: float = Form(default=None),
                  principal: dict = Depends(require_role(Role.REVIEWER)),
                  db: Session = Depends(get_db)):
    return _run(terms.confirm_term, db, tenant=principal["tenant_id"], actor=principal["sub"],
                term_id=term_id, value=value)


@router.post("/{term_id}/reject")
def terms_reject(term_id: str, reason: str = Form(...), ignore: bool = Form(default=False),
                 principal: dict = Depends(require_role(Role.REVIEWER)),
                 db: Session = Depends(get_db)):
    return _run(terms.reject_term, db, tenant=principal["tenant_id"], actor=principal["sub"],
                term_id=term_id, reason=reason, ignore=ignore)


@router.get("")
def terms_list(policy_version_id: str | None = Query(None), policy_year: int | None = Query(None),
               status: str | None = Query(None), term_type: str | None = Query(None),
               principal: dict = Depends(require_role(Role.ANALYST)), db: Session = Depends(get_db)):
    return {"terms": terms.list_terms(db, principal["tenant_id"], policy_version_id=policy_version_id,
                                      policy_year=policy_year, status=status, term_type=term_type)}


@router.get("/evidence/{term_id}")
def terms_evidence(term_id: str, principal: dict = Depends(require_role(Role.ANALYST)),
                   db: Session = Depends(get_db)):
    t = _run(terms._get_term, db, principal["tenant_id"], term_id)
    return terms._term_dict(t)
