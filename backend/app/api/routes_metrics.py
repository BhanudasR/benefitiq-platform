"""Read-only metric APIs (Sprint 4). Backend-only metric engine over governed,
activated canonical data. Tenant is always the authenticated principal's tenant
(isolation); other filters come from query params. No writes, no KPIs in frontend."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..api.deps import require_role
from ..core.security import Role
from ..db.session import get_db
from ..services.metrics.base import MetricContext
from ..services.metrics import claims as m_claims, icr as m_icr, portfolio as m_portfolio
from ..services.metrics import trends as m_trends, large_claims as m_large, dimensions as m_dim

router = APIRouter(prefix="/metrics", tags=["metrics"])


def _filters(client_id, policy_id, policy_version_id, policy_year, year_range,
             insurer, tpa, relation, ailment, hospital):
    return {"client_id": client_id, "policy_id": policy_id, "policy_version_id": policy_version_id,
            "policy_year": policy_year, "year_range": year_range, "insurer": insurer, "tpa": tpa,
            "relation": relation, "ailment": ailment, "hospital": hospital}


def _common(
    client_id: str | None = Query(None), policy_id: str | None = Query(None),
    policy_version_id: str | None = Query(None), policy_year: int | None = Query(None),
    year_range: str | None = Query(None), insurer: str | None = Query(None),
    tpa: str | None = Query(None), relation: str | None = Query(None),
    ailment: str | None = Query(None), hospital: str | None = Query(None),
):
    return _filters(client_id, policy_id, policy_version_id, policy_year, year_range,
                    insurer, tpa, relation, ailment, hospital)


_DISPATCH = {
    "portfolio": m_portfolio.portfolio_metrics, "claims": m_claims.claims_metrics,
    "icr": m_icr.icr_metrics, "trends": m_trends.trend_metrics,
    "relation": m_dim.relation_metrics, "hospital": m_dim.hospital_metrics,
    "ailment": m_dim.ailment_metrics, "large-claims": m_large.large_claim_metrics,
}


def _run(metric, principal, db, filters):
    from ..api.deps import enforce_client_scope
    enforce_client_scope(principal, filters)   # Client HR Viewer restricted to assigned clients
    ctx = MetricContext(db, principal["tenant_id"], filters)
    return _DISPATCH[metric](ctx)


@router.get("/portfolio")
def portfolio(filters: dict = Depends(_common), db: Session = Depends(get_db),
              principal: dict = Depends(require_role(Role.ANALYST))):
    return _run("portfolio", principal, db, filters)


@router.get("/claims")
def claims(filters: dict = Depends(_common), db: Session = Depends(get_db),
           principal: dict = Depends(require_role(Role.ANALYST))):
    return _run("claims", principal, db, filters)


@router.get("/icr")
def icr(filters: dict = Depends(_common), db: Session = Depends(get_db),
        principal: dict = Depends(require_role(Role.ANALYST))):
    return _run("icr", principal, db, filters)


@router.get("/trends")
def trends(filters: dict = Depends(_common), db: Session = Depends(get_db),
           principal: dict = Depends(require_role(Role.ANALYST))):
    return _run("trends", principal, db, filters)


@router.get("/relation")
def relation(filters: dict = Depends(_common), db: Session = Depends(get_db),
             principal: dict = Depends(require_role(Role.ANALYST))):
    return _run("relation", principal, db, filters)


@router.get("/hospital")
def hospital(filters: dict = Depends(_common), db: Session = Depends(get_db),
             principal: dict = Depends(require_role(Role.ANALYST))):
    return _run("hospital", principal, db, filters)


@router.get("/ailment")
def ailment(filters: dict = Depends(_common), db: Session = Depends(get_db),
            principal: dict = Depends(require_role(Role.ANALYST))):
    return _run("ailment", principal, db, filters)


@router.get("/large-claims")
def large_claims(filters: dict = Depends(_common), db: Session = Depends(get_db),
                 principal: dict = Depends(require_role(Role.ANALYST))):
    return _run("large-claims", principal, db, filters)


@router.get("/evidence/{metric}")
def evidence(metric: str, filters: dict = Depends(_common), db: Session = Depends(get_db),
             principal: dict = Depends(require_role(Role.ANALYST))):
    from fastapi import HTTPException
    if metric not in _DISPATCH:
        raise HTTPException(404, f"unknown metric '{metric}'")
    res = _run(metric, principal, db, filters)
    # the metric response IS the evidence object; expose the explainability subset
    return {k: res[k] for k in ("metric", "formula", "value", "numerator", "denominator",
            "source_tables", "policy_year", "policy_version_id", "year_range", "included_rows",
            "excluded_rows", "caveats", "data_quality_status", "restricted", "conditional",
            "advisory_blocked", "premium_basis", "reliability") if k in res}
