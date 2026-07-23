"""Answer composer — TEMPLATES the answer from the governed envelope only. It never computes or
invents a value: every supporting metric is a scalar copied straight from the engine's governed
output, and every sentence is derived from those scalars + the governed caveats. When the envelope
is No-Data the answer is a governed 'Not available'. No raw member/claim rows; no PII."""
from __future__ import annotations


def _m(label, value, fmt, source, status=None):
    return {"label": label, "value": value, "format": fmt, "source": source, "data_quality_status": status}


def _txt(v):
    return "Not available" if v is None or v == "" else str(v)


def _pct(v):
    return "Not available" if v is None else f"{v}%"


# ---- per-intent extractors: (env) -> {summary, key_points, metrics, next_action} -----------
def _portfolio_summary(env):
    v = env.get("value") or {}
    hr = v.get("high_risk_clients") or []
    return {
        "summary": f"The book holds {_txt(v.get('total_clients'))} governed client(s) with a portfolio ICR of "
                   f"{_pct(v.get('portfolio_icr'))}; {len(hr)} are in a high-risk band.",
        "key_points": [f"{_txt(v.get('total_clients'))} clients, {_txt(v.get('total_lives'))} lives.",
                       f"Portfolio ICR {_pct(v.get('portfolio_icr'))} (basis: {_txt(v.get('premium_basis'))})."],
        "metrics": [_m("Clients", v.get("total_clients"), "number", "policy_version", env.get("data_quality_status")),
                    _m("Portfolio ICR", v.get("portfolio_icr"), "percent", "claim + policy_version", env.get("data_quality_status")),
                    _m("High-risk clients", len(hr), "number", "RecommendationConfig ICR bands", env.get("data_quality_status"))],
        "next_action": (v.get("next_best_actions") or [None])[0],
    }


def _client_health(env):
    v = env.get("value") or {}
    nba = v.get("next_best_action") or {}
    return {
        "summary": f"{_txt(v.get('client_name'))}: {_txt(v.get('lives'))} lives, operational ICR "
                   f"{_pct(v.get('operational_icr'))}.",
        "key_points": [f"Premium {_txt(v.get('premium'))} (basis {_txt(v.get('premium_basis'))}).",
                       f"Total claims {_txt(v.get('total_claims'))}."],
        "metrics": [_m("Lives", v.get("lives"), "number", "member_master", env.get("data_quality_status")),
                    _m("Operational ICR", v.get("operational_icr"), "percent", "claim + policy_version", env.get("data_quality_status")),
                    _m("Premium", v.get("premium"), "currency", "policy_version", env.get("data_quality_status"))],
        "next_action": nba.get("reason") or nba.get("recommendation"),
    }


def _icr_explanation(env):
    v = env.get("value") or {}
    icr = v.get("operational_icr")
    band = "elevated" if (icr is not None and icr >= 80) else "within a defensible range" if icr is not None else "Not available"
    return {
        "summary": f"Operational ICR is {_pct(icr)} — {band}. It is incurred claims over premium on governed data.",
        "key_points": [f"Incurred claims {_txt(v.get('incurred'))}.",
                       "ICR is driven by claims volume and large claims — see Claims Drivers for the breakdown."],
        "metrics": [_m("Operational ICR", icr, "percent", "claim + policy_version", env.get("data_quality_status")),
                    _m("Incurred", v.get("incurred"), "currency", "claim", env.get("data_quality_status"))],
        "next_action": "Open Claims Drivers to see the top cost contributors behind this ICR.",
    }


def _claims_drivers(env):
    v = env.get("value") or {}
    return {
        "summary": f"{_txt(v.get('claim_count'))} governed claims with incurred "
                   f"{_txt(v.get('incurred') or v.get('total_incurred'))}.",
        "key_points": ["Top cost contributors are shown by ailment and hospital (aggregate; no member identity)."],
        "metrics": [_m("Claim count", v.get("claim_count"), "number", "claim", env.get("data_quality_status")),
                    _m("Incurred", v.get("incurred") or v.get("total_incurred"), "currency", "claim", env.get("data_quality_status"))],
        "next_action": "Review Ailment and Hospital drivers, then the Savings Sandbox for levers.",
    }


def _ailment_drivers(env):
    v = env.get("value") or {}
    top = v.get("top") or v.get("ailments") or []
    name = top[0].get("label") if top and isinstance(top[0], dict) else None
    return {
        "summary": f"Top ailment group: {_txt(name)} (aggregate diagnosis grouping; no individual member data).",
        "key_points": ["Ailment grouping is from governed diagnosis codes only."],
        "metrics": [_m("Top ailment group", name, "text", "claim.diagnosis_code_l1", env.get("data_quality_status"))],
        "next_action": "Discuss the leading ailment groups in the renewal and wellness conversation.",
    }


def _hospital_drivers(env):
    v = env.get("value") or {}
    return {
        "summary": f"{_txt(v.get('hospital_count') or v.get('distinct'))} distinct hospitals in the governed claims.",
        "key_points": ["Provider cost concentration is an aggregate view (no member identity)."],
        "metrics": [_m("Distinct hospitals", v.get("hospital_count") or v.get("distinct"), "number", "claim.hospital", env.get("data_quality_status"))],
        "next_action": "Review network concentration ahead of placement discussions.",
    }


def _renewal_recommendation(env):
    reasons = env.get("reasoning") or []
    return {
        "summary": f"Recommended renewal stance: {_txt(env.get('recommendation'))} "
                   f"(confidence {_txt(env.get('confidence'))}).",
        "key_points": [reasons[0]["explanation"]] if reasons and reasons[0].get("explanation") else [],
        "metrics": [_m("Stance", env.get("recommendation"), "text", "renewal engine", env.get("data_quality_status")),
                    _m("Confidence", env.get("confidence"), "text", "renewal engine", env.get("data_quality_status"))],
        "next_action": (env.get("next_best_action") or {}).get("explanation"),
    }


