"""Client Portfolio — a client-360 control tower composed from the governed engines (portfolio,
icr, claims, benchmarking overview, placement overview, wellness overview, renewal
recommendation). Every headline reuses the same single-source engine the module tabs use, so
the numbers reconcile. Module views that return No-Data surface as "Not available" in the UI."""
from __future__ import annotations

import datetime

from .context import PortfolioContext
from .broker import _client_name, _bucket_days, _RELIABILITY, scoped_lives
from ..metrics.base import MetricContext
from ..metrics import portfolio as m_pf, icr as m_icr, claims as m_claims
from ..benchmarking.base import BenchmarkContext
from ..benchmarking import comparison as b_cmp
from ..placement.context import PlacementContext
from ..placement import engine as pe
from ..wellness.base import WellnessContext
from ..wellness import overview as w_ov
from ..recommendations.base import RecoContext
from ..recommendations import renewal as r_renewal


def client_overview(pctx: PortfolioContext, client_id: str) -> dict:
    f = {"client_id": client_id}
    mc = MetricContext(pctx.db, pctx.tenant, dict(f))
    pf = (m_pf.portfolio_metrics(mc).get("value")) or {}
    ic = m_icr.icr_metrics(mc)
    iv = ic.get("value") or {}
    cl = (m_claims.claims_metrics(mc).get("value")) or {}
    status = ic.get("data_quality_status") or "No Data"

    bench = b_cmp.benchmark_overview(BenchmarkContext(pctx.db, pctx.tenant, dict(f)))
    plc = pe.overview(PlacementContext(pctx.db, pctx.tenant, dict(f)))
    well = w_ov.wellness_overview(WellnessContext(pctx.db, pctx.tenant, dict(f)))
    reco = r_renewal.renewal_recommendation(RecoContext(pctx.db, pctx.tenant, dict(f)))

    today = datetime.date.today()
    pvs = mc.scoped_policy_versions()
    lives = scoped_lives(mc, pvs)
    end_dates = [p.policy_end_date for p in pvs if p.policy_end_date]
    next_date = min(end_dates) if end_dates else None
    next_days = (next_date - today).days if next_date else None
    reasons = reco.get("reasoning") or []

    value = {
        "client_id": client_id, "client_name": _client_name(pctx.db, pctx.tenant, client_id),
        "lives": lives, "premium": pf.get("total_premium"),
        "total_claims": cl.get("claim_count"), "operational_icr": iv.get("operational_icr"),
        "policy_years": pf.get("policy_years"), "policy_status": pf.get("policy_status"),
        "premium_basis": ic.get("premium_basis"),
        "data_quality_status": status,
        "renewal_status": {
            "next_renewal_date": str(next_date) if next_date else None,
            "days_to_renewal": next_days,
            "due_bucket": (_bucket_days(next_days) if next_days is not None else None),
        },
        "benchmarking_status": {
            "valid_peer_group": bench.get("valid_peer_group"), "confidence": bench.get("confidence"),
            "features_comparable": bench.get("features_comparable"), "features_total": bench.get("features_total"),
        },
        "placement_status": {
            "placement_state": plc.get("placement_state"),
            "incumbent_defence_score": plc.get("incumbent_defence_score"),
            "rfq_readiness": plc.get("rfq_readiness"),
            "data_quality_status": plc.get("data_quality_status"),
        },
        "wellness_status": {
            "posture": well.get("summary"), "data_quality_status": well.get("data_quality_status"),
        },
        "next_best_action": {
            "recommendation": reco.get("recommendation"), "confidence": reco.get("confidence"),
            "reason": (reasons[0].get("explanation") if reasons else None),
        },
        "links": {"renewal": "/renewal", "benchmarking": "/benchmarking",
                  "placement": "/placement", "wellness": "/wellness", "claims": "/claims"},
    }

    caveats = list(ic.get("caveats") or [])
    if not next_date:
        caveats.append("No policy end date on file; renewal status is Not available.")
    return {
        "module": "client_portfolio", "view": "client_overview", "value": value,
        "data_quality_status": status, "restricted": ic.get("restricted", False),
        "advisory_blocked": ic.get("advisory_blocked", False), "reliability": _RELIABILITY.get(status, "none"),
        "caveats": caveats,
        "formula": "client-360 composed from governed portfolio/icr/claims + benchmarking/placement/"
                   "wellness overviews + renewal recommendation (single-source; reconciles with the module tabs)",
        "source_basis": ["governed metric engines", "benchmarking / placement / wellness overviews",
                         "renewal recommendation"],
        "reuses_engine": "metrics + benchmarking + placement + wellness + recommendations",
    }
