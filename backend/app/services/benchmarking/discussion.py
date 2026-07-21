"""Recommended Benefit Discussion Points (foundation) — governed, design-focused talking
points derived from benefit gaps. No claims language; each point carries its feature,
classification, peer value and evidence."""
from __future__ import annotations

from .base import BenchmarkContext, peer_group, compare_feature, envelope, is_gap
from .registry import FEATURES


def discussion_points(bctx: BenchmarkContext) -> dict:
    pg = peer_group(bctx)
    comps = [compare_feature(bctx, f, pg) for f in FEATURES]
    points = [{
        "feature_id": c["feature_id"], "feature": c["feature"], "classification": c["classification"],
        "benchmark_value": c["benchmark_value"], "client_value": c["client_value"],
        "discussion_point": c["discussion_point"],
        "peer_group_definition": c["peer_group_definition"], "evidence": c["source_evidence"],
    } for c in comps if is_gap(c)]
    return envelope(kind="benchmark_discussion_points", bctx=bctx, pg=pg, comparisons=comps, extra={
        "discussion_points": points, "count": len(points),
    })
