"""Room-rent proportionate-deduction simulation.

Allowed Room Rent   = Sum Insured x Proposed Room Rent %
Room Rent Ratio     = Allowed Room Rent / Actual Room Rent
Proportionate Ded % = Max(0, 1 - Room Rent Ratio)
Claim Saving        = Eligible Linked Bill Amount x Proportionate Deduction %
Portfolio Saving    = Sum of claim-level savings
Revised ICR         = (Current Incurred - Portfolio Saving) / Premium Basis x 100

Guardrails: only affected hospitalization claims; only where actual > allowed;
only eligible linked bill components; exclude package/fixed-benefit claims; if bill
breakup missing use PROXY only (lower reliability + caveat); never blanket-apply to
the whole portfolio. Operational ICR is reported unchanged alongside the revised view."""
from __future__ import annotations

from .base import SimContext, get_sim_config, sim_result, is_package_claim
from ..profiling import parse_number


def room_rent_simulation(sctx: SimContext, *, room_rent_pct=None) -> dict:
    cfg = get_sim_config(sctx.db, sctx.tenant, {"room_rent_pct": room_rent_pct})
    pct = cfg["room_rent_pct"]
    rows = sctx.claims()
    billmap = sctx.bill_map([c.claim_number for c in rows])

    per_claim, portfolio_saving = [], 0.0
    included = 0
    excl = {"package_excluded": 0, "no_sum_insured": 0, "bill_breakup_missing_proxy": 0,
            "actual_not_exceeding_allowed": 0}
    proxy_claims = 0
    for c in rows:
        if is_package_claim(c):
            excl["package_excluded"] += 1
            continue
        si = parse_number(c.sum_insured)
        if si is None or si <= 0:
            excl["no_sum_insured"] += 1
            continue
        comps = billmap.get(c.claim_number, [])
        room = [x for x in comps if x.component == "room"]
        if not room:                                   # bill breakup missing -> proxy only
            proxy_claims += 1
            excl["bill_breakup_missing_proxy"] += 1
            continue
        allowed = si * pct
        actual = sum(parse_number(x.amount_claimed) or 0.0 for x in room)
        if actual <= allowed:                          # only where actual exceeds allowed
            excl["actual_not_exceeding_allowed"] += 1
            continue
        ratio = allowed / actual
        deduction = max(0.0, 1.0 - ratio)
        eligible_linked = sum(parse_number(x.amount_claimed) or 0.0
                              for x in comps if x.room_rent_linked)
        saving = round(eligible_linked * deduction, 2)
        portfolio_saving += saving
        included += 1
        per_claim.append({
            "claim_number": c.claim_number, "policy_year": c.policy_year,
            "sum_insured": si, "allowed_room_rent": round(allowed, 2),
            "actual_room_rent": round(actual, 2), "room_rent_ratio": round(ratio, 4),
            "proportionate_deduction_pct": round(deduction, 4),
            "eligible_linked_bill": round(eligible_linked, 2), "claim_saving": saving})

    op = sctx.operational_icr()
    prem = op["premium"]
    revised_icr = round((op["incurred"] - portfolio_saving) / prem * 100, 2) if prem else None
    excluded = sum(excl.values())
    caveats = []
    if proxy_claims:
        caveats.append(f"{proxy_claims} claim(s) have no room-rent bill breakup; excluded from precise "
                       "saving (proxy would carry lower reliability). Do not extrapolate blindly.")
    caveats.append("Savings apply only to affected hospitalization claims where actual room rent "
                   "exceeds the allowed limit, on eligible linked bill components only.")
    value = {
        "proposed_room_rent_pct": pct, "pct_source": cfg["source"],
        "portfolio_saving": round(portfolio_saving, 2),
        "revised_icr": revised_icr, "affected_claims": included, "proxy_claims": proxy_claims,
        "per_claim": per_claim,
    }
    return sim_result(
        simulation="room_rent", formula=(
            "Allowed=SI x pct ; Ratio=Allowed/Actual ; Deduction%=Max(0,1-Ratio) ; "
            "ClaimSaving=EligibleLinkedBill x Deduction% ; Portfolio=Sum ; "
            "RevisedICR=(Incurred-Portfolio)/Premium x100"),
        inputs={"room_rent_pct": pct}, value=value, rows=rows,
        source_fields=["sum_insured", "claim_bill_component.room", "room_rent_linked", "claim_type"],
        source_tables=["claim", "claim_bill_component", "policy_version"],
        included_claims=included, excluded_claims=excluded, excluded_reasons=excl,
        assumptions=[f"Allowed room rent = Sum Insured x {pct}",
                     "Only room_rent_linked bill components are eligible for proportionate deduction.",
                     "Package/fixed-benefit claims excluded."],
        caveats=caveats, operational_icr=op,
        reliability_penalty=1 if proxy_claims else 0, ctx=sctx)
