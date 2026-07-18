"""Recommendation engine base (Sprint 10).

Composes EXISTING governed outputs into a single signal set, computes a transparent
confidence, enforces guardrails, and assembles the explainability envelope shared by
all three engines. Never mutates operational ICR; Adjusted / Defendable ICR is kept as
a separate, clearly-labelled signal and never substituted for operational ICR."""
from __future__ import annotations

from ..metrics.base import MetricContext, _RELIABILITY
from ..metrics import icr as m_icr, claims as m_claims, trends as m_trends, large_claims as m_large
from ..simulation.base import SimContext
from ..simulation import adjusted_icr as s_adjusted, balanced_benefit as s_balanced
from .config import get_reco_config

# governed API identities used for the evidence trail (read-only, never raw data)
SRC_ICR = "/metrics/icr"
SRC_TRENDS = "/metrics/trends"
SRC_CLAIMS = "/metrics/claims"
SRC_LARGE = "/metrics/large-claims"
SRC_ADJ = "/simulation/adjusted-icr"
SRC_BAL = "/simulation/balanced-design"

_DQ_SCORE = {"high": 1.0, "medium": 0.6, "low": 0.3, "none": 0.0}
_PREFERRED = {"Preferred", "Good option"}
_HIGH_FRICTION = {"High employee impact", "Not recommended unless critical"}


def clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


class RecoContext:
    """Tenant + filters wrapper. Builds the governed metric/simulation contexts once."""
    def __init__(self, db, tenant: str, filters: dict | None = None):
        self.db = db
        self.tenant = tenant
        self.filters = filters or {}
        self.mc = MetricContext(db, tenant, self.filters)
        self.sc = SimContext(db, tenant, self.filters)
        self.cfg = get_reco_config(db, tenant)


def _latest_yoy_icr_pct(trends_res: dict):
    yoy = (trends_res.get("value") or {}).get("yoy") or []
    return yoy[-1].get("icr_pct") if yoy else None


def gather_signals(rctx: RecoContext) -> dict:
    """Read every governed input once. Missing inputs are recorded (never fabricated)."""
    icr = m_icr.icr_metrics(rctx.mc)
    trends = m_trends.trend_metrics(rctx.mc)
    claims = m_claims.claims_metrics(rctx.mc)
    large = m_large.large_claim_metrics(rctx.mc)
    adjusted = s_adjusted.adjusted_icr_simulation(rctx.sc)
    balanced = s_balanced.balanced_benefit_design(rctx.sc)

    iv = icr.get("value") or {}
    av = adjusted.get("value") or {}
    lv = large.get("value") or {}
    cv = claims.get("value") or {}
    levers = (balanced.get("value") or {}).get("levers") or []

    op_icr = iv.get("operational_icr")
    trend_pct = _latest_yoy_icr_pct(trends)

    results = {"icr": icr, "trends": trends, "large": large, "adjusted": adjusted, "balanced": balanced}
    restricted = any(bool(r.get("restricted") or r.get("advisory_blocked")) for r in results.values())
    conditional = any(bool(r.get("conditional")) for r in results.values())
    no_data = op_icr is None or icr.get("data_quality_status") == "No Data"

    status = ("Restricted" if restricted else "No Data" if no_data
              else "Conditional" if conditional else "Analytics Ready")
    reliability = _RELIABILITY[status]

    present = {
        "icr": op_icr is not None,
        "trends": trend_pct is not None,
        "large": lv.get("large_claim_incurred_share") is not None,
        "adjusted": av.get("adjusted_icr") is not None,
        "balanced": len(levers) > 0,
    }
    completeness = round(sum(1 for v in present.values() if v) / len(present), 3)

    caveats: list[str] = []
    for r in results.values():
        for c in (r.get("caveats") or []):
            if c not in caveats:
                caveats.append(c)

    # confidence: governed DQ reliability blended with evidence completeness (config-weighted)
    w_dq = rctx.cfg["weight_data_quality"]
    w_ev = rctx.cfg["weight_evidence_completeness"]
    conf_score = round(clamp(w_dq * _DQ_SCORE[reliability] + w_ev * completeness), 3)
    if restricted:
        conf_label = "blocked"
    elif no_data:
        conf_label = "pending"
    else:
        conf_label = ("high" if conf_score >= 0.75 else "medium" if conf_score >= 0.5
                      else "low" if conf_score >= 0.25 else "very low")

    return {
        "op_icr": op_icr, "paid_icr": iv.get("paid_icr"), "outstanding_icr": iv.get("outstanding_icr"),
        "premium_basis": icr.get("premium_basis"),
        "adjusted_icr": av.get("adjusted_icr"), "adjusted_label": av.get("adjusted_label"),
        "large_share": lv.get("large_claim_incurred_share"), "large_count": lv.get("large_claim_count"),
        "large_incurred": lv.get("large_claim_incurred"), "one_off_claims": av.get("one_off_claims") or [],
        "trend_icr_pct": trend_pct,
        "claim_count": cv.get("claim_count"), "avg_claim_size": cv.get("average_claim_size"),
        "levers": levers,
        "preferred_levers": [l["lever"] for l in levers if l.get("classification") in _PREFERRED],
        "high_friction_levers": [l["lever"] for l in levers if l.get("classification") in _HIGH_FRICTION],
        "data_quality_status": status, "restricted": restricted, "conditional": conditional,
        "advisory_blocked": restricted, "reliability": reliability, "missing_data": no_data,
        "caveats": caveats, "present": present, "completeness": completeness,
        "confidence_score": conf_score, "confidence_label": conf_label,
        "results": results, "cfg": rctx.cfg,
    }


