"""Wellness Recommendations — claim-pattern-based intervention recommendations with
employer/employee impact, ROI tracking basis and next best action per opportunity.
Restricted -> blocked; missing -> pending."""
from __future__ import annotations

from .base import WellnessContext, gather, blocked_envelope, pending_envelope, wellness_envelope, select_opportunities


def wellness_recommendations(wctx: WellnessContext) -> dict:
    sig = gather(wctx)
    if sig["restricted"]:
        return blocked_envelope("wellness_recommendations", sig, "recommendations")
    if sig["missing_data"]:
        return pending_envelope("wellness_recommendations", sig, "recommendations")

    recs = select_opportunities(sig)   # each opportunity already carries intervention + impacts + NBA
    primary = recs[0] if recs else None
    return wellness_envelope(
        kind="wellness_recommendations",
        label=(primary["suggested_intervention"] if primary else "No governed wellness recommendation yet"),
        summary=("Claim-pattern-based wellness recommendations; each is cohort-level, privacy-safe and "
                 "ROI is a tracking basis, not a guaranteed saving."),
        sig=sig,
        extra={"recommendations": recs, "primary_recommendation": primary})
