"""Wellness engine base (Sprint 12).

Composes governed metric outputs into claim-driven wellness categories, enforces
k-anonymity cohort suppression, computes a transparent confidence, and assembles the
shared explainability envelope. Cohort-level only — no individual targeting, no PII."""
from __future__ import annotations

from ..metrics.base import MetricContext, _RELIABILITY
from ..metrics import claims as m_claims, trends as m_trends
from ..metrics import dimensions as m_dim
from .config import get_wellness_config
from .registry import classify, meta

SRC_AILMENT = "/metrics/ailment"
SRC_CLAIMS = "/metrics/claims"
SRC_RELATION = "/metrics/relation"
SRC_TRENDS = "/metrics/trends"

_DQ_SCORE = {"high": 1.0, "medium": 0.6, "low": 0.3, "none": 0.0}
# opportunity categories exclude the catch-all 'other'
_OPPORTUNITY_CATEGORIES = [c for c in ("metabolic", "cardiovascular", "maternity",
                                       "musculoskeletal", "mental_wellbeing", "respiratory", "oncology")]


def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


class WellnessContext:
    def __init__(self, db, tenant: str, filters: dict | None = None):
        self.db = db
        self.tenant = tenant
        self.filters = filters or {}
        self.mc = MetricContext(db, tenant, self.filters)
        self.cfg = get_wellness_config(db, tenant)


def gather(wctx: WellnessContext) -> dict:
    """Read governed metrics once, map claims to wellness categories, apply k-anonymity."""
    ailment = m_dim.ailment_metrics(wctx.mc)
    claims = m_claims.claims_metrics(wctx.mc)
    relation = m_dim.relation_metrics(wctx.mc)
    trends = m_trends.trend_metrics(wctx.mc)
    cfg = wctx.cfg
    k = cfg["k_anonymity_min_cohort_size"]

    top_ailments = (ailment.get("value") or {}).get("top_ailments") or []
    cv = claims.get("value") or {}
    total_incurred = cv.get("incurred") or 0.0
    total_claims = cv.get("claim_count") or 0

    results = {"ailment": ailment, "claims": claims, "relation": relation, "trends": trends}
    restricted = any(bool(r.get("restricted") or r.get("advisory_blocked")) for r in results.values())
    conditional = any(bool(r.get("conditional")) for r in results.values())
    no_data = (claims.get("data_quality_status") == "No Data") or len(top_ailments) == 0

    status = ("Restricted" if restricted else "No Data" if no_data
              else "Conditional" if conditional else "Analytics Ready")
    reliability = _RELIABILITY[status]

    # aggregate ailments into wellness categories
    agg: dict[str, dict] = {}
    for a in top_ailments:
        cat = classify(a.get("key"))
        b = agg.setdefault(cat, {"category_id": cat, "claim_count": 0, "incurred": 0.0,
                                 "share": 0.0, "codes": [], "recurring": False})
        b["claim_count"] += a.get("count") or 0
        b["incurred"] += a.get("incurred") or 0.0
        b["share"] += a.get("incurred_share") or 0.0
        if a.get("key") is not None and len(b["codes"]) < 8:
            b["codes"].append(a["key"])
        b["recurring"] = b["recurring"] or bool(a.get("recurring_indicator"))

    other = agg.get("other")
    unmapped_share = round(other["share"], 4) if other else 0.0

    categories, suppressed = [], []
    for cat in _OPPORTUNITY_CATEGORIES:
        b = agg.get(cat)
        if not b:
            continue
        m = meta(cat)
        entry = {**b, "label": m["label"], "preventable": m["preventable"], "careful": m["careful"],
                 "incurred": round(b["incurred"], 2), "share": round(b["share"], 4)}
        # k-anonymity: cohorts below the minimum are suppressed (never exposed)
        if b["claim_count"] < k:
            entry["suppressed"] = True
            suppressed.append(cat)
        else:
            entry["suppressed"] = False
            categories.append(entry)

    present = {"ailment": len(top_ailments) > 0, "claims": total_claims > 0,
               "relation": bool((relation.get("value") or {}).get("groups")),
               "trends": bool((trends.get("value") or {}).get("series"))}
    completeness = round(sum(1 for v in present.values() if v) / len(present), 3)

    caveats: list[str] = []
    for r in results.values():
        for c in (r.get("caveats") or []):
            if c not in caveats:
                caveats.append(c)
    if unmapped_share > 0:
        caveats.append(f"{unmapped_share} of incurred is from ailments not mapped to a wellness category (shown as 'Other').")
    if suppressed:
        caveats.append(f"{len(suppressed)} wellness cohort(s) were below the k-anonymity minimum (k>={k}) and were suppressed for privacy.")

    w_dq = cfg["weight_data_quality"]
    w_ev = cfg["weight_evidence_completeness"]
    conf_score = round(clamp(w_dq * _DQ_SCORE[reliability] + w_ev * completeness), 3)
    if restricted:
        conf_label = "blocked"
    elif no_data:
        conf_label = "pending"
    else:
        conf_label = ("high" if conf_score >= 0.75 else "medium" if conf_score >= 0.5
                      else "low" if conf_score >= 0.25 else "very low")

    return {
        "categories": sorted(categories, key=lambda x: x["incurred"], reverse=True),
        "suppressed_categories": suppressed, "unmapped_share": unmapped_share,
        "total_claims": total_claims, "total_incurred": round(total_incurred, 2),
        "relation_groups": (relation.get("value") or {}).get("groups") or [],
        "data_quality_status": status, "restricted": restricted, "conditional": conditional,
        "advisory_blocked": restricted, "reliability": reliability, "missing_data": no_data,
        "caveats": caveats, "present": present, "completeness": completeness,
        "confidence_score": conf_score, "confidence_label": conf_label,
        "k": k, "cfg": cfg, "results": results,
    }


