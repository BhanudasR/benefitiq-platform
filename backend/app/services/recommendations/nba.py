"""Next Best Action Engine. Returns an ordered, evidence-backed list of broker actions
derived from the same governed signals used by the renewal and placement engines.
Restricted datasets block advisory output."""
from __future__ import annotations

from .base import RecoContext, gather_signals, reco_result
from . import rules


def next_best_action_reco(rctx: RecoContext) -> dict:
    sig = gather_signals(rctx)
    cfg = sig["cfg"]

    if sig["restricted"]:
        return reco_result(
            kind="next_best_action", label="Advisory blocked",
            summary="Dataset is Restricted; advisory next-best-actions are blocked pending better data quality.",
            sig=sig,
            reasons=[{"rule": "restricted_block",
                      "explanation": "Restricted datasets block advisory action generation.",
                      "evidence": {"data_quality_status": sig["data_quality_status"]}}],
            next_best_action={"rule": "raise_dq", "explanation": "Raise data quality above the restricted threshold before advisory use.", "evidence": {}},
            talking_points=[], assumptions=[], extra={"actions": [], "primary_action": None})

    stance, _ = rules.renewal_stance(sig, cfg)
    dec = rules.placement_decision(sig, cfg)
    nbas = rules.next_best_actions(sig, cfg, stance, dec["triggered"])
    primary = nbas[0] if nbas else None

    return reco_result(
        kind="next_best_action",
        label=(primary["explanation"] if primary else "Prepare the client renewal note."),
        summary="Ordered, evidence-backed broker actions derived from governed renewal signals.",
        sig=sig, reasons=nbas,
        next_best_action=primary,
        talking_points=[a["explanation"] for a in nbas],
        assumptions=["Actions are derived from governed signals; savings levers are scenario evidence, not guarantees."],
        extra={"actions": nbas, "primary_action": primary,
               "context": {"stance": stance, "placement_triggered": dec["triggered"]}})
