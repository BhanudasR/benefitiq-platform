"""Read-only Renewal Simulation & Savings Sandbox APIs (Sprint 5). Backend-only
what-if over governed, activated canonical data. Tenant is the authenticated
principal's tenant. Operational ICR is always returned unchanged; Adjusted ICR is
clearly labelled and never replaces it. No writes, no frontend math."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from ..api.deps import require_role
from ..core.security import Role
from ..db.session import get_db
from ..services.simulation.base import SimContext
from ..services.simulation import (room_rent, copay, caps, corporate_buffer,
                                    scenario, adjusted_icr, balanced_benefit)

router = APIRouter(prefix="/simulation", tags=["simulation"])


def _common(
    client_id: str | None = Query(None), policy_id: str | None = Query(None),
    policy_version_id: str | None = Query(None), policy_year: int | None = Query(None),
    year_range: str | None = Query(None), insurer: str | None = Query(None),
    tpa: str | None = Query(None), relation: str | None = Query(None),
    ailment: str | None = Query(None), hospital: str | None = Query(None),
):
    return {"client_id": client_id, "policy_id": policy_id, "policy_version_id": policy_version_id,
            "policy_year": policy_year, "year_range": year_range, "insurer": insurer, "tpa": tpa,
            "relation": relation, "ailment": ailment, "hospital": hospital}


def _ctx(principal, db, filters):
    return SimContext(db, principal["tenant_id"], filters)


def _run(fn, *a, **k):
    try:
        return fn(*a, **k)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/room-rent")
def sim_room_rent(room_rent_pct: float | None = Query(None), filters: dict = Depends(_common),
                  db: Session = Depends(get_db), principal: dict = Depends(require_role(Role.ANALYST))):
    return _run(room_rent.room_rent_simulation, _ctx(principal, db, filters), room_rent_pct=room_rent_pct)


@router.get("/copay")
def sim_copay(copay_pct: float | None = Query(None), filters: dict = Depends(_common),
              db: Session = Depends(get_db), principal: dict = Depends(require_role(Role.ANALYST))):
    return _run(copay.copay_simulation, _ctx(principal, db, filters), copay_pct=copay_pct)


@router.get("/parent-copay")
def sim_parent_copay(parent_copay_pct: float | None = Query(None), filters: dict = Depends(_common),
                     db: Session = Depends(get_db), principal: dict = Depends(require_role(Role.ANALYST))):
    return _run(copay.copay_simulation, _ctx(principal, db, filters),
                copay_pct=parent_copay_pct, parent_only=True)


@router.get("/disease-cap")
def sim_disease_cap(proposed_cap: float | None = Query(None), disease: str | None = Query(None),
                    filters: dict = Depends(_common), db: Session = Depends(get_db),
                    principal: dict = Depends(require_role(Role.ANALYST))):
    return _run(caps.cap_simulation, _ctx(principal, db, filters),
                proposed_cap=proposed_cap, disease=disease, kind="disease")


@router.get("/maternity-sublimit")
def sim_maternity(proposed_cap: float | None = Query(None), filters: dict = Depends(_common),
                  db: Session = Depends(get_db), principal: dict = Depends(require_role(Role.ANALYST))):
    return _run(caps.cap_simulation, _ctx(principal, db, filters),
                proposed_cap=proposed_cap, kind="maternity")


@router.get("/corporate-buffer")
def sim_buffer(filters: dict = Depends(_common), db: Session = Depends(get_db),
               principal: dict = Depends(require_role(Role.ANALYST))):
    return _run(corporate_buffer.corporate_buffer_simulation, _ctx(principal, db, filters))


@router.get("/scenario")
def sim_scenario(room_rent_pct: float | None = Query(None), copay_pct: float | None = Query(None),
                 parent_copay_pct: float | None = Query(None), disease_cap: float | None = Query(None),
                 disease: str | None = Query(None), filters: dict = Depends(_common),
                 db: Session = Depends(get_db), principal: dict = Depends(require_role(Role.ANALYST))):
    levers = {"room_rent_pct": room_rent_pct, "copay_pct": copay_pct,
              "parent_copay_pct": parent_copay_pct, "disease_cap": disease_cap, "disease": disease}
    return _run(scenario.scenario_simulation, _ctx(principal, db, filters), levers=levers)


@router.get("/adjusted-icr")
def sim_adjusted_icr(filters: dict = Depends(_common), db: Session = Depends(get_db),
                     principal: dict = Depends(require_role(Role.ANALYST))):
    return _run(adjusted_icr.adjusted_icr_simulation, _ctx(principal, db, filters))


@router.get("/balanced-design")
def sim_balanced(room_rent_pct: float | None = Query(None), copay_pct: float | None = Query(None),
                 parent_copay_pct: float | None = Query(None), disease_cap: float | None = Query(None),
                 filters: dict = Depends(_common), db: Session = Depends(get_db),
                 principal: dict = Depends(require_role(Role.ANALYST))):
    return _run(balanced_benefit.balanced_benefit_design, _ctx(principal, db, filters),
                room_rent_pct=room_rent_pct, copay_pct=copay_pct,
                parent_copay_pct=parent_copay_pct, disease_cap=disease_cap)


_EVIDENCE = {"room-rent": lambda c: room_rent.room_rent_simulation(c),
             "copay": lambda c: copay.copay_simulation(c),
             "adjusted-icr": lambda c: adjusted_icr.adjusted_icr_simulation(c),
             "corporate-buffer": lambda c: corporate_buffer.corporate_buffer_simulation(c)}


@router.get("/evidence/{simulation}")
def sim_evidence(simulation: str, filters: dict = Depends(_common), db: Session = Depends(get_db),
                 principal: dict = Depends(require_role(Role.ANALYST))):
    if simulation not in _EVIDENCE:
        raise HTTPException(404, f"unknown simulation '{simulation}'")
    r = _EVIDENCE[simulation](_ctx(principal, db, filters))
    keys = ("simulation", "formula", "inputs", "value", "source_fields", "source_tables",
            "included_claims", "excluded_claims", "excluded_reasons", "assumptions", "caveats",
            "data_quality_status", "restricted", "conditional", "advisory_blocked", "reliability",
            "operational_icr")
    return {k: r[k] for k in keys if k in r}
