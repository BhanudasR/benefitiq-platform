"""Client-pack builder — composes each section from the governed engines and assembles the pack
with min-band-gated trust. Only hand-picked SCALAR governed values are embedded (no raw member/
claim rows, no PII shape). Every engine call is wrapped so a No-Data / unavailable section renders
'Not available' rather than failing the pack. No new decision logic; no metric recomputation."""
from __future__ import annotations

import datetime

from . import kpi, section, not_available, pack_trust, READINESS
from .context import ExportContext
from .sections import get_section, resolve_ids, ordered_full
from .appendix import build_appendix

from ..evidence import norm_band, RELIABILITY
from ..metrics.base import MetricContext
from ..metrics import portfolio as m_pf, icr as m_icr, claims as m_claims
from ..metrics.dimensions import ailment_metrics, hospital_metrics
from ..benchmarking.base import BenchmarkContext
from ..benchmarking import comparison as b_cmp
from ..placement.context import PlacementContext
from ..placement import engine as pe
from ..wellness.base import WellnessContext
from ..wellness import overview as w_ov
from ..recommendations.base import RecoContext
from ..recommendations import renewal as r_renewal
from ..simulation.base import SimContext
from ..simulation import adjusted_icr as s_adj
from ..portfolio.context import PortfolioContext
from ..portfolio import client as pf_client


def _icr_headline(icr):
    if icr is None:
        return "Operational ICR is Not available for this client."
    if icr >= 100:
        return f"Operational ICR {icr}% — claims exceed premium; renewal action is a priority."
    if icr >= 80:
        return f"Operational ICR {icr}% — elevated; review renewal levers and benchmark gaps."
    return f"Operational ICR {icr}% — within a defensible band; protect the incumbent terms."


# ---- section builders -------------------------------------------------------
def _executive_summary(ectx):
    f = ectx.filt()
    mc = MetricContext(ectx.db, ectx.tenant, dict(f))
    pfv = (m_pf.portfolio_metrics(mc).get("value")) or {}
    ic = m_icr.icr_metrics(mc); iv = ic.get("value") or {}
    clv = (m_claims.claims_metrics(mc).get("value")) or {}
    status = ic.get("data_quality_status") or "No Data"
    kpis = [
        kpi("Total premium", pfv.get("total_premium"), "currency", status=status, source="policy_version"),
        kpi("Operational ICR", iv.get("operational_icr"), "percent", status=status,
            source="claim + policy_version", confidence=ic.get("reliability")),
        kpi("Incurred claims", iv.get("incurred"), "currency", status=status, source="claim"),
        kpi("Claim count", clv.get("claim_count"), "number", status=status, source="claim"),
        kpi("Active policies", pfv.get("policy_version_count"), "number", status=status, source="policy_version"),
    ]
    return section("executive_summary", "Executive Summary", status=status,
                   headline=_icr_headline(iv.get("operational_icr")), kpis=kpis,
                   caveats=ic.get("caveats"), source_tables=["policy_version", "claim"],
                   confidence=ic.get("reliability"),
                   evidence={"formula": ic.get("formula"), "source_tables": ic.get("source_tables")})


def _client_portfolio(ectx):
    pctx = PortfolioContext(ectx.db, ectx.tenant, ectx.filt())
    r = pf_client.client_overview(pctx, ectx.client_id)
    v = r.get("value") or {}
    status = r.get("data_quality_status") or "No Data"
    rs = v.get("renewal_status") or {}
    kpis = [
        kpi("Lives", v.get("lives"), "number", status=status, source="member_master"),
        kpi("Premium", v.get("premium"), "currency", status=status, source="policy_version"),
        kpi("Operational ICR", v.get("operational_icr"), "percent", status=status, source="claim + policy_version"),
        kpi("Total claims", v.get("total_claims"), "number", status=status, source="claim"),
        kpi("Next renewal", rs.get("days_to_renewal"), "days", status=status, source="policy_version"),
    ]
    return section("client_portfolio", "Client Portfolio", status=status,
                   headline=f"{v.get('client_name') or ectx.client_id} — client-360 reconciles with the module tabs.",
                   kpis=kpis, caveats=r.get("caveats"),
                   source_tables=["policy_version", "member_master", "claim"],
                   confidence=r.get("reliability"),
                   evidence={"formula": r.get("formula"), "source_tables": r.get("source_basis")})


def _renewal_intelligence(ectx):
    r = r_renewal.renewal_recommendation(RecoContext(ectx.db, ectx.tenant, ectx.filt()))
    status = r.get("data_quality_status") or "No Data"
    reasons = r.get("reasoning") or []
    kpis = [
        kpi("Recommended stance", r.get("recommendation"), "text", status=status, source="renewal engine"),
        kpi("Confidence", r.get("confidence"), "text", status=status, source="renewal engine"),
    ]
    headline = (reasons[0].get("explanation") if reasons else None) or "Renewal stance is Not available."
    return section("renewal_intelligence", "Renewal Intelligence", status=status, headline=headline,
                   kpis=kpis, caveats=r.get("caveats"), source_tables=r.get("source_tables") or ["claim", "policy_version"],
                   confidence=r.get("confidence"),
                   evidence={"formula": r.get("formula"), "source_tables": r.get("source_tables")})


