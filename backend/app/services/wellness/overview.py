"""Wellness Overview — governed population wellness posture from claim patterns.
Restricted -> advisory blocked; missing ailment data -> pending."""
from __future__ import annotations

from .base import WellnessContext, gather, blocked_envelope, pending_envelope, wellness_envelope
from .registry import meta


def wellness_overview(wctx: WellnessContext) -> dict:
    sig = gather(wctx)
    if sig["restricted"]:
        return blocked_envelope("wellness_overview", sig, "overview")
    if sig["missing_data"]:
        return pending_envelope("wellness_overview", sig, "overview")

    cats = sig["categories"]
    preventable_incurred = round(sum(c["incurred"] for c in cats if c["preventable"]), 2)
    supportive_incurred = round(sum(c["incurred"] for c in cats if not c["preventable"]), 2)
    categories_present = [{
        "category_id": c["category_id"], "label": meta(c["category_id"])["label"],
        "claim_count": c["claim_count"], "incurred": c["incurred"], "share": c["share"],
        "preventable": c["preventable"], "recurring": c["recurring"],
    } for c in cats]
    chronic = [meta(c["category_id"])["label"] for c in cats if c["recurring"]]
    top = categories_present[0] if categories_present else None

    return wellness_envelope(
        kind="wellness_overview",
        label=f"{len(cats)} wellness categor(ies) identified from claim patterns",
        summary=("Population wellness posture derived from governed claim patterns; "
                 + (f"top category: {top['label']}." if top else "no dominant category yet.")),
        sig=sig,
        extra={
            "population": {"total_claims": sig["total_claims"], "total_incurred": sig["total_incurred"]},
            "categories_present": categories_present,
            "preventable_incurred": preventable_incurred,
            "supportive_incurred": supportive_incurred,
            "chronic_recurring_categories": chronic,
            "engagement_baseline": {"status": "pending",
                "note": "No wellness engagement / participation data ingested yet; baseline will populate later."},
        })
