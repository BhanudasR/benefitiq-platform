"""Wellness Opportunities — ranked, governed, claim-driven wellness opportunities.
Cohort-level, k-anonymity enforced. Restricted -> blocked; missing -> pending."""
from __future__ import annotations

from .base import WellnessContext, gather, blocked_envelope, pending_envelope, wellness_envelope, select_opportunities


def wellness_opportunities(wctx: WellnessContext) -> dict:
    sig = gather(wctx)
    if sig["restricted"]:
        return blocked_envelope("wellness_opportunities", sig, "opportunities")
    if sig["missing_data"]:
        return pending_envelope("wellness_opportunities", sig, "opportunities")

    opps = select_opportunities(sig)
    return wellness_envelope(
        kind="wellness_opportunities",
        label=f"{len(opps)} wellness opportunit(y/ies) from claim patterns",
        summary=("Ranked wellness opportunities derived from governed claim patterns; "
                 + (f"lead: {opps[0]['ailment_category']}." if opps else "none clear the governed cutoffs yet.")),
        sig=sig,
        extra={"opportunities": opps})
