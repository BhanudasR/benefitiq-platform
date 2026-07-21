"""Governed benchmark thresholds. Read the per-tenant BenchmarkConfig row; fall back to
documented safe defaults when absent. Every consumer receives config_version + basis so the
peer-group / tolerance basis is explainable."""
from __future__ import annotations

from ...models.governance import BenchmarkConfig

DEFAULTS = {
    "min_peer_count": 3,
    "percentile_method": "median",
    "same_tolerance_pct": 0.02,
    "weight_peer_size": 0.60,
    "weight_term_availability": 0.40,
    "benchmark_basis": "internal_broker_portfolio",
    "config_version": "v1-default",
}
_FLOAT = {"same_tolerance_pct", "weight_peer_size", "weight_term_availability"}
_INT = {"min_peer_count"}


def get_benchmark_config(db, tenant: str) -> dict:
    row = db.query(BenchmarkConfig).filter(BenchmarkConfig.tenant_id == tenant).first()
    cfg = dict(DEFAULTS)
    if row is None:
        cfg["source"] = "default"
        cfg["config_basis"] = "governed default benchmark thresholds (no tenant BenchmarkConfig)"
        return cfg
    for k in _FLOAT:
        v = getattr(row, k, None)
        if v is not None:
            cfg[k] = float(v)
    for k in _INT:
        v = getattr(row, k, None)
        if v is not None:
            cfg[k] = int(v)
    cfg["percentile_method"] = row.percentile_method or "median"
    cfg["benchmark_basis"] = row.benchmark_basis or "internal_broker_portfolio"
    cfg["config_version"] = row.config_version or "v1-default"
    cfg["source"] = "tenant_config"
    cfg["config_basis"] = f"tenant BenchmarkConfig ({cfg['config_version']})"
    return cfg
