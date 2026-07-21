"""Read-only Recommendation APIs (Sprint 10). Governed decision-support that composes
existing metric/simulation outputs into a renewal stance, a placement-trigger decision
and broker next-best-actions. Tenant is always the authenticated principal's tenant
(isolation). No writes, no raw data, no frontend math, no AI."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from ..api.deps import require_role
from ..core.security import Role
from ..db.session import get_db
from ..services.recommendations.base import RecoContext
from ..services.recommendations import renewal as r_renewal, placement as r_placement, nba as r_nba

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


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
    return RecoContext(db, principal["tenant_id"], filters)


_ENGINES = {
    "renewal": r_renewal.renewal_recommendation,
    "placement-trigger": r_placement.placement_trigger,
    "next-best-action": r_nba.next_best_action_reco,
}


@router.get("/renewal")
def renewal(filters: dict = Depends(_common), db: Session = Depends(get_db),
            principal: dict = Depends(require_role(Role.ANALYST))):
    return r_renewal.renewal_recommendation(_ctx(principal, db, filters))


@router.get("/placement-trigger")
def placement_trigger(filters: dict = Depends(_common), db: Session = Depends(get_db),
                      principal: dict = Depends(require_role(Role.ANALYST))):
    return r_placement.placement_trigger(_ctx(principal, db, filters))


@router.get("/next-best-action")
def next_best_action(filters: dict = Depends(_common), db: Session = Depends(get_db),
                     principal: dict = Depends(require_role(Role.ANALYST))):
    return r_nba.next_best_action_reco(_ctx(principal, db, filters))


@router.get("/evidence/{kind}")
def evidence(kind: str, filters: dict = Depends(_common), db: Session = Depends(get_db),
             principal: dict = Depends(require_role(Role.ANALYST))):
    """Reconciliation view: the explainability subset for a given recommendation kind."""
    if kind not in _ENGINES:
        raise HTTPException(404, f"unknown recommendation kind '{kind}'")
    res = _ENGINES[kind](_ctx(principal, db, filters))
    keys = ("kind", "recommendation", "confidence", "confidence_score", "reliability",
            "reasoning", "evidence_references", "source_metrics_used", "caveats",
            "restricted", "advisory_blocked", "data_quality_status", "assumptions",
            "operational_icr", "adjusted_icr", "config_version", "threshold_basis",
            "evidence_completeness")
    return {k: res[k] for k in keys if k in res}
