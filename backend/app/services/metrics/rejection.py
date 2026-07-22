"""Rejection metrics (Sprint 22) — governed rejection analytics using ONLY the normalized
claim status. A rejection is claim_status == 'Repudiated'; no rejection classification is
invented. Rejection reasons and wrongful-rejection are 'Not available' because the canonical
Claim has no reason / reprocessing-linkage field. Governed + explainable, tenant-scoped."""
from __future__ import annotations

from .base import MetricContext, result
from ..profiling import parse_number

REJECTED_STATUS = "Repudiated"


def _claim_type(c):
    t = (c.claim_type or "").strip().lower()
    if "cashless" in t or (not t and c.hospital_is_network is True):
        return "Cashless"
    if "reimb" in t or (not t and c.hospital_is_network is False):
        return "Reimbursement"
    return "Unknown"


def rejection_metrics(ctx: MetricContext) -> dict:
    rows = ctx.claims()
    total = len(rows)
    rejected = [c for c in rows if (c.claim_status or "") == REJECTED_STATUS]
    rejection_count = len(rejected)
    rejection_amount = round(sum(parse_number(c.total_amount_claimed) or 0.0 for c in rejected), 2) if rejected else None
    rejection_ratio = round(rejection_count / total, 4) if total else None

    by_type: dict = {}
    for c in rejected:
        k = _claim_type(c)
        by_type[k] = by_type.get(k, 0) + 1
    by_claim_type = [{"key": k, "count": v} for k, v in sorted(by_type.items(), key=lambda kv: kv[1], reverse=True)]

    caveats = [
        "Rejection = governed claim_status 'Repudiated' only; no rejection classification is inferred.",
        "Top rejection reasons are Not available: the canonical claim has no rejection-reason field.",
        "Wrongful-rejection / later-paid is Not available: no governed reprocessing or reversal linkage exists.",
    ]
    if not rows:
        caveats.append("No claims in scope.")

    value = {
        "total_claims": total,
        "rejection_count": rejection_count,
        "rejection_amount": rejection_amount,       # None => Not available when no rejected claims
        "rejection_ratio": rejection_ratio,
        "by_claim_type": by_claim_type,
        "top_reasons": None,                        # Not available (no reason field)
        "wrongful_rejection": None,                 # Not available (no reprocessing linkage)
    }
    return result(
        metric="rejection", value=value, numerator=rejection_count, denominator=(total or None),
        formula="rejection = claim_status == 'Repudiated' ; ratio = rejected / total ; "
                "amount = sum(total_amount_claimed) of rejected ; reasons & wrongful-rejection Not available",
        source_tables=["claim"], ctx=ctx, rows=rows, caveats=caveats)
