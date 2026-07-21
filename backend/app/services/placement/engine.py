"""Placement Intelligence views — compose governed outputs; never recompute the decision.

Every 'decision' field (placement state, incumbent-defence score, RFQ readiness, trigger
reason, recommendation label) comes straight from the reused renewal placement-trigger engine
so the top-level module can never disagree with the Renewal Placement Trigger sub-tab. Terms
Comparison is sourced ONLY from Benefit Benchmarking (benefit design + policy terms, claims-
free) so it never contaminates benchmarking logic. Quote Comparison is a governed pending state
— no insurer quotes or pricing are fabricated.
"""
from __future__ import annotations

from .context import PlacementContext
from ..recommendations import placement as r_placement
from ..benchmarking import policy_terms as b_terms, gaps as b_gaps
from ...models.governance import BenchmarkAction

SOURCE_TRIGGER = "renewal Placement Trigger engine (/recommendations/placement-trigger)"
SOURCE_BENCH = "Benefit Benchmarking (benefit design + policy terms only)"
_PROTECT = ("Same as Benchmark", "Above Benchmark")


def _pt(pctx: PlacementContext) -> dict:
    """The one governed placement decision, reused verbatim (never recomputed here)."""
    return r_placement.placement_trigger(pctx.rctx)


def _base(pt: dict, *, view: str, sources: list[str]) -> dict:
    return {
        "module": "placement_intelligence", "view": view,
        "data_quality_status": pt["data_quality_status"],
        "restricted": pt["restricted"], "advisory_blocked": pt["advisory_blocked"],
        "confidence": pt["confidence"], "confidence_score": pt["confidence_score"],
        "reliability": pt["reliability"], "caveats": pt["caveats"],
        "source_basis": sources, "reuses_engine": "recommendations.placement_trigger",
    }


def _protect_and_gaps(pctx: PlacementContext):
    terms = b_terms.policy_terms_comparison(pctx.bctx)
    gaps = b_gaps.benefit_gap_analysis(pctx.bctx)
    protect = [t for t in terms.get("policy_terms", []) if t["classification"] in _PROTECT]
    return terms, gaps, protect, gaps.get("gaps", [])


def _linked_actions(pctx: PlacementContext) -> list[dict]:
    """Sprint-17 benchmark gap actions already routed downstream (renewal/sandbox) — the gaps a
    broker chose to carry into the placement discussion. Design/T&C fields only."""
    q = pctx.db.query(BenchmarkAction).filter(
        BenchmarkAction.tenant_id == pctx.tenant,
        BenchmarkAction.target_module.in_(["renewal_sandbox", "renewal_strategy"]))
    cid = pctx.f.get("client_id")
    if cid:
        q = q.filter(BenchmarkAction.client_id == cid)
    rows = q.order_by(BenchmarkAction.created_at.desc()).all()
    return [{"feature_id": r.feature_id, "feature_name": r.feature_name,
             "classification": r.classification, "target_module": r.target_module,
             "current_client_value": r.current_client_value, "benchmark_value": r.benchmark_value,
             "status": r.status} for r in rows]


def overview(pctx: PlacementContext) -> dict:
    pt = _pt(pctx)
    _terms, _gaps, protect, gap_list = _protect_and_gaps(pctx)
    out = _base(pt, view="overview", sources=[SOURCE_TRIGGER, SOURCE_BENCH])
    out.update({
        "placement_state": pt["placement_triggered"],          # yes | no | review
        "recommendation": pt["recommendation"],
        "decision_summary": pt["summary"],
        "incumbent_defence_score": pt["incumbent_defence_score"],
        "rfq_readiness": pt["rfq_readiness"],
        "trigger_reason": pt["trigger_reason"],
        "terms_to_protect_count": len(protect),
        "benchmark_gaps_to_raise_count": len(gap_list),
        "next_best_action": pt.get("next_best_action"),
        "evidence_references": pt["evidence_references"],
    })
    return out


def incumbent_defence(pctx: PlacementContext) -> dict:
    pt = _pt(pctx)
    out = _base(pt, view="incumbent_defence", sources=[SOURCE_TRIGGER])
    out.update({
        "incumbent_defence_score": pt["incumbent_defence_score"],
        "placement_state": pt["placement_triggered"],
        "defence_reasons": pt["reasoning"],
        "negotiation_evidence": pt["negotiation_evidence"],
        # operational ICR reported unchanged; adjusted / defendable kept separate
        "operational_icr": pt["operational_icr"],
        "adjusted_icr": pt["adjusted_icr"],
        "adjusted_icr_note": pt.get("adjusted_icr_note"),
        "evidence_references": pt["evidence_references"],
    })
    return out


