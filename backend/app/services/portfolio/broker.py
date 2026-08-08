"""Broker Portfolio — book-level rollup across the tenant's clients. Composes the governed
metric engines per client; risk bands reuse RecommendationConfig ICR thresholds; renewal-due
buckets are the governed 30/60/90-day windows from policy_end_date. No re-derivation, no
migration. Aggregate only (client-level cards carry no member PII)."""
from __future__ import annotations

import datetime

from .context import PortfolioContext
from ..metrics.base import MetricContext
from ..metrics import portfolio as m_pf, icr as m_icr, claims as m_claims
from ..recommendations.config import get_reco_config
from ...models.canonical import ClientMaster

_RELIABILITY = {"Analytics Ready": "high", "Conditional": "medium", "Restricted": "low", "No Data": "none"}


def _risk_band(icr, cfg):
    if icr is None:
        return "unknown"
    if icr <= cfg["icr_defend_max"]:
        return "defend"
    if icr <= cfg["icr_negotiate_max"]:
        return "negotiate"
    if icr <= cfg["icr_redesign_max"]:
        return "redesign"
    return "place"


def _client_name(db, tenant, cid):
    row = db.query(ClientMaster).filter(
        ClientMaster.tenant_id == tenant, ClientMaster.client_id == cid).first()
    return row.client_name if row and row.client_name else cid


def scoped_lives(mc, pvs):
    """Client-correct life count: MetricContext.members() is not client-scoped, so scope members
    to the client's policy numbers before counting distinct lives (never double-count across clients)."""
    pns = {p.policy_number for p in pvs}
    members = [m for m in mc.members() if m.policy_number in pns]
    return len({m.member_reference_key for m in members})


def _bucket_days(days):
    if days < 0:
        return "overdue"
    if days <= 30:
        return "d30"
    if days <= 60:
        return "d60"
    if days <= 90:
        return "d90"
    return "later"


def _urgency_band(days):
    if days is None:
        return "low"
    if days <= 30:
        return "high"
    if days <= 60:
        return "medium"
    return "low"


def _risk_impact(band):
    if band in ("redesign", "place"):
        return "high"
    if band == "negotiate":
        return "medium"
    return "low"


def _priority_score(client):
    risk_weight = {"place": 4, "redesign": 3, "negotiate": 2, "defend": 1, "unknown": 0}
    days = client.get("next_renewal_days")
    if days is None:
        urgency = 0
    elif days <= 0:
        urgency = 4
    elif days <= 30:
        urgency = 3
    elif days <= 60:
        urgency = 2
    elif days <= 90:
        urgency = 1
    else:
        urgency = 0
    return (risk_weight.get(client.get("risk_band"), 0), urgency, client.get("premium") or 0)


def _action_bucket(client):
    days = client.get("next_renewal_days")
    high_risk = client.get("risk_band") in ("redesign", "place")
    medium_risk = client.get("risk_band") == "negotiate"
    if high_risk and days is not None and days <= 30:
        return "immediate_attention"
    if high_risk and days is not None and days <= 60:
        return "plan_strategy_call"
    if (high_risk or medium_risk) and days is not None and days <= 90:
        return "monitor_closely"
    return "track_prepare"