def _benchmark_gaps(env):
    return {
        "summary": ("A valid peer group is available; benefit-design & policy-T&C gaps can be discussed."
                    if env.get("valid_peer_group") else "No valid peer group yet — benchmark gaps are Not available."),
        "key_points": [f"{_txt(env.get('features_comparable'))} of {_txt(env.get('features_total'))} features comparable."],
        "metrics": [_m("Valid peer group", env.get("valid_peer_group"), "bool", "benchmark_observation", env.get("data_quality_status")),
                    _m("Gaps identified", env.get("gaps") or env.get("gap_count"), "number", "benefit_term", env.get("data_quality_status"))],
        "next_action": "Take the design/T&C gaps into the renewal and placement discussion (never claims-driven).",
    }


def _savings_sandbox(env):
    v = env.get("value") or {}
    return {
        "summary": f"Baseline operational ICR {_pct(v.get('operational_icr'))}; "
                   f"{_txt(v.get('adjusted_label') or 'Adjusted ICR')} {_pct(v.get('adjusted_icr'))}. "
                   "Lever scenarios are interactive in the Sandbox.",
        "key_points": ["Levers (room-rent, co-pay, caps, buffer) are governed scenarios, not guarantees."],
        "metrics": [_m("Operational ICR", v.get("operational_icr"), "percent", "claim + policy_version", env.get("data_quality_status")),
                    _m(v.get("adjusted_label") or "Adjusted ICR", v.get("adjusted_icr"), "percent", "claim + policy_version", env.get("data_quality_status"))],
        "next_action": "Model specific levers in the Renewal Savings Sandbox tab.",
    }


def _placement_recommendation(env):
    state = env.get("placement_state")
    return {
        "summary": f"Placement signal: {_txt(state)} (governed; no fabricated quotes).",
        "key_points": [f"Incumbent defence {_txt(env.get('incumbent_defence_score'))}, "
                       f"RFQ readiness {_txt(env.get('rfq_readiness'))}."],
        "metrics": [_m("Placement state", state, "text", "placement engine", env.get("data_quality_status")),
                    _m("Incumbent defence", env.get("incumbent_defence_score"), "share", "placement engine", env.get("data_quality_status")),
                    _m("RFQ readiness", env.get("rfq_readiness"), "share", "placement engine", env.get("data_quality_status"))],
        "next_action": "Open Placement Intelligence for defence vs market detail.",
    }


def _wellness_opportunity(env):
    return {
        "summary": _txt(env.get("summary")) if env.get("summary") else "Wellness opportunity is Not available.",
        "key_points": [],
        "metrics": [_m("Posture", env.get("summary"), "text", "claim (k-anonymised)", env.get("data_quality_status"))],
        "next_action": "Review the Wellness Opportunity tab for prioritised programs.",
    }


def _data_quality_trust(env):
    v = env.get("value") or {}
    iss = v.get("issues") or {}
    return {
        "summary": f"Headline readiness is {_txt(v.get('headline_readiness') or env.get('data_quality_status'))}. "
                   f"{_txt(v.get('gating_reason'))}",
        "key_points": [f"Weighted DQ {_txt(v.get('weighted_dq_score'))}; {_txt(iss.get('critical'))} critical issue(s)."],
        "metrics": [_m("Headline readiness", v.get("headline_readiness"), "text", "dataset_version", env.get("data_quality_status")),
                    _m("Weighted DQ", v.get("weighted_dq_score"), "number", "dq_result", env.get("data_quality_status")),
                    _m("Critical issues", iss.get("critical"), "number", "validation_issue", env.get("data_quality_status"))],
        "next_action": "Open Source Evidence / Data Quality to see which datasets and modules are affected.",
    }


def _export_readiness(env):
    v = env.get("value") or {}
    return {
        "summary": f"Client-pack export verdict: {_txt(v.get('verdict'))}. {_txt(v.get('verdict_note'))}",
        "key_points": [],
        "metrics": [_m("Verdict", v.get("verdict"), "text", "governed engines", env.get("data_quality_status"))],
        "next_action": "Open PPT / Client Pack / Export to assemble the board pack.",
    }


def _next_best_action(env):
    primary = env.get("next_best_action") or {}
    return {
        "summary": f"Recommended next action: {_txt(primary.get('explanation') or env.get('recommendation'))}.",
        "key_points": (env.get("talking_points") or [])[:3],
        "metrics": [_m("Confidence", env.get("confidence"), "text", "recommendation engine", env.get("data_quality_status"))],
        "next_action": primary.get("explanation") or env.get("recommendation"),
    }


EXTRACTORS = {
    "portfolio_summary": _portfolio_summary, "client_health": _client_health,
    "icr_explanation": _icr_explanation, "claims_drivers": _claims_drivers,
    "ailment_drivers": _ailment_drivers, "hospital_drivers": _hospital_drivers,
    "renewal_recommendation": _renewal_recommendation, "benchmark_gaps": _benchmark_gaps,
    "savings_sandbox": _savings_sandbox, "placement_recommendation": _placement_recommendation,
    "wellness_opportunity": _wellness_opportunity, "data_quality_trust": _data_quality_trust,
    "export_readiness": _export_readiness, "next_best_action": _next_best_action,
}


def compose(intent_id, env):
    fn = EXTRACTORS.get(intent_id)
    if not fn:
        return {"summary": "Not available", "key_points": [], "metrics": [], "next_action": None}
    return fn(env)
