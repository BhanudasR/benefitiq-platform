"""Wellness Planner (foundation) — sequences the governed wellness recommendations
across the renewal timeline. A scaffold derived from opportunities; concrete dates and
owners are set during program setup. No fabricated data. Restricted -> blocked."""
from __future__ import annotations

from .base import WellnessContext, gather, blocked_envelope, pending_envelope, wellness_envelope, select_opportunities


def wellness_planner(wctx: WellnessContext) -> dict:
    sig = gather(wctx)
    if sig["restricted"]:
        return blocked_envelope("wellness_planner", sig, "planner")
    if sig["missing_data"]:
        return pending_envelope("wellness_planner", sig, "planner")

    opps = select_opportunities(sig)
    plan = [{
        "sequence": i + 1,
        "category": o["ailment_category"],
        "intervention": o["suggested_intervention"],
        "target_cohort": {"claim_count": o["affected_cohort"]["claim_count"], "level": "cohort"},
        "milestone": f"Quarter {i + 1} of the pre-renewal cycle",
        "owner": "TBD — assign during program setup",
    } for i, o in enumerate(opps)]

    return wellness_envelope(
        kind="wellness_planner",
        label=f"Wellness plan foundation ({len(plan)} sequenced intervention(s))",
        summary="A governed planning scaffold sequenced from wellness opportunities; dates and owners are set during program setup.",
        sig=sig,
        extra={"plan": plan, "foundation": True,
               "basis": "Sequenced from governed wellness opportunities across the renewal timeline."})
