"""Intent -> governed engine routing. Each intent id maps to ONE approved governed engine call
(the same engines the module tabs use — no new engine, no metric recomputation). Every call is
wrapped so an error or empty result yields a No-Data envelope the composer renders as Not available.
Read-only; tenant + client scoped via the AskContext filters."""
from __future__ import annotations

from ..metrics.base import MetricContext
from ..metrics import icr as m_icr, claims as m_claims
from ..metrics.dimensions import ailment_metrics, hospital_metrics
from ..benchmarking.base import BenchmarkContext
from ..benchmarking import comparison as b_cmp
from ..placement.context import PlacementContext
from ..placement import engine as pe
from ..wellness.base import WellnessContext
from ..wellness import overview as w_ov
from ..recommendations.base import RecoContext
from ..recommendations import renewal as r_renewal, nba as r_nba
from ..simulation.base import SimContext
from ..simulation import adjusted_icr as s_adj
from ..portfolio.context import PortfolioContext
from ..portfolio import broker as pf_broker, client as pf_client
from ..evidence.context import EvidenceContext
from ..evidence import overview as ev_overview
from ..exports.context import ExportContext
from ..exports import readiness as ex_readiness


class AskContext:
    def __init__(self, db, tenant: str, filters: dict | None = None):
        self.db = db
        self.tenant = tenant
        self.f = filters or {}

    @property
    def client_id(self):
        return self.f.get("client_id")

    def filt(self) -> dict:
        return {"client_id": self.client_id}


def _mc(a):
    return MetricContext(a.db, a.tenant, a.filt())


ENGINES = {
    "portfolio_summary": lambda a: pf_broker.broker_overview(PortfolioContext(a.db, a.tenant, a.filt())),
    "client_health": lambda a: pf_client.client_overview(PortfolioContext(a.db, a.tenant, a.filt()), a.client_id),
    "icr_explanation": lambda a: m_icr.icr_metrics(_mc(a)),
    "claims_drivers": lambda a: m_claims.claims_metrics(_mc(a)),
    "ailment_drivers": lambda a: ailment_metrics(_mc(a)),
    "hospital_drivers": lambda a: hospital_metrics(_mc(a)),
    "renewal_recommendation": lambda a: r_renewal.renewal_recommendation(RecoContext(a.db, a.tenant, a.filt())),
    "benchmark_gaps": lambda a: b_cmp.benchmark_overview(BenchmarkContext(a.db, a.tenant, a.filt())),
    "savings_sandbox": lambda a: s_adj.adjusted_icr_simulation(SimContext(a.db, a.tenant, a.filt())),
    "placement_recommendation": lambda a: pe.overview(PlacementContext(a.db, a.tenant, a.filt())),
    "wellness_opportunity": lambda a: w_ov.wellness_overview(WellnessContext(a.db, a.tenant, a.filt())),
    "data_quality_trust": lambda a: ev_overview.dq_overview(EvidenceContext(a.db, a.tenant, a.filt())),
    "export_readiness": lambda a: ex_readiness.pack_sections_catalogue(ExportContext(a.db, a.tenant, a.filt())),
    "next_best_action": lambda a: r_nba.next_best_action_reco(RecoContext(a.db, a.tenant, a.filt())),
}


def route(intent_id: str, actx: AskContext) -> dict:
    fn = ENGINES.get(intent_id)
    if not fn:
        return {"data_quality_status": "No Data", "value": {}, "caveats": ["No governed engine for this intent."]}
    try:
        return fn(actx) or {"data_quality_status": "No Data", "value": {}, "caveats": []}
    except Exception:
        return {"data_quality_status": "No Data", "value": {}, "caveats": ["Governed engine returned no data."]}
