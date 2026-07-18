"""Governed recommendation thresholds. Read the per-tenant RecommendationConfig row;
fall back to documented safe defaults when absent (source='default'). Every consumer
receives config_version + source so the threshold basis is explainable and auditable."""
from __future__ import annotations

from ...models.governance import RecommendationConfig

# Documented safe defaults (used when a tenant has no RecommendationConfig row).
DEFAULTS = {
    "icr_defend_max": 100.0,
    "icr_negotiate_max": 120.0,
    "icr_redesign_max": 150.0,
    "one_off_share_defend_min": 0.30,
    "trend_worsening_pct": 10.0,
    "incumbent_defence_strong_min": 0.65,
    "rfq_ready_min": 0.60,
    "weight_data_quality": 0.60,
    "weight_evidence_completeness": 0.40,
    "config_version": "v1-default",
}

_FLOAT_KEYS = [k for k in DEFAULTS if k != "config_version"]


def get_reco_config(db, tenant: str) -> dict:
    """Return the governed threshold set for a tenant. `source` = 'tenant_config' when a
    row exists, else 'default'. `threshold_basis` names the governing source for evidence."""
    row = db.query(RecommendationConfig).filter(RecommendationConfig.tenant_id == tenant).first()
    cfg = dict(DEFAULTS)
    if row is None:
        cfg["source"] = "default"
        cfg["threshold_basis"] = "governed default thresholds (no tenant RecommendationConfig)"
        return cfg
    for k in _FLOAT_KEYS:
        v = getattr(row, k, None)
        if v is not None:
            cfg[k] = float(v)
    cfg["config_version"] = row.config_version or "v1-default"
    cfg["source"] = "tenant_config"
    cfg["threshold_basis"] = f"tenant RecommendationConfig ({cfg['config_version']})"
    return cfg
