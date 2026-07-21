"""Read-only Wellness Intelligence APIs (Sprint 12). Governed, claim-pattern-driven,
cohort-level wellness intelligence composed from existing metric outputs. Tenant is
always the authenticated principal's tenant (isolation). No writes, no raw data, no PII,
no individual targeting, no AI, no frontend math."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from ..api.deps import require_role
from ..core.security import Role
from ..db.session import get_db
from ..services.wellness.base import WellnessContext
from ..services.wellness import (overview as w_overview, opportunities as w_opps,
                                 recommendations as w_recs, planner as w_planner,
                                 roi_impact as w_roi)

router = APIRouter(prefix="/wellness", tags=["wellness"])


def _common(
    client_id: str | None = Query(None), policy_id: str | None = Query(None),
    policy_version_id: str | None = Query(None), policy_year: int | None = Query(None),
    year_range: str | None = Query(None), insurer: str | None = Query(None),
    tpa: str | None = Query(None),
):
    return {"client_id": client_id, "policy_id": policy_id, "policy_version_id": policy_version_id,
            "policy_year": policy_year, "year_range": year_range, "insurer": insurer, "tpa": tpa}


def _ctx(principal, db, filters):
    from ..api.deps import enforce_client_scope
    enforce_client_scope(principal, filters)   # Client HR Viewer restricted to assigned clients
    return WellnessContext(db, principal["tenant_id"], filters)


_ENGINES = {
    "overview": w_overview.wellness_overview,
    "opportunities": w_opps.wellness_opportunities,
    "recommendations": w_recs.wellness_recommendations,
    "planner": w_planner.wellness_planner,
    "roi-impact": w_roi.wellness_roi_impact,
}


@router.get("/overview")
def overview(filters: dict = Depends(_common), db: Session = Depends(get_db),
             principal: dict = Depends(require_role(Role.ANALYST))):
    return w_overview.wellness_overview(_ctx(principal, db, filters))


@router.get("/opportunities")
def opportunities(filters: dict = Depends(_common), db: Session = Depends(get_db),
                  principal: dict = Depends(require_role(Role.ANALYST))):
    return w_opps.wellness_opportunities(_ctx(principal, db, filters))


@router.get("/recommendations")
def recommendations(filters: dict = Depends(_common), db: Session = Depends(get_db),
                    principal: dict = Depends(require_role(Role.ANALYST))):
    return w_recs.wellness_recommendations(_ctx(principal, db, filters))


@router.get("/planner")
def planner(filters: dict = Depends(_common), db: Session = Depends(get_db),
            principal: dict = Depends(require_role(Role.ANALYST))):
    return w_planner.wellness_planner(_ctx(principal, db, filters))


@router.get("/roi-impact")
def roi_impact(filters: dict = Depends(_common), db: Session = Depends(get_db),
               principal: dict = Depends(require_role(Role.ANALYST))):
    return w_roi.wellness_roi_impact(_ctx(principal, db, filters))


@router.get("/evidence/{kind}")
def evidence(kind: str, filters: dict = Depends(_common), db: Session = Depends(get_db),
             principal: dict = Depends(require_role(Role.ANALYST))):
    if kind not in _ENGINES:
        raise HTTPException(404, f"unknown wellness kind '{kind}'")
    res = _ENGINES[kind](_ctx(principal, db, filters))
    keys = ("kind", "recommendation", "confidence", "confidence_score", "reliability",
            "evidence_references", "source_metrics_used", "caveats", "restricted",
            "advisory_blocked", "data_quality_status", "assumptions", "unmapped_share",
            "suppressed_cohorts", "k_anonymity_min_cohort_size", "config_version",
            "config_basis", "evidence_completeness")
    return {k: res[k] for k in keys if k in res}
