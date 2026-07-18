"""Renewal Recommendation Engine. Produces a governed renewal stance
(Defend / Negotiate / Redesign / Place / Monitor) with full explainability.
Restricted datasets block advisory output; missing data yields a cautious stance."""
from __future__ import annotations

from .base import RecoContext, gather_signals, reco_result
from . import rules


def _talking_points(sig: dict, stance: str) -> list[str]:
    tp = []
    if sig["op_icr"] is not None:
        tp.append(f"Operational ICR is {sig['op_icr']}% on {sig['premium_basis'] or 'written'} premium (unchanged).")
    if sig["adjusted_icr"] is not None:
        tp.append(f"On a one-off-adjusted basis the Defendable ICR is {sig['adjusted_icr']}% — a defensibility view, not a replacement.")
    if sig["large_share"] is not None and sig["large_count"]:
        tp.append(f"{sig['large_count']} large one-off claim(s) drive {sig['large_share']} of incurred cost.")
    if stance in ("Negotiate", "Redesign") and sig["preferred_levers"]:
        tp.append(f"Defensible savings levers are available: {', '.join(sig['preferred_levers'])}.")
    return tp


def renewal_recommendation(rctx: RecoContext) -> dict:
    sig = gather_signals(rctx)
    cfg = sig["cfg"]

    if sig["restricted"]:
        return reco_result(
            kind="renewal", label="Advisory blocked",
            summary="Dataset is Restricted (below the data-quality threshold); advisory renewal recommendation is blocked.",
            sig=sig,
            reasons=[{"rule": "restricted_block",
                      "explanation": "Restricted datasets block advisory interpretation; figures are directional only.",
                      "evidence": {"data_quality_status": sig["data_quality_status"]}}],
            next_best_action={"rule": "raise_dq", "explanation": "Raise data quality above the restricted threshold before advisory use.", "evidence": {}},
            talking_points=[], assumptions=["No advisory stance is issued while the dataset is Restricted."],
            extra={"stance": "Blocked", "key_drivers": [], "next_best_actions": []})

    stance, reasons = rules.renewal_stance(sig, cfg)
    placement = rules.placement_decision(sig, cfg)
    nbas = rules.next_best_actions(sig, cfg, stance, placement["triggered"])

    if sig["missing_data"]:
        summary = "Governed inputs are incomplete; a cautious Monitor stance is returned until data is available."
    else:
        summary = f"Renewal stance: {stance}. Operational ICR {sig['op_icr']}% on {sig['premium_basis'] or 'written'} premium."

    return reco_result(
        kind="renewal", label=stance, summary=summary, sig=sig,
        reasons=reasons,
        next_best_action=nbas[0] if nbas else None,
        talking_points=_talking_points(sig, stance),
        assumptions=[
            "Operational ICR is read unchanged; Adjusted/Defendable ICR is a separate defensibility view.",
            "Savings-lever figures are scenario evidence, not guaranteed savings.",
        ],
        extra={"stance": stance,
               "key_drivers": [r["explanation"] for r in reasons],
               "next_best_actions": nbas})
