"""Benefit feature comparison engines: overview, full feature comparison, and peer
comparison. All compare benefit design / policy terms only — never claims."""
from __future__ import annotations

from collections import Counter

from .base import BenchmarkContext, peer_group, compare_feature, envelope
from .registry import FEATURES


def _all_comparisons(bctx: BenchmarkContext, pg: dict) -> list[dict]:
    return [compare_feature(bctx, f, pg) for f in FEATURES]


def benchmark_overview(bctx: BenchmarkContext) -> dict:
    pg = peer_group(bctx)
    comps = _all_comparisons(bctx, pg)
    counts = Counter(c["classification"] for c in comps)
    comparable = [c for c in comps if c["not_comparable_reason"] is None]
    return envelope(kind="benchmark_overview", bctx=bctx, pg=pg, comparisons=comps, extra={
        "classification_counts": dict(counts),
        "features_total": len(comps), "features_comparable": len(comparable),
    })


def benchmark_features(bctx: BenchmarkContext) -> dict:
    pg = peer_group(bctx)
    comps = _all_comparisons(bctx, pg)
    return envelope(kind="benchmark_features", bctx=bctx, pg=pg, comparisons=comps,
                    extra={"features": comps})


def peer_comparison(bctx: BenchmarkContext) -> dict:
    pg = peer_group(bctx)
    comps = _all_comparisons(bctx, pg)
    # peer comparison surfaces only the features with a live peer benchmark
    with_peer = [c for c in comps if c["benchmark_value"] is not None]
    return envelope(kind="benchmark_peer_comparison", bctx=bctx, pg=pg, comparisons=comps,
                    extra={"comparisons": with_peer, "features_with_peer_benchmark": len(with_peer)})
