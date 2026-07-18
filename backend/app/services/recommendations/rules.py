"""Centralised, transparent decision rules for the recommendation engines.

Decision THRESHOLDS come from the governed RecommendationConfig (passed in as `cfg`) —
never hard-coded here. The score-blend WEIGHTS below are documented model structure
(not tenant thresholds) and are kept explicit so every score is explainable. Each rule
returns its own explanation + evidence reference so output reconciles to source values.
Pure and deterministic: same signals + same config => same result."""
from __future__ import annotations

from .base import clamp

# model-structure weights (documented; NOT thresholds). Kept explicit for explainability.
DEFENCE_WEIGHTS = {"event_driven": 0.4, "adjusted_ok": 0.3, "icr_headroom": 0.3}
RFQ_WEIGHTS = {"icr_high": 0.5, "not_defendable": 0.3, "weak_levers": 0.2}


def _reason(rule: str, explanation: str, evidence: dict | None = None) -> dict:
    return {"rule": rule, "explanation": explanation, "evidence": evidence or {}}


def _adjusted_ok(sig: dict, cfg: dict) -> float:
    adj = sig["adjusted_icr"]
    if adj is None:
        return 0.0
    if adj <= cfg["icr_negotiate_max"]:
        return 1.0
    if adj <= cfg["icr_redesign_max"]:
        return 0.5
    return 0.0


# ---- Renewal stance -------------------------------------------------------
def renewal_stance(sig: dict, cfg: dict) -> tuple[str, list[dict]]:
    """Stance in {Defend, Negotiate, Redesign, Place, Monitor}. Ordered, config-driven."""
    op = sig["op_icr"]
    adj = sig["adjusted_icr"]
    share = sig["large_share"] or 0.0
    trend = sig["trend_icr_pct"]
    if op is None:
        return "Monitor", [_reason(
            "missing_operational_icr",
            "Operational ICR is unavailable for this scope; a cautious Monitor stance is returned until governed data is present.")]

    reasons: list[dict] = []
    if op <= cfg["icr_defend_max"]:
        stance = "Defend"
        reasons.append(_reason("icr_comfortable",
            f"Operational ICR {op}% is at or below the comfortable band ({cfg['icr_defend_max']}%).",
            {"operational_icr": op, "icr_defend_max": cfg["icr_defend_max"]}))
    elif share >= cfg["one_off_share_defend_min"] and adj is not None and adj <= cfg["icr_negotiate_max"]:
        stance = "Defend"
        reasons.append(_reason("event_driven_defendable",
            f"Loss is event-driven: one-off large claims are {share} of incurred and Adjusted/Defendable ICR "
            f"{adj}% is within the negotiate band — defend using one-off claim evidence.",
            {"large_claim_incurred_share": share, "adjusted_icr": adj,
             "one_off_share_defend_min": cfg["one_off_share_defend_min"]}))
    elif op <= cfg["icr_negotiate_max"]:
        stance = "Negotiate"
        reasons.append(_reason("icr_moderate",
            f"Operational ICR {op}% is in the moderate band ({cfg['icr_defend_max']}–{cfg['icr_negotiate_max']}%); "
            f"negotiate loading using Adjusted/Defendable ICR and savings levers.",
            {"operational_icr": op, "icr_negotiate_max": cfg["icr_negotiate_max"]}))
    elif op <= cfg["icr_redesign_max"]:
        stance = "Redesign"
        reasons.append(_reason("icr_high",
            f"Operational ICR {op}% is high ({cfg['icr_negotiate_max']}–{cfg['icr_redesign_max']}%); "
            f"redesign benefits via balanced-design levers alongside negotiation.",
            {"operational_icr": op, "icr_redesign_max": cfg["icr_redesign_max"]}))
    else:
        stance = "Place"
        reasons.append(_reason("icr_beyond_redesign",
            f"Operational ICR {op}% exceeds the redesign ceiling ({cfg['icr_redesign_max']}%); "
            f"prepare alternate placement.",
            {"operational_icr": op, "icr_redesign_max": cfg["icr_redesign_max"]}))

    # trend modifier (documented): an adverse YoY ICR trend escalates Negotiate -> Redesign
    if trend is not None and trend >= cfg["trend_worsening_pct"]:
        reasons.append(_reason("adverse_trend",
            f"Adverse trend: ICR moved {trend}% year-on-year (>= {cfg['trend_worsening_pct']}pp threshold).",
            {"yoy_icr_pct": trend, "trend_worsening_pct": cfg["trend_worsening_pct"]}))
        if stance == "Negotiate":
            stance = "Redesign"
            reasons.append(_reason("trend_escalation",
                "Stance escalated from Negotiate to Redesign due to the adverse multi-year ICR trend."))
    return stance, reasons


