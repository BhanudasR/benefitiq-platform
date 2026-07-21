"""Policy Terms & Conditions comparison — the T&C subset of the benchmark features
(waiting period, exclusions/non-payables, network/cashless, domiciliary, modern treatment,
pre/post hospitalization). Design limits are handled by the feature comparison engine."""
from __future__ import annotations

from .base import BenchmarkContext, peer_group, compare_feature, envelope
from .registry import FEATURES

_TERMS = [f for f in FEATURES if f["category"] == "terms"]


def policy_terms_comparison(bctx: BenchmarkContext) -> dict:
    pg = peer_group(bctx)
    comps = [compare_feature(bctx, f, pg) for f in _TERMS]
    return envelope(kind="benchmark_policy_terms", bctx=bctx, pg=pg, comparisons=comps,
                    extra={"policy_terms": comps, "terms_total": len(comps)})
