"""Governed wellness thresholds + privacy settings. Read the per-tenant WellnessConfig
row; fall back to documented safe defaults when absent (source='default'). Every consumer
receives config_version + source so the threshold/privacy basis is explainable."""
from __future__ import annotations

from ...models.governance import WellnessConfig

DEFAULTS = {
    "opportunity_min_share": 0.05,
    "min_claim_count": 2,
    "k_anonymity_min_cohort_size": 5,
    "weight_data_quality": 0.60,
    "weight_evidence_completeness": 0.40,
    "config_version": "v1-default",
}

_FLOAT_KEYS = {"opportunity_min_share", "weight_data_quality", "weight_evidence_completeness"}
_INT_KEYS = {"min_claim_count", "k_anonymity_min_cohort_size"}


def get_wellness_config(db, tenant: str) -> dict:
    row = db.query(WellnessConfig).filter(WellnessConfig.tenant_id == tenant).first()
    cfg = dict(DEFAULTS)
    if row is None:
        cfg["source"] = "default"
        cfg["config_basis"] = "governed default wellness thresholds (no tenant WellnessConfig)"
        return cfg
    for k in _FLOAT_KEYS:
        v = getattr(row, k, None)
        if v is not None:
            cfg[k] = float(v)
    for k in _INT_KEYS:
        v = getattr(row, k, None)
        if v is not None:
            cfg[k] = int(v)
    cfg["config_version"] = row.config_version or "v1-default"
    cfg["source"] = "tenant_config"
    cfg["config_basis"] = f"tenant WellnessConfig ({cfg['config_version']})"
    return cfg