def evidence_refs(sig: dict) -> list[dict]:
    """A reconciling evidence trail: each reference names its governed source + the exact
    value used, so any reasoning bullet traces back to a governed metric/simulation value."""
    refs = []
    if sig["op_icr"] is not None:
        refs.append({"source": SRC_ICR, "field": "operational_icr", "value": sig["op_icr"]})
        refs.append({"source": SRC_ICR, "field": "premium_basis", "value": sig["premium_basis"]})
    if sig["adjusted_icr"] is not None:
        refs.append({"source": SRC_ADJ, "field": "adjusted_icr", "value": sig["adjusted_icr"]})
    if sig["large_share"] is not None:
        refs.append({"source": SRC_LARGE, "field": "large_claim_incurred_share", "value": sig["large_share"]})
        refs.append({"source": SRC_LARGE, "field": "large_claim_count", "value": sig["large_count"]})
    if sig["trend_icr_pct"] is not None:
        refs.append({"source": SRC_TRENDS, "field": "yoy.icr_pct", "value": sig["trend_icr_pct"]})
    if sig["levers"]:
        refs.append({"source": SRC_BAL, "field": "levers", "value": f"{len(sig['levers'])} scored"})
    return refs


def source_metrics_used(sig: dict) -> list[str]:
    m = []
    if sig["present"]["icr"]:
        m.append(SRC_ICR)
    if sig["present"]["trends"]:
        m.append(SRC_TRENDS)
    if sig["present"]["large"]:
        m.append(SRC_LARGE)
    if sig["present"]["adjusted"]:
        m.append(SRC_ADJ)
    if sig["present"]["balanced"]:
        m.append(SRC_BAL)
    return m


def impacts(sig: dict) -> tuple[dict, dict]:
    """Employer / employee impact composed from governed balanced-design scores (display of
    API values only). Savings are SCENARIO evidence, not guaranteed savings."""
    levers = sig["levers"]
    employer = [{"lever": l["lever"], "expected_saving": l.get("expected_saving"),
                 "classification": l.get("classification")}
                for l in levers if l.get("classification") in _PREFERRED]
    employee = [{"lever": l["lever"], "employee_friction": l.get("employee_friction"),
                 "classification": l.get("classification")}
                for l in levers if l.get("classification") in _HIGH_FRICTION]
    return (
        {"defensible_levers": employer,
         "note": "Expected savings are scenario evidence from the governed simulation, not guaranteed savings."},
        {"high_friction_levers": employee,
         "note": "Levers with employee friction shift cost to members; weigh against savings before recommending."},
    )


def reco_result(*, kind: str, label: str, summary: str, sig: dict,
                reasons: list[dict], next_best_action, talking_points: list[str],
                assumptions: list[str], extra: dict | None = None) -> dict:
    """Assemble the shared explainability envelope. `reasons` = [{rule, explanation, evidence}]."""
    employer_impact, employee_impact = impacts(sig)
    caveats = list(sig["caveats"])
    if sig["conditional"]:
        caveats.append("Dataset is Conditional — figures carry data-quality caveats.")
    if sig["missing_data"] and not sig["restricted"]:
        caveats.append("Some required governed inputs are unavailable; recommendation is cautious / pending.")
    out = {
        "kind": kind,
        "recommendation": label,
        "summary": summary,
        "confidence": sig["confidence_label"],
        "confidence_score": sig["confidence_score"],
        "reliability": sig["reliability"],
        "reasoning": reasons,
        "evidence_references": evidence_refs(sig),
        "source_metrics_used": source_metrics_used(sig),
        "caveats": caveats,
        "restricted": sig["restricted"],
        "advisory_blocked": sig["advisory_blocked"],
        "data_quality_status": sig["data_quality_status"],
        "assumptions": assumptions,
        "next_best_action": next_best_action,
        "talking_points": talking_points,
        "employer_impact": employer_impact,
        "employee_impact": employee_impact,
        # guardrail: operational ICR reported unchanged; adjusted kept separate, never a replacement
        "operational_icr": sig["op_icr"],
        "adjusted_icr": sig["adjusted_icr"],
        "adjusted_icr_note": "Adjusted / Defendable ICR is a defensibility view; it never replaces Operational ICR.",
        "config_version": sig["cfg"]["config_version"],
        "threshold_basis": sig["cfg"]["threshold_basis"],
        "evidence_completeness": sig["completeness"],
    }
    if extra:
        out.update(extra)
    return out