# ---- Placement scores + decision ------------------------------------------
def defence_score(sig: dict, cfg: dict) -> tuple[float, dict]:
    """Incumbent-defensibility in [0,1]. Higher = renewal is more defendable with the incumbent."""
    op = sig["op_icr"]
    share = sig["large_share"] or 0.0
    s_event = clamp(share / cfg["one_off_share_defend_min"]) if cfg["one_off_share_defend_min"] else 0.0
    s_adj = _adjusted_ok(sig, cfg)
    span = (cfg["icr_redesign_max"] - cfg["icr_defend_max"]) or 1.0
    s_headroom = 1.0 - clamp((op - cfg["icr_defend_max"]) / span) if op is not None else 0.0
    score = clamp(DEFENCE_WEIGHTS["event_driven"] * s_event
                  + DEFENCE_WEIGHTS["adjusted_ok"] * s_adj
                  + DEFENCE_WEIGHTS["icr_headroom"] * s_headroom)
    return round(score, 3), {"event_driven": round(s_event, 3), "adjusted_ok": s_adj,
                             "icr_headroom": round(s_headroom, 3), "weights": DEFENCE_WEIGHTS}


def rfq_readiness(sig: dict, cfg: dict) -> tuple[float, dict]:
    """RFQ / market-placement readiness in [0,1]. Higher = renewal is less defensible."""
    op = sig["op_icr"]
    span = (cfg["icr_redesign_max"] - cfg["icr_negotiate_max"]) or 1.0
    s_icr_high = clamp((op - cfg["icr_negotiate_max"]) / span) if op is not None else 0.0
    s_not_def = 1.0 - _adjusted_ok(sig, cfg)
    s_weak = 0.3 if sig["preferred_levers"] else 1.0
    score = clamp(RFQ_WEIGHTS["icr_high"] * s_icr_high
                  + RFQ_WEIGHTS["not_defendable"] * s_not_def
                  + RFQ_WEIGHTS["weak_levers"] * s_weak)
    return round(score, 3), {"icr_high": round(s_icr_high, 3), "not_defendable": round(s_not_def, 3),
                             "weak_levers": s_weak, "weights": RFQ_WEIGHTS}


def placement_decision(sig: dict, cfg: dict) -> dict:
    """placement_triggered in {yes, no, review} with defence/RFQ scores and reasons."""
    if sig["op_icr"] is None:
        return {"triggered": "review", "defence_score": None, "rfq_readiness": None,
                "reason": "Operational ICR unavailable; escalate for manual review before any placement.",
                "reasons": [_reason("missing_operational_icr",
                    "No governed operational ICR for this scope; cannot assess defensibility.")]}
    defence, dsub = defence_score(sig, cfg)
    rfq, rsub = rfq_readiness(sig, cfg)
    reasons = [
        _reason("incumbent_defence_score",
                f"Incumbent-defence score {defence} (weighted from one-off share, Adjusted ICR and ICR headroom).",
                dsub),
        _reason("rfq_readiness_score",
                f"RFQ readiness {rfq} (weighted from ICR level, non-defendability and lever strength).", rsub),
    ]
    if defence >= cfg["incumbent_defence_strong_min"]:
        triggered = "no"
        reason = (f"Incumbent defence is strong (score {defence} >= {cfg['incumbent_defence_strong_min']}); "
                  f"defend the renewal rather than going to market.")
    elif rfq >= cfg["rfq_ready_min"]:
        triggered = "yes"
        reason = (f"Renewal is not defensible (RFQ readiness {rfq} >= {cfg['rfq_ready_min']}); "
                  f"trigger market placement / RFQ.")
    else:
        triggered = "review"
        reason = ("Neither a strong incumbent defence nor a clear RFQ trigger; review with the Placement Head "
                  "before deciding.")
    reasons.append(_reason("placement_decision", reason,
                           {"triggered": triggered, "defence_score": defence, "rfq_readiness": rfq}))
    return {"triggered": triggered, "defence_score": defence, "rfq_readiness": rfq,
            "reason": reason, "reasons": reasons}


# ---- Next best actions (ordered) ------------------------------------------
def next_best_actions(sig: dict, cfg: dict, stance: str, placement_triggered: str) -> list[dict]:
    """Ordered broker actions, each derived from a fired signal with its evidence."""
    actions: list[dict] = []
    share = sig["large_share"] or 0.0
    adj = sig["adjusted_icr"]
    op = sig["op_icr"]

    if share >= cfg["one_off_share_defend_min"]:
        actions.append(_reason("defend_one_off",
            "Defend renewal using one-off claim evidence.",
            {"large_claim_incurred_share": share, "large_claim_count": sig["large_count"]}))
    if adj is not None and (op is None or adj < op) and adj <= cfg["icr_negotiate_max"]:
        actions.append(_reason("negotiate_with_adjusted",
            "Negotiate loading down using Adjusted / Defendable ICR.",
            {"adjusted_icr": adj, "operational_icr": op}))
    if sig["preferred_levers"]:
        actions.append(_reason("use_sandbox_levers",
            "Use Savings Sandbox levers before accepting loading.",
            {"preferred_levers": sig["preferred_levers"]}))
    if stance in ("Place",) or placement_triggered == "yes":
        actions.append(_reason("prepare_placement",
            "Prepare alternate placement (RFQ) as renewal is not fully defensible.",
            {"stance": stance, "placement_triggered": placement_triggered}))
    if stance in ("Negotiate", "Redesign"):
        actions.append(_reason("review_terms",
            "Review policy terms before recommending cap / co-pay changes.",
            {"stance": stance}))
    actions.append(_reason("request_revised_quote",
        "Request a revised quote from the incumbent."))
    actions.append(_reason("prepare_client_note",
        "Prepare the client renewal note."))
    return actions