def _claims_drivers(ectx):
    f = ectx.filt()
    mc = MetricContext(ectx.db, ectx.tenant, dict(f))
    cl = m_claims.claims_metrics(mc); clv = cl.get("value") or {}
    status = cl.get("data_quality_status") or "No Data"
    ail = ailment_metrics(MetricContext(ectx.db, ectx.tenant, dict(f))); ailv = ail.get("value") or {}
    hosp = hospital_metrics(MetricContext(ectx.db, ectx.tenant, dict(f))); hospv = hosp.get("value") or {}
    top_ail = (ailv.get("top") or ailv.get("ailments") or [])
    top_ail_name = top_ail[0].get("label") if top_ail and isinstance(top_ail[0], dict) else None
    kpis = [
        kpi("Claim count", clv.get("claim_count"), "number", status=status, source="claim"),
        kpi("Incurred", clv.get("incurred") or clv.get("total_incurred"), "currency", status=status, source="claim"),
        kpi("Top ailment group", top_ail_name, "text", status=ail.get("data_quality_status"), source="claim.diagnosis_code_l1"),
        kpi("Distinct hospitals", hospv.get("hospital_count") or hospv.get("distinct"), "number",
            status=hosp.get("data_quality_status"), source="claim.hospital"),
    ]
    return section("claims_drivers", "Claims Drivers", status=status,
                   headline="Top cost drivers by ailment group and hospital (aggregate; no member identity).",
                   kpis=kpis, caveats=cl.get("caveats"), source_tables=["claim"],
                   confidence=cl.get("reliability"),
                   evidence={"formula": cl.get("formula"), "source_tables": cl.get("source_tables")})


def _benchmark_gaps(ectx):
    r = b_cmp.benchmark_overview(BenchmarkContext(ectx.db, ectx.tenant, ectx.filt()))
    status = r.get("data_quality_status") or ("Analytics Ready" if r.get("valid_peer_group") else "No Data")
    kpis = [
        kpi("Valid peer group", r.get("valid_peer_group"), "bool", status=status, source="benchmark_observation"),
        kpi("Features comparable", r.get("features_comparable"), "number", status=status, source="benefit_term"),
        kpi("Features total", r.get("features_total"), "number", status=status, source="benefit_term"),
        kpi("Gaps identified", r.get("gaps") or r.get("gap_count"), "number", status=status, source="benefit_term"),
    ]
    return section("benchmark_gaps", "Benefit / Benchmark Gaps", status=status,
                   headline="Benefit design & policy T&C gaps vs peers (advisory; never claims-driven).",
                   kpis=kpis, caveats=r.get("caveats"), source_tables=["benefit_term", "benchmark_observation"],
                   confidence=r.get("confidence"),
                   evidence={"formula": r.get("formula"), "source_tables": r.get("source_tables")})


def _savings_sandbox(ectx):
    r = s_adj.adjusted_icr_simulation(SimContext(ectx.db, ectx.tenant, ectx.filt()))
    v = r.get("value") or {}
    status = r.get("data_quality_status") or "No Data"
    kpis = [
        kpi("Operational ICR", v.get("operational_icr"), "percent", status=status, source="claim + policy_version"),
        kpi(v.get("adjusted_label") or "Adjusted ICR", v.get("adjusted_icr"), "percent", status=status, source="claim + policy_version"),
    ]
    return section("savings_sandbox", "Savings Sandbox", status=status,
                   headline="Baseline vs large-claim-adjusted ICR. Lever scenarios are interactive in the Sandbox tab.",
                   kpis=kpis, caveats=r.get("caveats"), source_tables=["claim", "policy_version", "benefit_term"],
                   confidence=r.get("reliability"),
                   evidence={"formula": r.get("formula"), "source_tables": r.get("source_tables")})


def _placement_recommendation(ectx):
    pctx = PlacementContext(ectx.db, ectx.tenant, ectx.filt())
    ov = pe.overview(pctx)
    reco = pe.recommendation(pctx)
    status = ov.get("data_quality_status") or "No Data"
    rv = reco.get("value") or reco
    kpis = [
        kpi("Placement state", ov.get("placement_state"), "text", status=status, source="placement engine"),
        kpi("Incumbent defence", ov.get("incumbent_defence_score"), "share", status=status, source="placement engine"),
        kpi("RFQ readiness", ov.get("rfq_readiness"), "share", status=status, source="placement engine"),
        kpi("Recommendation", rv.get("recommendation") if isinstance(rv, dict) else None, "text",
            status=status, source="placement engine"),
    ]
    return section("placement_recommendation", "Placement Recommendation", status=status,
                   headline="Defend, negotiate or go to market — governed placement signal (no fabricated quotes).",
                   kpis=kpis, caveats=ov.get("caveats"), source_tables=["claim", "benefit_term"],
                   confidence=ov.get("confidence") or ov.get("reliability"),
                   evidence={"formula": ov.get("formula"), "source_tables": ov.get("source_tables")})