def rfq_readiness(pctx: PlacementContext) -> dict:
    pt = _pt(pctx)
    out = _base(pt, view="rfq_readiness", sources=[SOURCE_TRIGGER])
    out.update({
        "rfq_readiness": pt["rfq_readiness"],
        "placement_state": pt["placement_triggered"],
        "trigger_reason": pt["trigger_reason"],
        "go_to_market_required": pt["placement_triggered"] == "yes",
        "next_best_actions": pt.get("next_best_actions", []),
        "evidence_references": pt["evidence_references"],
    })
    return out


def quote_comparison(pctx: PlacementContext) -> dict:
    """Governed pending state. NO insurer quotes or pricing exist yet, so none are fabricated;
    quote ingestion is a future capability. Only the expected comparison SHAPE is described."""
    pt = _pt(pctx)     # for governed DQ + caveats context only
    out = _base(pt, view="quote_comparison", sources=[SOURCE_TRIGGER])
    out.update({
        "quote_data_available": False,
        "quotes": [], "quote_count": 0,
        "message": "Quote comparison pending — upload insurer quotes to compare. No insurer "
                   "quotes or pricing are available yet.",
        "expected_fields": ["insurer", "policy_terms", "sum_insured", "benefit_design",
                            "exclusions", "quoted_premium_if_provided"],
        "note": "No fake quotes or pricing are generated. Insurer quote ingestion is a future capability.",
    })
    return out


def terms_comparison(pctx: PlacementContext) -> dict:
    """Sourced ONLY from Benefit Benchmarking (design + policy T&C, claims-free) — never from
    the placement/claims path — so benchmarking logic is not contaminated."""
    terms, _gaps, protect, gap_list = _protect_and_gaps(pctx)
    linked = _linked_actions(pctx)
    return {
        "module": "placement_intelligence", "view": "terms_comparison",
        "benchmark_domain": "benefit_design_and_policy_terms_only",
        "confidence": terms.get("confidence"), "confidence_score": terms.get("confidence_score"),
        "reliability": terms.get("reliability"), "caveats": terms.get("caveats", []),
        "valid_peer_group": terms.get("valid_peer_group"),
        "peer_group_definition": terms.get("peer_group_definition"),
        "terms_to_protect": protect, "terms_to_protect_count": len(protect),
        "policy_terms": terms.get("policy_terms", []),
        "benchmark_gaps_to_raise": gap_list, "benchmark_gaps_count": len(gap_list),
        "linked_benchmark_actions": linked,
        "source_basis": [SOURCE_BENCH], "reuses_engine": "benchmarking.policy_terms_comparison",
    }


def recommendation(pctx: PlacementContext) -> dict:
    """Reuses the renewal placement-trigger engine verbatim — same label / decision. Adds only
    the explicit source basis and a consistency marker; introduces no new or hard-coded logic."""
    pt = _pt(pctx)
    out = _base(pt, view="recommendation", sources=[SOURCE_TRIGGER])
    out.update({
        "recommendation": pt["recommendation"],            # identical to /recommendations/placement-trigger
        "placement_state": pt["placement_triggered"],
        "placement_triggered": pt["placement_triggered"],
        "incumbent_defence_score": pt["incumbent_defence_score"],
        "rfq_readiness": pt["rfq_readiness"],
        "trigger_reason": pt["trigger_reason"],
        "reasoning": pt["reasoning"],
        "next_best_action": pt["next_best_action"],
        "next_best_actions": pt.get("next_best_actions", []),
        "talking_points": pt.get("talking_points", []),
        "operational_icr": pt["operational_icr"], "adjusted_icr": pt["adjusted_icr"],
        "adjusted_icr_note": pt.get("adjusted_icr_note"),
        "evidence_references": pt["evidence_references"],
        "source": SOURCE_TRIGGER,
        "consistency": "identical_to_/recommendations/placement-trigger",
    })
    return out


VIEWS = {
    "overview": overview, "incumbent-defence": incumbent_defence, "rfq-readiness": rfq_readiness,
    "quote-comparison": quote_comparison, "terms-comparison": terms_comparison,
    "recommendation": recommendation,
}


def evidence(pctx: PlacementContext, kind: str) -> dict:
    """Governed evidence slice for a placement view (kind must be a known view)."""
    res = VIEWS[kind](pctx)
    keys = ("module", "view", "data_quality_status", "restricted", "advisory_blocked",
            "confidence", "confidence_score", "reliability", "caveats", "source_basis",
            "evidence_references", "reuses_engine", "benchmark_domain", "peer_group_definition",
            "negotiation_evidence", "trigger_reason")
    return {k: res[k] for k in keys if k in res}
