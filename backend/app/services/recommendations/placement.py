"""Placement Trigger Engine. Decides whether to stay/defend the incumbent, negotiate,
prepare an RFQ, trigger market placement or escalate — with a governed incumbent-defence
score, RFQ readiness, trigger reason and negotiation evidence. Restricted datasets block
advisory output; missing operational ICR yields a cautious 'review'."""
from __future__ import annotations

from .base import RecoContext, gather_signals, reco_result
from . import rules


def _negotiation_evidence(sig: dict) -> dict:
    return {
        "operational_icr": sig["op_icr"],
        "adjusted_icr": sig["adjusted_icr"],
        "large_claim_incurred_share": sig["large_share"],
        "large_claim_count": sig["large_count"],
        "one_off_claims": sig["one_off_claims"],
        "note": "Operational ICR is unchanged; Adjusted / Defendable ICR supports negotiation but never replaces it.",
    }


def placement_trigger(rctx: RecoContext) -> dict:
    sig = gather_signals(rctx)
    cfg = sig["cfg"]

    if sig["restricted"]:
        return reco_result(
            kind="placement_trigger", label="review",
            summary="Dataset is Restricted; a placement decision is blocked pending better data quality.",
            sig=sig,
            reasons=[{"rule": "restricted_block",
                      "explanation": "Restricted datasets block advisory placement decisions.",
                      "evidence": {"data_quality_status": sig["data_quality_status"]}}],
            next_best_action={"rule": "raise_dq", "explanation": "Raise data quality before assessing placement.", "evidence": {}},
            talking_points=[], assumptions=["No placement trigger is issued while the dataset is Restricted."],
            extra={"placement_triggered": "review", "incumbent_defence_score": None,
                   "rfq_readiness": None, "trigger_reason": "Blocked (Restricted dataset).",
                   "negotiation_evidence": _negotiation_evidence(sig), "next_best_actions": []})

    dec = rules.placement_decision(sig, cfg)
    stance, _ = rules.renewal_stance(sig, cfg)
    nbas = rules.next_best_actions(sig, cfg, stance, dec["triggered"])

    label_map = {"yes": "Trigger placement", "no": "Defend incumbent", "review": "Review with Placement Head"}
    return reco_result(
        kind="placement_trigger", label=dec["triggered"],
        summary=f"{label_map[dec['triggered']]}. {dec['reason']}",
        sig=sig, reasons=dec["reasons"],
        next_best_action=nbas[0] if nbas else None,
        talking_points=[
            f"Incumbent-defence score {dec['defence_score']}; RFQ readiness {dec['rfq_readiness']}.",
            "Operational ICR is unchanged; the defence case uses one-off evidence and Adjusted/Defendable ICR.",
        ],
        assumptions=[
            "Scores are weighted from governed signals; thresholds come from RecommendationConfig.",
            "One-off claim review does not delete claims; operational ICR remains the reported figure.",
        ],
        extra={"placement_triggered": dec["triggered"],
               "incumbent_defence_score": dec["defence_score"],
               "rfq_readiness": dec["rfq_readiness"],
               "trigger_reason": dec["reason"],
               "negotiation_evidence": _negotiation_evidence(sig),
               "next_best_actions": nbas})
