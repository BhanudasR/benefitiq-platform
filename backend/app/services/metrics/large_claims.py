"""Large-claim / one-off review-candidate foundation. Flags claims at/above a
tenant-configurable threshold (default Rs 10 lakh). Flagged as one-off review
candidates only — NOT removed from ICR, and no adjusted ICR is computed here."""
from __future__ import annotations

from .base import MetricContext, result, incurred_of, get_config
from ..profiling import parse_number


def large_claim_metrics(ctx: MetricContext) -> dict:
    rows = ctx.claims()
    cfg = get_config(ctx.db, ctx.tenant)
    threshold = cfg["large_claim_threshold"]
    large = []
    for c in rows:
        inc = incurred_of(c)
        if inc >= threshold:
            large.append({"claim_number": c.claim_number, "policy_year": c.policy_year,
                          "incurred": round(inc, 2), "paid": parse_number(c.total_claim_paid) or 0.0,
                          "hospital_name": c.hospital_name, "diagnosis_code_l1": c.diagnosis_code_l1,
                          "one_off_review_candidate": True})
    large.sort(key=lambda x: x["incurred"], reverse=True)
    total_incurred = sum(incurred_of(c) for c in rows)
    large_incurred = sum(x["incurred"] for x in large)
    value = {
        "threshold": threshold, "threshold_source": cfg["source"], "currency": cfg["currency"],
        "large_claim_count": len(large), "large_claim_incurred": round(large_incurred, 2),
        "large_claim_incurred_share": round(large_incurred / total_incurred, 4) if total_incurred else None,
        "large_claims": large,
    }
    return result(
        metric="large_claims", value=value, numerator=len(large), denominator=len(rows) or None,
        formula="flag where incurred >= large_claim_threshold ; flagged, NOT removed from ICR",
        source_tables=["claim"], ctx=ctx, rows=rows,
        caveats=["Large claims are one-off review candidates only; they remain in ICR. "
                 "No adjusted ICR is computed in this sprint."])