def broker_overview(pctx: PortfolioContext) -> dict:
    cfg = get_reco_config(pctx.db, pctx.tenant)
    today = datetime.date.today()
    cids = pctx.client_ids()

    clients = []
    renewal = {"overdue": 0, "d30": 0, "d60": 0, "d90": 0, "later": 0, "missing": 0}
    risk: dict = {}
    readiness: dict = {}
    total_lives = total_claims = active_policies = 0
    total_premium = total_incurred = total_earned = 0.0

    for cid in cids:
        mc = MetricContext(pctx.db, pctx.tenant, {"client_id": cid})
        pf = (m_pf.portfolio_metrics(mc).get("value")) or {}
        ic = m_icr.icr_metrics(mc)
        iv = ic.get("value") or {}
        cl = (m_claims.claims_metrics(mc).get("value")) or {}
        icr_val = iv.get("operational_icr")
        dq = ic.get("data_quality_status") or "No Data"

        pvs = mc.scoped_policy_versions()
        end_days = [(p.policy_end_date - today).days for p in pvs if p.policy_end_date]
        for p in pvs:
            if p.policy_end_date is None:
                renewal["missing"] += 1
            else:
                renewal[_bucket_days((p.policy_end_date - today).days)] += 1
        next_days = min(end_days) if end_days else None

        lives = scoped_lives(mc, pvs)
        band = _risk_band(icr_val, cfg)
        risk[band] = risk.get(band, 0) + 1
        readiness[dq] = readiness.get(dq, 0) + 1
        total_lives += lives
        total_premium += pf.get("total_premium") or 0.0
        total_claims += cl.get("claim_count") or 0
        active_policies += pf.get("policy_version_count") or 0
        if iv.get("incurred") is not None:
            total_incurred += iv["incurred"]
        if iv.get("earned_premium") is not None:
            total_earned += iv["earned_premium"]

        clients.append({
            "client_id": cid, "client_name": _client_name(pctx.db, pctx.tenant, cid),
            "lives": lives, "premium": round(pf.get("total_premium") or 0.0, 2),
            "claims_incurred": round(iv.get("incurred") or 0.0, 2),
            "icr": icr_val, "projected_icr": None, "adjusted_icr": None,
            "data_quality_status": dq, "policy_count": pf.get("policy_version_count") or 0,
            "next_renewal_days": next_days,
            "renewal_due_bucket": _bucket_days(next_days) if next_days is not None else "missing",
            "risk_band": band, "risk_impact": _risk_impact(band), "urgency_band": _urgency_band(next_days),
            "industry": None, "risk_score": None, "main_claims_driver": None, "recommended_next_action": None,
        })

    clients.sort(key=lambda c: (c["icr"] if c["icr"] is not None else -1), reverse=True)
    portfolio_icr = round(total_incurred / total_earned * 100, 2) if total_earned else None
    icr_values = [c["icr"] for c in clients if c["icr"] is not None]
    average_client_icr = round(sum(icr_values) / len(icr_values), 2) if icr_values else None
    high_risk = [c for c in clients if c["risk_band"] in ("redesign", "place")]
    premium_at_risk = round(sum(c["premium"] or 0.0 for c in high_risk), 2)
    claims_at_risk = round(sum(c["claims_incurred"] or 0.0 for c in high_risk), 2)
    due_soon_clients = [c for c in clients if c["next_renewal_days"] is not None and c["next_renewal_days"] <= 30]
    high_risk_renewals = [c for c in high_risk if c["next_renewal_days"] is not None and c["next_renewal_days"] <= 90]

    priority_matrix = {
        impact: {urgency: 0 for urgency in ("low", "medium", "high")}
        for impact in ("low", "medium", "high")
    }
    for c in clients:
        priority_matrix[c["risk_impact"]][c["urgency_band"]] += 1

    queue_defs = [
        ("immediate_attention", "Immediate Attention", "High risk + <=30 days"),
        ("plan_strategy_call", "Plan Strategy Call", "High risk + 31-60 days"),
        ("monitor_closely", "Monitor Closely", "Medium/high risk + 61-90 days"),
        ("track_prepare", "Track & Prepare", ">90 days or lower risk"),
    ]
    queue_counts = {k: 0 for k, _, _ in queue_defs}
    for c in clients:
        queue_counts[_action_bucket(c)] += 1
    renewal_action_queue = [
        {"key": key, "label": label, "basis": basis, "count": queue_counts[key]}
        for key, label, basis in queue_defs
    ]
    client_risk_queue = sorted(clients, key=_priority_score, reverse=True)

    nbas = []
    if high_risk:
        nbas.append(f"{len(high_risk)} client(s) at or above the redesign ICR band — prioritise renewal review.")
    due_soon = renewal["overdue"] + renewal["d30"]
    if due_soon:
        nbas.append(f"{due_soon} renewal(s) overdue or due within 30 days — confirm the renewal strategy.")
    if readiness.get("Restricted"):
        nbas.append(f"{readiness['Restricted']} client(s) on Restricted data — figures are directional; raise data quality.")

    # book DQ status = worst across clients (governed)
    if not cids:
        status = "No Data"
    elif readiness.get("Restricted"):
        status = "Restricted"
    elif readiness.get("Conditional"):
        status = "Conditional"
    elif readiness.get("Analytics Ready"):
        status = "Analytics Ready"
    else:
        status = "No Data"

    caveats = []
    if renewal["missing"]:
        caveats.append(f"{renewal['missing']} policy(ies) have no end date; excluded from renewal-due buckets.")
    if not cids:
        caveats.append("No governed clients in scope.")

    value = {
        "total_clients": len(cids), "active_policies": active_policies, "total_lives": total_lives,
        "total_premium": round(total_premium, 2), "total_claims": total_claims,
        "claims_incurred": round(total_incurred, 2), "portfolio_icr": portfolio_icr,
        "average_client_icr": average_client_icr, "projected_portfolio_icr": None,
        "premium_at_risk": premium_at_risk, "claims_at_risk": claims_at_risk,
        "expected_renewal_loading_exposure": None, "opportunity_value": None,
        "renewal_due_clients": len(due_soon_clients), "high_risk_renewals": len(high_risk_renewals),
        "premium_basis": "written",
        "renewal_due": renewal, "risk_distribution": risk, "readiness_distribution": readiness,
        "priority_matrix": priority_matrix, "renewal_action_queue": renewal_action_queue,
        "client_risk_queue": client_risk_queue, "clients": clients,
        "high_risk_clients": high_risk, "next_best_actions": nbas,
        "risk_band_basis": cfg.get("threshold_basis"),
    }
    return {
        "module": "broker_portfolio", "view": "broker_overview", "value": value,
        "data_quality_status": status, "restricted": status == "Restricted",
        "advisory_blocked": status == "Restricted", "reliability": _RELIABILITY[status],
        "caveats": caveats,
        "formula": "per-client rollup of governed portfolio/icr/claims metrics ; risk band from "
                   "RecommendationConfig ICR thresholds ; renewal-due 30/60/90-day windows from policy_end_date",
        "source_basis": ["governed metric engines (portfolio, icr, claims)", "RecommendationConfig ICR bands"],
        "reuses_engine": "metrics + recommendations.config",
    }
