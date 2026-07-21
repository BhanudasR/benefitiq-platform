"""Read-only Placement Intelligence APIs (Sprint 18). A thin composition layer over governed
outputs — it REUSES the renewal placement-trigger engine (never a second decision engine),
Benefit Benchmarking (design + T&C, claims-free) and a governed quote pending state. Tenant-
isolated; Client HR Viewers stay scoped to their assigned clients. No writes, no frontend math,
no fabricated quotes/pricing."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from ..api.deps import require_role, enforce_client_scope
from ..core.security import Role
from ..db.session import get_db
from ..services.placement.context import PlacementContext
from ..services.placement import engine as pe

router = APIRouter(prefix="/placement", tags=["placement"])


def _common(
    client_id: str | None = Query(None), policy_id: str | None = Query(None),
    policy_version_id: str | None = Query(None), policy_year: int | None = Query(None),
    year_range: str | None = Query(None), insurer: str | None = Query(None),
    tpa: str | None = Query(None),
):
    return {"client_id": client_id, "policy_id": policy_id, "policy_version_id": policy_version_id,
            "policy_year": policy_year, "year_range": year_range, "insurer": insurer, "tpa": tpa}


def _ctx(principal, db, filters):
    enforce_client_scope(principal, filters)   # Client HR Viewer restricted to assigned clients
    return PlacementContext(db, principal["tenant_id"], filters)


@router.get("/overview")
def overview(filters: dict = Depends(_common), db: Session = Depends(get_db),
             principal: dict = Depends(require_role(Role.ANALYST))):
    return pe.overview(_ctx(principal, db, filters))


@router.get("/incumbent-defence")
def incumbent_defence(filters: dict = Depends(_common), db: Session = Depends(get_db),
                      principal: dict = Depends(require_role(Role.ANALYST))):
    return pe.incumbent_defence(_ctx(principal, db, filters))


@router.get("/rfq-readiness")
def rfq_readiness(filters: dict = Depends(_common), db: Session = Depends(get_db),
                  principal: dict = Depends(require_role(Role.ANALYST))):
    return pe.rfq_readiness(_ctx(principal, db, filters))


@router.get("/quote-comparison")
def quote_comparison(filters: dict = Depends(_common), db: Session = Depends(get_db),
                     principal: dict = Depends(require_role(Role.ANALYST))):
    return pe.quote_comparison(_ctx(principal, db, filters))


@router.get("/terms-comparison")
def terms_comparison(filters: dict = Depends(_common), db: Session = Depends(get_db),
                     principal: dict = Depends(require_role(Role.ANALYST))):
    return pe.terms_comparison(_ctx(principal, db, filters))


@router.get("/recommendation")
def recommendation(filters: dict = Depends(_common), db: Session = Depends(get_db),
                   principal: dict = Depends(require_role(Role.ANALYST))):
    return pe.recommendation(_ctx(principal, db, filters))


@router.get("/evidence/{kind}")
def evidence(kind: str, filters: dict = Depends(_common), db: Session = Depends(get_db),
             principal: dict = Depends(require_role(Role.ANALYST))):
    if kind not in pe.VIEWS:
        raise HTTPException(404, f"unknown placement kind '{kind}'")
    return pe.evidence(_ctx(principal, db, filters), kind)
