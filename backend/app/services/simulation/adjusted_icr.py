"""Adjusted / Defendable ICR view. Operational ICR is ALWAYS reported unchanged.
The adjusted view excludes flagged one-off large claims (>= tenant large-claim
threshold) to support renewal-defence conversation. It is NOT actuarial truth and
does NOT replace operational ICR."""
from __future__ import annotations

from .base import SimContext, sim_result
from ..metrics.base import get_config, incurred_of

ADJUSTED_LABEL = "Adjusted ICR / Defendable ICR view based on one-off claim review assumptions."


def adjusted_icr_simulation(sctx: SimContext) -> dict:
    rows = sctx.claims()
    threshold = get_config(sctx.db, sctx.tenant)["large_claim_threshold"]
    op = sctx.operational_icr()
    prem = op["premium"]

    one_off, large_incurred = [], 0.0
    for c in rows:
        inc = incurred_of(c)
        if inc >= threshold:
            large_incurred += inc
            one_off.append({"claim_number": c.claim_number, "policy_year": c.policy_year,
                            "incurred": round(inc, 2), "one_off_review_candidate": True})
    adjusted_incurred = op["incurred"] - large_incurred
    adjusted = round(adjusted_incurred / prem * 100, 2) if prem else None
    value = {
        "operational_icr": op["operational_icr"],           # unchanged, always visible
        "operational_incurred": op["incurred"],
        "adjusted_icr": adjusted, "adjusted_label": ADJUSTED_LABEL,
        "adjusted_incurred": round(adjusted_incurred, 2),
        "one_off_large_claim_incurred": round(large_incurred, 2),
        "large_claim_threshold": threshold, "one_off_claims": one_off,
    }
    return sim_result(
        simulation="adjusted_icr",
        formula="AdjustedICR = (Incurred - OneOffLargeClaimIncurred) / Premium x100 ; Operational ICR unchanged",
        inputs={"large_claim_threshold": threshold}, value=value, rows=rows,
        source_fields=["total_claim_paid", "outstanding_amount"], source_tables=["claim", "policy_version"],
        included_claims=len(rows), excluded_claims=0,
        assumptions=["One-off = incurred >= large-claim threshold.",
                     "Large claims remain in operational ICR; only the adjusted VIEW excludes them."],
        caveats=[ADJUSTED_LABEL, "Adjusted ICR is a defensibility view, NOT final actuarial truth; "
                 "operational ICR remains the reported figure."],
        operational_icr=op, ctx=sctx)
