"""Read-only Benefit Benchmarking APIs (Sprint 15). Benchmarks benefit design + policy
terms only, against the internal broker-portfolio peer group. Tenant-isolated; Client HR
Viewers stay scoped to their assigned clients. No claims/ICR/utilization; no writes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from ..api.deps import require_role, enforce_client_scope
from ..core.security import Role
from ..db.session import get_db
from ..services.benchmarking.base import BenchmarkContext
from ..services.benchmarking import comparison as c_cmp, policy_terms as c_terms, gaps as c_gaps, discussion as c_disc

router = APIRouter(prefix="/benchmarking", tags=["benchmarking"])


def _common(
    client_id: str | None = Query(None), policy_id: str | None = Query(None),
    policy_version_id: str | None = Query(None), policy_year: int | None = Query(None),
    insurer: str | None = Query(None), tpa: str | None = Query(None),
):
    return {"client_id": client_id, "policy_id": policy_id, "policy_version_id": policy_version_id,
            "policy_year": policy_year, "insurer": insurer, "tpa": tpa}


def _ctx(principal, db, filters):
    enforce_client_scope(principal, filters)   # Client HR Viewer restricted to assigned clients
    return BenchmarkContext(db, principal["tenant_id"], filters)


_ENGINES = {
    "overview": c_cmp.benchmark_overview,
    "features": c_cmp.benchmark_features,
    "policy-terms-comparison": c_terms.policy_terms_comparison,
    "peer-comparison": c_cmp.peer_comparison,
    "gap-analysis": c_gaps.benefit_gap_analysis,
    "discussion-points": c_disc.discussion_points,
}


@router.get("/overview")
def overview(filters: dict = Depends(_common), db: Session = Depends(get_db),
             principal: dict = Depends(require_role(Role.ANALYST))):
    return c_cmp.benchmark_overview(_ctx(principal, db, filters))


@router.get("/features")
def features(filters: dict = Depends(_common), db: Session = Depends(get_db),
             principal: dict = Depends(require_role(Role.ANALYST))):
    return c_cmp.benchmark_features(_ctx(principal, db, filters))


@router.get("/policy-terms-comparison")
def policy_terms_comparison(filters: dict = Depends(_common), db: Session = Depends(get_db),
                            principal: dict = Depends(require_role(Role.ANALYST))):
    return c_terms.policy_terms_comparison(_ctx(principal, db, filters))


@router.get("/peer-comparison")
def peer_comparison(filters: dict = Depends(_common), db: Session = Depends(get_db),
                    principal: dict = Depends(require_role(Role.ANALYST))):
    return c_cmp.peer_comparison(_ctx(principal, db, filters))


@router.get("/gap-analysis")
def gap_analysis(filters: dict = Depends(_common), db: Session = Depends(get_db),
                 principal: dict = Depends(require_role(Role.ANALYST))):
    return c_gaps.benefit_gap_analysis(_ctx(principal, db, filters))


@router.get("/discussion-points")
def discussion_points(filters: dict = Depends(_common), db: Session = Depends(get_db),
                      principal: dict = Depends(require_role(Role.ANALYST))):
    return c_disc.discussion_points(_ctx(principal, db, filters))


@router.get("/evidence/{kind}")
def evidence(kind: str, filters: dict = Depends(_common), db: Session = Depends(get_db),
             principal: dict = Depends(require_role(Role.ANALYST))):
    if kind not in _ENGINES:
        raise HTTPException(404, f"unknown benchmarking kind '{kind}'")
    res = _ENGINES[kind](_ctx(principal, db, filters))
    keys = ("kind", "summary", "benchmark_domain", "peer_group_definition", "peer_count",
            "valid_peer_group", "confidence", "confidence_score", "reliability", "source",
            "benchmark_basis", "config_version", "config_basis", "caveats", "assumptions",
            "evidence_completeness")
    return {k: res[k] for k in keys if k in res}
