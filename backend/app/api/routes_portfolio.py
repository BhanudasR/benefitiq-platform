"""Read-only Portfolio Command Center APIs (Sprint 23). Broker Portfolio (book rollup) and
Client Portfolio (client-360) COMPOSE the existing governed engines — no new decision logic,
no fabricated rollups. Tenant-isolated; Client HR Viewers are scoped to their assigned client.
No writes, no frontend math."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from ..api.deps import require_role, enforce_client_scope
from ..core.security import Role
from ..db.session import get_db
from ..services.portfolio.context import PortfolioContext
from ..services.portfolio import broker as pf_broker, client as pf_client

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


def _common(
    client_id: str | None = Query(None), policy_year: int | None = Query(None),
    insurer: str | None = Query(None), tpa: str | None = Query(None),
):
    return {"client_id": client_id, "policy_year": policy_year, "insurer": insurer, "tpa": tpa}


def _ctx(principal, db, filters):
    enforce_client_scope(principal, filters)   # Client HR Viewer restricted to assigned clients
    return PortfolioContext(db, principal["tenant_id"], filters)


@router.get("/broker-overview")
def broker_overview(filters: dict = Depends(_common), db: Session = Depends(get_db),
                    principal: dict = Depends(require_role(Role.ANALYST))):
    return pf_broker.broker_overview(_ctx(principal, db, filters))


@router.get("/client-overview")
def client_overview(client_id: str = Query(...), db: Session = Depends(get_db),
                    principal: dict = Depends(require_role(Role.ANALYST))):
    filters = {"client_id": client_id}
    ctx = _ctx(principal, db, filters)
    return pf_client.client_overview(ctx, filters["client_id"])


_EVIDENCE = {"broker-overview": pf_broker.broker_overview}


@router.get("/evidence/{kind}")
def evidence(kind: str, filters: dict = Depends(_common), db: Session = Depends(get_db),
             principal: dict = Depends(require_role(Role.ANALYST))):
    if kind not in _EVIDENCE:
        raise HTTPException(404, f"unknown portfolio kind '{kind}'")
    res = _EVIDENCE[kind](_ctx(principal, db, filters))
    keys = ("module", "view", "data_quality_status", "restricted", "advisory_blocked",
            "reliability", "caveats", "formula", "source_basis", "reuses_engine")
    return {k: res[k] for k in keys if k in res}
