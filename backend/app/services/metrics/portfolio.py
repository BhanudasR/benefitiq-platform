"""Portfolio / policy metrics — premium, lives, employee/dependent counts, sum
insured distribution, policy period/year, insurer/TPA, policy status. From
activated policy_version + member canonical data only."""
from __future__ import annotations

from .base import MetricContext, result, norm_relation
from ..profiling import parse_number


def portfolio_metrics(ctx: MetricContext) -> dict:
    pvs = ctx.scoped_policy_versions()
    members = ctx.members()
    total_premium = sum(float(p.premium) for p in pvs if p.premium is not None)

    lives = {m.member_reference_key for m in members}
    employees = {m.member_reference_key for m in members if norm_relation(m.relationship) == "Self"}
    sis = [parse_number(m.sum_insured) for m in members if parse_number(m.sum_insured) is not None]
    si_dist = None
    if sis:
        si_dist = {"total": sum(sis), "average": round(sum(sis) / len(sis), 2),
                   "min": min(sis), "max": max(sis)}

    caveats = []
    if not members:
        caveats.append("No member data in scope; lives/employee/dependent counts unavailable.")
    if not sis:
        caveats.append("Sum insured unavailable; SI distribution not computed.")

    value = {
        "total_premium": total_premium, "premium_basis": "written",
        "policy_version_count": len(pvs),
        "policy_years": sorted({p.policy_year for p in pvs if p.policy_year is not None}),
        "lives_covered": len(lives),
        "employee_count": len(employees),
        "dependent_count": len(lives) - len(employees),
        "sum_insured_distribution": si_dist,
        "insurers": sorted({p.insurer_code for p in pvs if p.insurer_code}),
        "tpas": sorted({p.tpa_code for p in pvs if p.tpa_code}),
        "policy_status": {s: sum(1 for p in pvs if p.status == s)
                          for s in sorted({p.status for p in pvs})},
    }
    return result(
        metric="portfolio", value=value, numerator=total_premium, denominator=len(lives) or None,
        formula="lives = distinct member_reference_key ; dependents = lives - employees(Self)",
        source_tables=["policy_version", "member_master"], ctx=ctx, rows=list(pvs) + list(members),
        caveats=caveats, premium_basis="written")
