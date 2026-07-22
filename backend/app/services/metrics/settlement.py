"""Settlement metrics (Sprint 22) — claim settlement status mix, paid vs outstanding,
closed/open, cashless/reimbursement, partial-settlement and deduction (from bill breakup
where available). Governed + explainable, tenant-scoped.

Reimbursement TAT is NOT computed: the canonical Claim has no
Date_of_Receipt_Of_Complete_Claim_Document / Date_of_Payment fields, so TAT is returned as a
governed 'Not available' object (no substitution from admission/discharge dates)."""
from __future__ import annotations

from .base import MetricContext, result, incurred_of
from ...models.canonical import ClaimBillComponent
from ..profiling import parse_number

_CLOSED = {"Settled Fully", "Settled Partially", "Repudiated"}


def _is_cashless(c):
    t = (c.claim_type or "").strip().lower()
    if "cashless" in t or (not t and c.hospital_is_network is True):
        return True
    if "reimb" in t or (not t and c.hospital_is_network is False):
        return False
    return None


def settlement_metrics(ctx: MetricContext) -> dict:
    rows = ctx.claims()
    n = len(rows)
    paid = sum(parse_number(c.total_claim_paid) or 0.0 for c in rows)
    outstanding = sum(parse_number(c.outstanding_amount) or 0.0 for c in rows)
    incurred = paid + outstanding

    status_counts: dict = {}
    closed = open_c = 0
    cashless = reimb = 0
    for c in rows:
        st = c.claim_status or "Unknown"
        status_counts[st] = status_counts.get(st, 0) + 1
        if st in _CLOSED:
            closed += 1
        else:
            open_c += 1
        cl = _is_cashless(c)
        if cl is True:
            cashless += 1
        elif cl is False:
            reimb += 1
    status_distribution = [{"key": k, "count": v, "share": round(v / n, 4) if n else None}
                           for k, v in sorted(status_counts.items(), key=lambda kv: kv[1], reverse=True)]

    # deduction: only from bill-breakup rows linked to in-scope claims (governed, else Not available)
    claim_numbers = {c.claim_number for c in rows if c.claim_number}
    bill_breakup_claims = sum(1 for c in rows if c.bill_breakup_available is True)
    deduction_amount = None
    if claim_numbers:
        comps = ctx.db.query(ClaimBillComponent).filter(
            ClaimBillComponent.tenant_id == ctx.tenant,
            ClaimBillComponent.dataset_version_id.in_(ctx.active_version_ids()),
            ClaimBillComponent.claim_number.in_(list(claim_numbers))).all()
        if comps:
            deduction_amount = round(sum(float(x.deduction_amount) for x in comps if x.deduction_amount is not None), 2)

    caveats = []
    if not rows:
        caveats.append("No claims in scope.")
    if deduction_amount is None:
        caveats.append("Deduction is available only from claims with a bill breakup; none in scope, so deduction is Not available.")

    tat = {
        "available": False,
        "reason": "Reimbursement TAT requires Date_of_Receipt_Of_Complete_Claim_Document and "
                  "Date_of_Payment, which are not present in the current canonical claim data. TAT is "
                  "not computed from admission/discharge dates and is not substituted.",
    }

    value = {
        "claim_count": n,
        "status_distribution": status_distribution,
        "paid": round(paid, 2), "outstanding": round(outstanding, 2), "incurred": round(incurred, 2),
        "closed_count": closed, "open_count": open_c,
        "cashless_count": cashless, "reimbursement_count": reimb,
        "settled_fully_count": status_counts.get("Settled Fully", 0),
        "settled_partially_count": status_counts.get("Settled Partially", 0),
        "repudiated_count": status_counts.get("Repudiated", 0),
        "bill_breakup_claims": bill_breakup_claims,
        "deduction_amount": deduction_amount,
        "tat": tat,
    }
    return result(
        metric="settlement", value=value, numerator=closed, denominator=(n or None),
        formula="settlement status mix from claim_status ; incurred = paid + outstanding ; "
                "deduction summed from claim_bill_component where a bill breakup exists ; TAT Not available",
        source_tables=["claim", "claim_bill_component"], ctx=ctx, rows=rows, caveats=caveats)
