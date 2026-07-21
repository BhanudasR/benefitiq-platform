"""Benefit Gap Analysis — features classified Below or Different from the peer benchmark
are benefit gaps (design/T&C only). Gaps flow one-way downstream to Renewal Intelligence /
Savings Sandbox for optional impact simulation — claims never drive this classification."""
from __future__ import annotations

from .base import BenchmarkContext, peer_group, compare_feature, envelope, is_gap
from .registry import FEATURES

# materiality order for ranking gaps (design-only heuristic; documented, not claims-based)
_MATERIALITY = {"room_rent": 5, "copay": 5, "sum_insured": 5, "disease_capping": 4,
                "parent_copay": 4, "icu_limit": 4, "maternity_limit": 3, "corporate_buffer": 3,
                "ped_waiting": 3, "non_payables_exclusions": 3}


def benefit_gap_analysis(bctx: BenchmarkContext) -> dict:
    pg = peer_group(bctx)
    comps = [compare_feature(bctx, f, pg) for f in FEATURES]
    gaps = [c for c in comps if is_gap(c)]
    gaps.sort(key=lambda c: _MATERIALITY.get(c["feature_id"], 1), reverse=True)
    return envelope(kind="benchmark_gap_analysis", bctx=bctx, pg=pg, comparisons=comps, extra={
        "gaps": gaps, "gap_count": len(gaps),
        "note": "Gaps are benefit-design/T&C differences vs peers; send selected gaps to Renewal "
                "Intelligence / Savings Sandbox for optional impact simulation.",
    })
