"""Claims metrics — paid, outstanding, incurred (=paid+outstanding), counts,
average size, ratios, cashless/reimbursement split, open/closed + status split.
Governed + explainable. No ICR here (see icr.py)."""
from __future__ import annotations

from .base import MetricContext, result, incurred_of
from ..profiling import parse_number

_CLOSED = {"Settled Fully", "Settled Partially", "Repudiated"}


def claims_metrics(ctx: MetricContext) -> dict:
    rows = ctx.claims()
    paid = sum(parse_number(c.total_claim_paid) or 0.0 for c in rows)
    outstanding = sum(parse_number(c.outstanding_amount) or 0.0 for c in rows)
    incurred = paid + outstanding
    n = len(rows)
    avg = round(incurred / n, 2) if n else None

    cashless = reimb = 0
    for c in rows:
        t = (c.claim_type or "").strip().lower()
        if "cashless" in t or (not t and c.hospital_is_network is True):
            cashless += 1
        elif "reimb" in t or (not t and c.hospital_is_network is False):
            reimb += 1
    status_split, open_c, closed_c = {}, 0, 0
    for c in rows:
        st = c.claim_status or "Unknown"
        status_split[st] = status_split.get(st, 0) + 1
        if st in _CLOSED:
            closed_c += 1
        else:
            open_c += 1

    value = {
        "paid": paid, "outstanding": outstanding, "incurred": incurred,
        "claim_count": n, "average_claim_size": avg,
        "paid_outstanding_ratio": round(paid / outstanding, 4) if outstanding else None,
        "cashless_count": cashless, "reimbursement_count": reimb,
        "open_claims": open_c, "closed_claims": closed_c, "status_split": status_split,
    }
    return result(
        metric="claims", value=value, numerator=incurred, denominator=n,
        formula="incurred = paid + outstanding ; average_claim_size = incurred / claim_count",
        source_tables=["claim"], ctx=ctx, rows=rows)
