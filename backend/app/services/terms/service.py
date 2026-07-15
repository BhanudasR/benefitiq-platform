"""Governed terms review/confirmation service (Sprint 6).

PDF candidates are created as status='candidate' and are NOT usable by simulation.
A REVIEWER confirms (optionally correcting the value) or rejects/ignores (reason
mandatory); every decision writes a TermsAudit (before/after). Simulation may read
ONLY status='confirmed', non-restricted terms bound to the relevant PolicyVersion."""
from __future__ import annotations

from ...models.canonical import BenefitTerm
from ...models.governance import DatasetVersion, RawFile, TermsAudit
from ..storage import get_store
from ..profiling import parse_number
from .pdf_extract import extract_pages, detect_term_candidates

CONF_REVIEW = 0.85   # below this a candidate is flagged review_required (all candidates need confirm anyway)


def _get_batch(db, tenant, batch_id):
    from ..onboarding_service import _get_batch as g
    return g(db, tenant, batch_id)


def extract_pdf_candidates(db, *, tenant, actor, batch_id, policy_version_id=None,
                           policy_year=None) -> dict:
    """Deterministic Stage-1 extraction over the immutable raw PDF -> candidates only."""
    batch = _get_batch(db, tenant, batch_id)
    raw = db.get(RawFile, batch.raw_file_id)
    data = get_store().get(raw.storage_key)
    pages = extract_pages(data)
    candidates = detect_term_candidates(pages)
    # lineage: a DRAFT dataset version for this terms-PDF batch (never auto-activated)
    dv = DatasetVersion(tenant_id=tenant, upload_batch_id=batch.id, version_no=1,
                        status="DRAFT", readiness_status="Candidate (unconfirmed)")
    db.add(dv); db.flush()
    stored = []
    for i, c in enumerate(candidates):
        t = BenefitTerm(
            tenant_id=tenant, dataset_version_id=dv.id, upload_batch_id=batch.id,
            raw_file_id=raw.id, raw_row_index=i, data_quality_caveat=False, restricted=False,
            policy_version_id=policy_version_id, policy_year=policy_year,
            linkage_status="resolved" if policy_version_id else "unresolved",
            term_type=c["term_type"], value=c["value"], unit=c["unit"], text_value=c["text_value"],
            status="candidate", method=c["method"], confidence=c["confidence"],
            source_page=c["source_page"], source_snippet=c["source_snippet"])
        db.add(t); db.flush()
        stored.append({"term_id": t.id, "term_type": t.term_type, "value": _val(t),
                       "confidence": float(t.confidence), "method": t.method,
                       "source_page": t.source_page, "source_snippet": t.source_snippet,
                       "review_required": float(t.confidence) < CONF_REVIEW,
                       "auto_applied": False})
    batch.status = "TERMS_EXTRACTED"
    db.commit()
    return {"batch_id": batch.id, "candidate_count": len(stored),
            "note": "Candidates only — NOT applied. Human confirmation required before use.",
            "candidates": stored}


def _val(t):
    return float(t.value) if t.value is not None else t.text_value


def list_terms(db, tenant, *, policy_version_id=None, policy_year=None, status=None,
               term_type=None) -> list[dict]:
    q = db.query(BenefitTerm).filter(BenefitTerm.tenant_id == tenant)
    if policy_version_id:
        q = q.filter(BenefitTerm.policy_version_id == policy_version_id)
    if policy_year is not None:
        q = q.filter(BenefitTerm.policy_year == policy_year)
    if status:
        q = q.filter(BenefitTerm.status == status)
    if term_type:
        q = q.filter(BenefitTerm.term_type == term_type)
    return [_term_dict(t) for t in q.all()]


def _term_dict(t):
    return {"term_id": t.id, "term_type": t.term_type, "value": _val(t), "unit": t.unit,
            "status": t.status, "method": t.method,
            "confidence": float(t.confidence) if t.confidence is not None else None,
            "policy_version_id": t.policy_version_id, "policy_year": t.policy_year,
            "linkage_status": t.linkage_status, "restricted": t.restricted,
            "data_quality_caveat": t.data_quality_caveat,
            "source_page": t.source_page, "source_snippet": t.source_snippet,
            "reason": t.reason, "confirmed_by": t.confirmed_by}


def _get_term(db, tenant, term_id) -> BenefitTerm:
    t = db.get(BenefitTerm, term_id)
    if t is None or t.tenant_id != tenant:
        raise LookupError("term not found for tenant")
    return t


def confirm_term(db, *, tenant, actor, term_id, value=None) -> dict:
    t = _get_term(db, tenant, term_id)
    before_status, before_value = t.status, (str(_val(t)))
    if value is not None:
        t.value = parse_number(value)
    t.status = "confirmed"
    t.confirmed_by = actor
    db.add(TermsAudit(tenant_id=tenant, benefit_term_id=t.id, action="confirm",
                      before_status=before_status, after_status="confirmed",
                      before_value=before_value, after_value=str(_val(t)), actor=actor))
    db.commit()
    return _term_dict(t)


def reject_term(db, *, tenant, actor, term_id, reason, ignore=False) -> dict:
    if not reason or not reason.strip():
        raise ValueError("a reason is mandatory to reject/ignore a term")
    t = _get_term(db, tenant, term_id)
    before_status = t.status
    t.status = "ignored" if ignore else "rejected"
    t.reason = reason.strip()
    db.add(TermsAudit(tenant_id=tenant, benefit_term_id=t.id, action=("ignore" if ignore else "reject"),
                      before_status=before_status, after_status=t.status,
                      before_value=str(_val(t)), after_value=None, reason=reason.strip(), actor=actor))
    db.commit()
    return _term_dict(t)


def terms_lookup(db, tenant, policy_version_ids, term_type):
    """Confirmed, non-restricted term value for the given policy_version scope, or None."""
    ids = [i for i in (policy_version_ids or []) if i]
    if not ids:
        return None
    t = (db.query(BenefitTerm)
         .filter(BenefitTerm.tenant_id == tenant, BenefitTerm.status == "confirmed",
                 BenefitTerm.restricted == False,  # noqa: E712
                 BenefitTerm.term_type == term_type,
                 BenefitTerm.policy_version_id.in_(ids)).first())
    if t is None:
        return None
    return {"term_id": t.id, "value": float(t.value) if t.value is not None else None,
            "unit": t.unit, "conditional": bool(t.data_quality_caveat)}