def _wellness_opportunity(ectx):
    r = w_ov.wellness_overview(WellnessContext(ectx.db, ectx.tenant, ectx.filt()))
    status = r.get("data_quality_status") or "No Data"
    kpis = [
        kpi("Posture", r.get("summary"), "text", status=status, source="claim (k-anonymised)"),
        kpi("Priority categories", r.get("priority_count") or r.get("opportunity_count"), "number",
            status=status, source="claim (k-anonymised)"),
    ]
    return section("wellness_opportunity", "Wellness Opportunity", status=status,
                   headline=(r.get("summary") or "Wellness opportunity is Not available."),
                   kpis=kpis, caveats=r.get("caveats"),
                   source_tables=["claim"], confidence=r.get("confidence") or r.get("reliability"),
                   evidence={"formula": r.get("formula"), "source_tables": r.get("source_tables")})


_BUILDERS = {
    "executive_summary": _executive_summary,
    "client_portfolio": _client_portfolio,
    "renewal_intelligence": _renewal_intelligence,
    "claims_drivers": _claims_drivers,
    "benchmark_gaps": _benchmark_gaps,
    "savings_sandbox": _savings_sandbox,
    "placement_recommendation": _placement_recommendation,
    "wellness_opportunity": _wellness_opportunity,
}


def _safe(sid, ectx):
    meta = get_section(sid)
    title = meta["title"] if meta else sid
    fn = _BUILDERS.get(sid)
    if not fn:
        return not_available(sid, title, "Section builder not available.")
    try:
        return fn(ectx)
    except Exception:
        return not_available(sid, title, "Section engine returned no governed data.")


def build_cover(ectx, pack_status, directional):
    return section("cover", "Cover", status=pack_status,
                   headline=f"{ectx.client_name()} — BenefitIQ client pack",
                   kpis=[kpi("Client", ectx.client_name(), "text", status=pack_status),
                         kpi("Generated", datetime.date.today().isoformat(), "text", status=pack_status),
                         kpi("Pack trust", pack_status, "text", status=pack_status)],
                   caveats=(["Directional pack — a Restricted dataset is in scope; not for binding client advice."]
                            if directional else []),
                   source_tables=["governed engines"], confidence=RELIABILITY.get(pack_status, "none"),
                   evidence={"formula": "min-band-gated trust across included sections"})


def build_pack(ectx: ExportContext, requested_ids=None, pack_type=None) -> dict:
    content_ids = resolve_ids(requested_ids, pack_type)
    content_sections = [_safe(sid, ectx) for sid in content_ids]

    pack_status, directional = pack_trust([s["status"] for s in content_sections])
    cover = build_cover(ectx, pack_status, directional)
    appendix = build_appendix(ectx, content_sections)

    # assemble in registry order: cover -> content -> appendix
    sections = [cover] + content_sections + [appendix]

    caveats = []
    if directional:
        caveats.append("Pack contains a Restricted dataset — figures are directional only and must "
                       "not be used for binding client-facing advice.")
    restricted_sections = [s["title"] for s in content_sections if s["status"] == "Restricted"]
    if restricted_sections:
        caveats.append("Restricted sections: " + ", ".join(restricted_sections) + ".")
    na = [s["title"] for s in content_sections if s["status"] == "No Data"]
    if na:
        caveats.append("Not available (no governed data): " + ", ".join(na) + ".")

    value = {
        "client_id": ectx.client_id, "client_name": ectx.client_name(),
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "pack_type": pack_type or ("custom" if requested_ids else "full_board_pack"),
        "included_section_ids": content_ids,
        "section_order": [s["id"] for s in sections],
        "sections": sections,
        "pack_status": pack_status, "directional": directional,
        "trust_note": ("Directional — a Restricted dataset is in scope." if directional
                       else "Governed pack — figures reconcile to the module tabs."),
    }
    return {
        "module": "client_pack", "view": "client_pack", "value": value,
        "data_quality_status": pack_status, "restricted": pack_status == "Restricted",
        "advisory_blocked": pack_status == "Restricted", "reliability": RELIABILITY.get(pack_status, "none"),
        "caveats": caveats,
        "formula": "client pack = governed composition of the module engines ; pack trust = "
                   "min-band-gates across included sections (Restricted < Conditional < Analytics Ready)",
        "source_tables": ["governed metric/recommendation/benchmarking/placement/wellness/evidence engines"],
        "reuses_engine": "metrics + portfolio + recommendations + benchmarking + simulation + placement + wellness + evidence",
    }