def evidence_refs(sig: dict) -> list[dict]:
    refs = [{"source": SRC_AILMENT, "field": "top_ailments", "value": f"{len(sig['categories'])} mapped categor(ies)"}]
    if sig["present"]["claims"]:
        refs.append({"source": SRC_CLAIMS, "field": "incurred", "value": sig["total_incurred"]})
        refs.append({"source": SRC_CLAIMS, "field": "claim_count", "value": sig["total_claims"]})
    if sig["present"]["relation"]:
        refs.append({"source": SRC_RELATION, "field": "groups", "value": f"{len(sig['relation_groups'])} relation cohort(s)"})
    if sig["present"]["trends"]:
        refs.append({"source": SRC_TRENDS, "field": "series", "value": "multi-year"})
    return refs


def source_metrics_used(sig: dict) -> list[str]:
    m = [SRC_AILMENT]
    if sig["present"]["claims"]:
        m.append(SRC_CLAIMS)
    if sig["present"]["relation"]:
        m.append(SRC_RELATION)
    if sig["present"]["trends"]:
        m.append(SRC_TRENDS)
    return m


def opportunity_for(cat: dict, sig: dict) -> dict:
    """One governed, cohort-level wellness opportunity/recommendation object (privacy-safe)."""
    m = meta(cat["category_id"])
    return {
        "category_id": cat["category_id"],
        "label": f"{m['label']} wellness opportunity",
        "ailment_category": m["label"],
        "affected_cohort": {
            "level": "cohort", "basis": "claims mapped to this wellness category",
            "claim_count": cat["claim_count"], "recurring": cat["recurring"],
            "note": "Cohort-level only; k-anonymity enforced; no individual employee is targeted or identified.",
        },
        "claim_driver": {"top_diagnosis_codes": cat["codes"][:5], "recurring": cat["recurring"]},
        "potential_impact": {
            "incurred": cat["incurred"], "incurred_share": cat["share"],
            "label": "estimate", "basis": "share of portfolio incurred attributable to this category",
        },
        "suggested_intervention": m["intervention"],
        "employer_impact": {
            "note": ("Reducing preventable claims in this category can ease renewal cost — scenario estimate, not a guaranteed saving."
                     if m["preventable"] else
                     "Supportive program; impact on renewal cost is indirect — estimate only, not a guaranteed saving."),
            "preventable": m["preventable"],
        },
        "employee_impact": {
            "note": "Cohort-level, voluntary and confidential wellness support; no individual targeting; no medical diagnosis advice.",
            "sensitive": m["careful"],
        },
        "roi_tracking_basis": {
            "metric": "pre/post incurred and claim frequency for this category across policy years",
            "label": "estimate / tracking basis — NOT a guaranteed saving",
        },
        "confidence": sig["confidence_label"], "reliability": sig["reliability"],
        "next_best_action": {"explanation": f"Scope and launch: {m['label']} program for the affected cohort."},
        "caveats": (["Sensitive category — keep messaging supportive, cohort-level and non-diagnostic."] if m["careful"] else []),
    }


def select_opportunities(sig: dict) -> list[dict]:
    """Governed opportunities: mapped, non-suppressed categories that clear BOTH the
    min-share and min-claim-count cutoffs. Ranked by incurred (already sorted in sig)."""
    cfg = sig["cfg"]
    return [opportunity_for(c, sig) for c in sig["categories"]
            if c["share"] >= cfg["opportunity_min_share"] and c["claim_count"] >= cfg["min_claim_count"]]


def wellness_envelope(*, kind: str, label: str, summary: str, sig: dict, extra: dict) -> dict:
    """Shared top-level fields for every wellness API response."""
    out = {
        "kind": kind, "recommendation": label, "summary": summary,
        "confidence": sig["confidence_label"], "confidence_score": sig["confidence_score"],
        "reliability": sig["reliability"],
        "evidence_references": evidence_refs(sig), "source_metrics_used": source_metrics_used(sig),
        "caveats": sig["caveats"], "restricted": sig["restricted"], "advisory_blocked": sig["advisory_blocked"],
        "data_quality_status": sig["data_quality_status"],
        "assumptions": [
            "Wellness opportunities are derived from governed claim patterns, not generic templates.",
            "All figures are cohort-level estimates; ROI is a tracking basis, never a guaranteed saving.",
            "No individual employee is identified or targeted; k-anonymity suppression is enforced.",
        ],
        "unmapped_share": sig["unmapped_share"], "suppressed_cohorts": len(sig["suppressed_categories"]),
        "k_anonymity_min_cohort_size": sig["k"],
        "config_version": sig["cfg"]["config_version"], "config_basis": sig["cfg"]["config_basis"],
        "evidence_completeness": sig["completeness"],
    }
    out.update(extra)
    return out


def blocked_envelope(kind: str, sig: dict, what: str) -> dict:
    """Restricted datasets block advisory wellness output."""
    return wellness_envelope(
        kind=kind, label="Advisory blocked",
        summary=f"Dataset is Restricted; advisory wellness {what} is blocked pending better data quality.",
        sig=sig, extra={"opportunities": [], "recommendations": [], "reason": "Restricted dataset (advisory blocked)."})


def pending_envelope(kind: str, sig: dict, what: str) -> dict:
    """Missing / weak data yields a cautious, low-confidence pending output."""
    return wellness_envelope(
        kind=kind, label="Pending",
        summary=f"Insufficient governed ailment data to generate wellness {what}; a cautious pending result is returned.",
        sig=sig, extra={"opportunities": [], "recommendations": []})
