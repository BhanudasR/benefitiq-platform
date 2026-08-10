"""Client Portfolio — a client-360 control tower composed from the governed engines (portfolio,
icr, claims, benchmarking overview, placement overview, wellness overview, renewal
recommendation). Every headline reuses the same single-source engine the module tabs use, so
the numbers reconcile. Module views that return No-Data surface as "Not available" in the UI."""
from __future__ import annotations

import datetime

from .context import PortfolioContext
from .broker import _client_name, _bucket_days, _RELIABILITY, scoped_lives
from ..metrics.base import MetricContext, norm_relation
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
    policy_numbers = {p.policy_number for p in pvs}
    scoped_members = [m for m in mc.members() if m.policy_number in policy_numbers]
    end_dates = [p.policy_end_date for p in pvs if p.policy_end_date]
    next_date = min(end_dates) if end_dates else None
    next_days = (next_date - today).days if next_date else None
    reasons = reco.get("reasoning") or []
    relation_counts = {}
    for member in scoped_members:
        rel = norm_relation(member.relationship) or "Unknown"
        relation_counts[rel] = relation_counts.get(rel, 0) + 1
    policy_start_dates = [p.policy_start_date for p in pvs if p.policy_start_date]
    insurers = sorted({p.insurer_code for p in pvs if p.insurer_code})
    tpas = sorted({p.tpa_code for p in pvs if p.tpa_code})
    total_sum_insured = sum(float(m.sum_insured) for m in scoped_members if m.sum_insured is not None)
    sum_insured_values = [float(m.sum_insured) for m in scoped_members if m.sum_insured is not None]
    sum_insured_distribution = None
    if sum_insured_values:
        sum_insured_distribution = {
            "total": round(sum(sum_insured_values), 2),
            "average": round(sum(sum_insured_values) / len(sum_insured_values), 2),
            "min": round(min(sum_insured_values), 2),
            "max": round(max(sum_insured_values), 2),
        }
    age_values = [int(m.age) for m in scoped_members if m.age is not None]
    avg_age = round(sum(age_values) / len(age_values), 1) if age_values else None
    employee_keys = {m.member_reference_key for m in scoped_members if norm_relation(m.relationship) == "Self"}
    employee_count = len(employee_keys)
    dependent_count = max(lives - employee_count, 0)

    unsupported_metrics = {
        "projected_icr": None,
        "annualized_icr": None,
        "adjusted_icr": None,
        "opportunity_value": None,
        "renewal_loading_exposure": None,
        "top_claims_driver": None,
        "risk_score": None,
        "benefit_coverage_values": None,
    }

    value = {
        "client_id": client_id, "client_name": _client_name(pctx.db, pctx.tenant, client_id),
        "lives": lives, "premium": pf.get("total_premium"),
        "total_claims": cl.get("claim_count"), "claims_incurred": iv.get("incurred"),
        "operational_icr": iv.get("operational_icr"),
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
        "policy_snapshot": {
            "client_id": client_id,
            "client_name": _client_name(pctx.db, pctx.tenant, client_id),
            "policy_numbers": sorted(policy_numbers),
            "policy_years": pf.get("policy_years"),
            "policy_count": pf.get("policy_version_count"),
            "policy_start_date": str(min(policy_start_dates)) if policy_start_dates else None,
            "policy_end_date": str(next_date) if next_date else None,
            "days_to_renewal": next_days,
            "due_bucket": (_bucket_days(next_days) if next_days is not None else None),
            "policy_status": pf.get("policy_status"),
            "insurers": insurers,
            "tpas": tpas,
            "exposure": {
                "sum_insured_distribution": sum_insured_distribution,
                "total_sum_insured": round(total_sum_insured, 2) if total_sum_insured else None,
                "corporate_floater_sum_insured": None,
                "benefit_coverage_values": None,
            },
        },
        "financial_snapshot": {
            "annual_premium": pf.get("total_premium"),
            "claims_incurred": iv.get("incurred"),
            "earned_premium": iv.get("earned_premium"),
            "premium_basis": ic.get("premium_basis"),
            "operational_icr": iv.get("operational_icr"),
            "paid_icr": iv.get("paid_icr"),
            "outstanding_icr": iv.get("outstanding_icr"),
            "claim_count": cl.get("claim_count"),
            "projected_icr": None,
            "annualized_icr": None,
            "adjusted_icr": None,
            "renewal_loading_exposure": None,
        },
        "population_snapshot": {
            "lives": lives,
            "employees": employee_count,
            "dependents": dependent_count,
            "relation_distribution": relation_counts,
            "average_age": avg_age,
            "senior_citizens": None,
            "parents_covered": None,
        },
        "risk_readiness": {
            "data_quality_status": status,
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
            "renewal_status": {
                "next_renewal_date": str(next_date) if next_date else None,
                "days_to_renewal": next_days,
                "due_bucket": (_bucket_days(next_days) if next_days is not None else None),
            },
            "risk_score": None,
            "top_claims_driver": None,
        },
        "action_center": {
            "next_best_action": {
                "recommendation": reco.get("recommendation"), "confidence": reco.get("confidence"),
                "reason": (reasons[0].get("explanation") if reasons else None),
            },
            "linked_actions": [
                {"key": "renewal", "label": "Renewal Intelligence", "path": "/renewal"},
                {"key": "claims", "label": "Claims Analytics", "path": "/claims"},
                {"key": "benchmarking", "label": "Benchmarking", "path": "/benchmarking"},
                {"key": "placement", "label": "Placement Intelligence", "path": "/placement"},
                {"key": "wellness", "label": "Wellness Intelligence", "path": "/wellness"},
            ],
            "opportunity_value": None,
        },
        "unsupported_metrics": unsupported_metrics,
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
