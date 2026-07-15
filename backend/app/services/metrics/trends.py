"""Multi-year trend metrics — per policy_year series + year-on-year deltas for
premium, paid, incurred, ICR, claim count/frequency, average claim size and large
claims. Medical-inflation PROXY = YoY change in average claim size (labelled a
proxy, not actuarial medical inflation). Dynamic 1-5+ year windows via filters."""
from __future__ import annotations

from .base import MetricContext, result, incurred_of, get_config
from ...models.canonical import PolicyVersion
from ..profiling import parse_number


def _premium_for_year(ctx, year):
    pvs = ctx.db.query(PolicyVersion).filter(
        PolicyVersion.tenant_id == ctx.tenant,
        PolicyVersion.dataset_version_id.in_(ctx.active_version_ids()),
        PolicyVersion.policy_year == year).all()
    return sum(float(p.premium) for p in pvs if p.premium is not None)


def trend_metrics(ctx: MetricContext) -> dict:
    rows = ctx.claims()
    threshold = get_config(ctx.db, ctx.tenant)["large_claim_threshold"]
    by_year: dict = {}
    for c in rows:
        y = c.policy_year
        if y is None:
            continue
        b = by_year.setdefault(y, {"paid": 0.0, "outstanding": 0.0, "count": 0, "large": 0})
        b["paid"] += parse_number(c.total_claim_paid) or 0.0
        b["outstanding"] += parse_number(c.outstanding_amount) or 0.0
        b["count"] += 1
        if incurred_of(c) >= threshold:
            b["large"] += 1

    excluded = sum(1 for c in rows if c.policy_year is None)
    series = []
    for y in sorted(by_year):
        b = by_year[y]
        incurred = b["paid"] + b["outstanding"]
        premium = _premium_for_year(ctx, y)
        avg = round(incurred / b["count"], 2) if b["count"] else None
        series.append({
            "policy_year": y, "premium": premium, "paid": b["paid"],
            "incurred": incurred, "claim_count": b["count"], "average_claim_size": avg,
            "large_claim_count": b["large"],
            "operational_icr": round(incurred / premium * 100, 2) if premium else None,
        })

    def yoy(cur, prev, key):
        a, p = cur.get(key), prev.get(key)
        if a is None or p in (None, 0):
            return None
        return round((a - p) / p * 100, 2)

    yoy_list = []
    for i in range(1, len(series)):
        cur, prev = series[i], series[i - 1]
        yoy_list.append({
            "from_year": prev["policy_year"], "to_year": cur["policy_year"],
            "premium_pct": yoy(cur, prev, "premium"),
            "paid_pct": yoy(cur, prev, "paid"),
            "incurred_pct": yoy(cur, prev, "incurred"),
            "icr_pct": yoy(cur, prev, "operational_icr"),
            "claim_count_pct": yoy(cur, prev, "claim_count"),
            "avg_claim_size_pct": yoy(cur, prev, "average_claim_size"),
            "medical_inflation_proxy_pct": yoy(cur, prev, "average_claim_size"),
        })
    caveats = ["medical_inflation_proxy_pct is a PROXY (YoY change in average claim size), "
               "not actuarial medical inflation."]
    if excluded:
        caveats.append(f"{excluded} claim(s) with unresolved policy_year excluded from the trend.")
    return result(
        metric="trends", value={"series": series, "yoy": yoy_list, "years": sorted(by_year)},
        numerator=None, denominator=None,
        formula="per policy_year aggregation ; yoy% = (year - prior) / prior x 100",
        source_tables=["claim", "policy_version"], ctx=ctx, rows=rows,
        excluded_rows=excluded, caveats=caveats, premium_basis="written")
