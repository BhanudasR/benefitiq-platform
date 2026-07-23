"""Read-only Source Evidence / Data Quality APIs (Sprint 24). Composes the EXISTING governance
tables (dataset_version, dq_result, validation_issue, mapping_audit, raw_file, upload_batch, ...)
into governed trust views — headline readiness via min-band-gates, a records-weighted secondary
score, issue breakdowns, module readiness (EVIDENCE_MODULE_MAP), source lineage and reconciling
evidence. No writes, no DQ recomputation, no mutation, no migration. Tenant-isolated; Client HR
Viewers are auto-scoped to their assigned client."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from ..api.deps import require_role, enforce_client_scope
from ..core.security import Role
from ..db.session import get_db
from ..services.evidence.context import EvidenceContext
from ..services.evidence import (overview as ev_overview, issues as ev_issues,
                                 readiness as ev_readiness, lineage as ev_lineage,
                                 evidence as ev_evidence)

router = APIRouter(prefix="/data-quality", tags=["data-quality"])


def _common(
    client_id: str | None = Query(None), file_kind: str | None = Query(None),
    severity: str | None = Query(None),
):
    return {"client_id": client_id, "file_kind": file_kind, "severity": severity}


def _ctx(principal, db, filters):
    enforce_client_scope(principal, filters)   # Client HR Viewer restricted to assigned clients
    return EvidenceContext(db, principal["tenant_id"], filters)


@router.get("/overview")
def overview(filters: dict = Depends(_common), db: Session = Depends(get_db),
             principal: dict = Depends(require_role(Role.ANALYST))):
    return ev_overview.dq_overview(_ctx(principal, db, filters))


@router.get("/issues")
def issues(filters: dict = Depends(_common), db: Session = Depends(get_db),
           principal: dict = Depends(require_role(Role.ANALYST))):
    ctx = _ctx(principal, db, filters)
    return ev_issues.issue_breakdown(ctx, filters)


@router.get("/module-readiness")
def module_readiness(filters: dict = Depends(_common), db: Session = Depends(get_db),
                     principal: dict = Depends(require_role(Role.ANALYST))):
    return ev_readiness.module_readiness(_ctx(principal, db, filters))


@router.get("/lineage")
def lineage(filters: dict = Depends(_common), db: Session = Depends(get_db),
            principal: dict = Depends(require_role(Role.ANALYST))):
    return ev_lineage.lineage(_ctx(principal, db, filters))


@router.get("/evidence/{kind}")
def evidence(kind: str, filters: dict = Depends(_common), db: Session = Depends(get_db),
             principal: dict = Depends(require_role(Role.ANALYST))):
    if kind not in ev_evidence.KINDS:
        raise HTTPException(404, f"unknown data-quality evidence kind '{kind}'")
    return ev_evidence.evidence(_ctx(principal, db, filters), kind)
