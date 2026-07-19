"""Wellness ROI / Impact Tracking (foundation) — establishes the governed TRACKING BASIS
(baseline per-category claim metrics to measure pre/post) for each wellness opportunity.
ROI is explicitly an estimate / tracking basis, never a guaranteed saving. Post-period
actuals are pending until engagement/outcome data is ingested. Restricted -> blocked."""
from __future__ import annotations

from .base import WellnessContext, gather, blocked_envelope, pending_envelope, wellness_envelope, select_opportunities


def wellness_roi_impact(wctx: WellnessContext) -> dict:
    sig = gather(wctx)
    if sig["restricted"]:
        return blocked_envelope("wellness_roi_impact", sig, "ROI / impact tracking")
    if sig["missing_data"]:
        return pending_envelope("wellness_roi_impact", sig, "ROI / impact tracking")

    opps = select_opportunities(sig)
    tracking = [{
        "category": o["ailment_category"],
        "baseline": {"incurred": o["potential_impact"]["incurred"],
                     "claim_count": o["affected_cohort"]["claim_count"]},
        "tracking_metric": "pre/post incurred and claim frequency for this category across policy years",
        "label": "estimate / tracking basis — NOT a guaranteed saving",
        "actuals_status": "pending — no post-period engagement/outcome data ingested yet",
    } for o in opps]

    return wellness_envelope(
        kind="wellness_roi_impact",
        label="Wellness ROI & impact tracking foundation",
        summary="Baseline tracking basis established per wellness category; ROI is an estimate / tracking basis, not a guaranteed saving.",
        sig=sig,
        extra={"tracking": tracking, "foundation": True,
               "roi_label": "estimate / tracking basis — not a guaranteed saving",
               "actuals_status": "pending"})
