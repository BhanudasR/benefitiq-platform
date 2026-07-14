"""Governed canonical-load gate policy (pure, testable). Encodes the two-gate model:

ROW-LEVEL (always): critical rows are quarantined and NEVER loaded; warn/info may
load with caveats. (Enforced in the loader via ReviewItem/ValidationIssue.)

DATASET-LEVEL (by overall DQ score):
  >= 85  -> load after Reviewer approval; status "Analytics Ready".
  70-84  -> load after Reviewer approval; status "Conditional / Review Recommended".
  < 70   -> blocked by default; Admin override -> "Restricted / Not Reliable for
            Advisory Analytics" only, with mandatory reason + audit; never loads
            critical rows; downstream advisory outputs stay blocked/caveated.
"""
from __future__ import annotations

THRESHOLD_ANALYTICS = 85.0
THRESHOLD_CONDITIONAL = 70.0

ANALYTICS_READY = "Analytics Ready"
CONDITIONAL = "Conditional / Review Recommended"
RESTRICTED = "Restricted / Not Reliable for Advisory Analytics"

# Which advisory/analytics modules are impacted when a DQ component is weak.
_COMPONENT_MODULES = {
    "mandatory_completeness": ["All Analytics", "Renewal Intelligence"],
    "mapping_confidence": ["All Analytics"],
    "type_validity": ["All Analytics"],
    "business_rule_validation": ["Claims Analytics", "Renewal Intelligence", "ICR / Loss Ratio"],
    "linkage_quality": ["Member & Family", "Claims-Member Linkage"],
    "financial_reconciliation": ["Claims Analytics", "ICR / Loss Ratio", "Renewal Intelligence"],
    "duplicate_anomaly": ["Claims Counts", "Utilization"],
    "source_version_integrity": ["Audit & Lineage"],
}


def readiness_for(score: float) -> str:
    if score >= THRESHOLD_ANALYTICS:
        return ANALYTICS_READY
    if score >= THRESHOLD_CONDITIONAL:
        return CONDITIONAL
    return RESTRICTED


def can_approve_normally(score: float) -> bool:
    """Reviewer approval is valid only at or above the conditional threshold."""
    return score >= THRESHOLD_CONDITIONAL


def requires_admin_override(score: float) -> bool:
    return score < THRESHOLD_CONDITIONAL


def is_restricted(readiness_status: str) -> bool:
    return readiness_status == RESTRICTED


def carries_caveat(readiness_status: str) -> bool:
    """True when downstream metrics must show a data-quality caveat."""
    return readiness_status in (CONDITIONAL, RESTRICTED)


def failed_components(components: list[dict]) -> list[dict]:
    """Components scoring below full marks (fraction < 1.0)."""
    out = []
    for c in components or []:
        frac = c.get("fraction", 1.0)
        if frac < 0.999:
            out.append({"name": c["name"], "score_0_100": c.get("score_0_100"),
                        "weighted_points": c.get("weighted_points"),
                        "caveats": c.get("caveats", [])})
    return out


def impacted_modules(failed: list[dict]) -> list[str]:
    mods: list[str] = []
    for f in failed:
        for m in _COMPONENT_MODULES.get(f["name"], []):
            if m not in mods:
                mods.append(m)
    return mods
