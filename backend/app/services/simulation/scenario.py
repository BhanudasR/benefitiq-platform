"""Multi-lever scenario engine. Runs each requested lever on the same governed data
and reports per-lever saving + a combined view. Combined saving is flagged as an
illustrative upper bound because levers can overlap on the same claims."""
from __future__ import annotations

from .base import SimContext, sim_result
from .room_rent import room_rent_simulation
from .copay import copay_simulation
from .caps import cap_simulation


def scenario_simulation(sctx: SimContext, *, levers: dict) -> dict:
    per_lever, savings = {}, {}
    if levers.get("room_rent_pct") is not None:
        r = room_rent_simulation(sctx, room_rent_pct=levers["room_rent_pct"])
        per_lever["room_rent"] = r["value"]; savings["room_rent"] = r["value"]["portfolio_saving"]
    if levers.get("copay_pct") is not None:
        r = copay_simulation(sctx, copay_pct=levers["copay_pct"])
        per_lever["copay"] = r["value"]; savings["copay"] = r["value"]["employer_saving"]
    if levers.get("parent_copay_pct") is not None:
        r = copay_simulation(sctx, copay_pct=levers["parent_copay_pct"], parent_only=True)
        per_lever["parent_copay"] = r["value"]; savings["parent_copay"] = r["value"]["employer_saving"]
    if levers.get("disease_cap") is not None:
        r = cap_simulation(sctx, proposed_cap=levers["disease_cap"], disease=levers.get("disease"))
        per_lever["disease_cap"] = r["value"]; savings["disease_cap"] = r["value"]["employer_saving"]

    rows = sctx.claims()
    op = sctx.operational_icr()
    prem = op["premium"]
    combined = round(sum(savings.values()), 2)
    combined_icr = round((op["incurred"] - combined) / prem * 100, 2) if prem else None
    caveats = ["Combined saving is an illustrative upper bound; levers may overlap on the same claims.",
               "Operational ICR remains unchanged and is reported alongside the revised view."]
    value = {"levers_applied": list(savings), "per_lever_saving": {k: round(v, 2) for k, v in savings.items()},
             "combined_saving": combined, "combined_revised_icr": combined_icr, "per_lever": per_lever}
    return sim_result(
        simulation="scenario", formula="combined = Sum(per-lever savings) ; RevisedICR=(Incurred-combined)/Premium x100",
        inputs=levers, value=value, rows=rows,
        source_fields=["claim", "claim_bill_component", "policy_version"],
        source_tables=["claim", "claim_bill_component", "policy_version", "member_master"],
        included_claims=len(rows), assumptions=["Each lever applied on governed activated claims."],
        caveats=caveats, operational_icr=op, ctx=sctx)
