"""ICR metrics. Incurred = paid + outstanding.
Operational ICR = incurred / earned_premium x 100 ; Paid ICR = paid / earned x 100 ;
Outstanding ICR = outstanding / earned x 100. Earned premium is used where available;
otherwise written/booked premium is used with basis='written' and an explicit caveat
(never a silent substitution). Every ICR shows numerator, denominator and basis."""
from __future__ import annotations

from .base import MetricContext, result
from ..profiling import parse_number


def icr_metrics(ctx: MetricContext) -> dict:
    rows = ctx.claims()
    paid = sum(parse_number(c.total_claim_paid) or 0.0 for c in rows)
    outstanding = sum(parse_number(c.outstanding_amount) or 0.0 for c in rows)
    incurred = paid + outstanding
    prem = ctx.premium()
    earned = prem["amount"]
    caveats = list(prem["caveats"])

    def icr(num):
        return round(num / earned * 100, 2) if earned else None
    if not earned:
        caveats.append("Premium denominator is 0 or unavailable; ICR cannot be computed.")

    value = {
        "operational_icr": icr(incurred), "paid_icr": icr(paid),
        "outstanding_icr": icr(outstanding),
        "incurred": incurred, "paid": paid, "outstanding": outstanding,
        "earned_premium": earned,
    }
    res = result(
        metric="icr", value=value, numerator=incurred, denominator=earned,
        formula=("incurred = paid + outstanding ; "
                 "operational_icr = incurred / earned_premium x 100 ; "
                 "paid_icr = paid / earned_premium x 100 ; "
                 "outstanding_icr = outstanding / earned_premium x 100"),
        source_tables=["claim", "policy_version"], ctx=ctx, rows=rows,
        caveats=caveats, premium_basis=prem["basis"])
    # premium-side restriction/caveat also propagates
    if prem["restricted"]:
        res["restricted"] = True
        res["advisory_blocked"] = True
        if res["data_quality_status"] != "Restricted":
            res["data_quality_status"] = "Restricted"
    elif prem["conditional"] and res["data_quality_status"] == "Analytics Ready":
        res["data_quality_status"] = "Conditional"
        res["conditional"] = True
    return res
