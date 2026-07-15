"""Relation, hospital and ailment group-by metrics. Missing dimensions are shown
as an explicit caveat (never treated as zero / fabricated)."""
from __future__ import annotations

from .base import MetricContext, result, incurred_of, norm_relation
from ..profiling import parse_number


def _group(rows, key_fn):
    g = {}
    for c in rows:
        k = key_fn(c)
        b = g.setdefault(k, {"count": 0, "paid": 0.0, "incurred": 0.0})
        b["count"] += 1
        b["paid"] += parse_number(c.total_claim_paid) or 0.0
        b["incurred"] += incurred_of(c)
    total_incurred = sum(b["incurred"] for b in g.values()) or 0.0
    out = []
    for k, b in g.items():
        out.append({"key": k, "count": b["count"], "paid": round(b["paid"], 2),
                    "incurred": round(b["incurred"], 2),
                    "average_claim_size": round(b["incurred"] / b["count"], 2) if b["count"] else None,
                    "incurred_share": round(b["incurred"] / total_incurred, 4) if total_incurred else None})
    out.sort(key=lambda x: x["incurred"], reverse=True)
    return out


def relation_metrics(ctx: MetricContext) -> dict:
    rows = ctx.claims()
    mmap = {}
    for m in ctx.members():
        mmap.setdefault(m.member_reference_key, norm_relation(m.relationship))
        mmap[(m.member_reference_key, m.policy_year)] = norm_relation(m.relationship)

    def rel(c):
        return (mmap.get((c.member_reference_key, c.policy_year))
                or mmap.get(c.member_reference_key) or "Unknown")

    groups = _group(rows, rel)
    unknown = next((g["count"] for g in groups if g["key"] == "Unknown"), 0)
    parent = sum(g["incurred"] for g in groups if g["key"] in ("Father", "Mother"))
    total = sum(g["incurred"] for g in groups) or 0.0
    caveats = []
    if unknown:
        caveats.append(f"{unknown} claim(s) could not be linked to a member relationship (shown as 'Unknown').")
    if not rows:
        caveats.append("No claims in scope.")
    return result(
        metric="relation", value={"groups": groups,
                                   "parent_claim_share": round(parent / total, 4) if total else None},
        numerator=None, denominator=None,
        formula="group by member relationship ; parent_share = (Father+Mother) incurred / total incurred",
        source_tables=["claim", "member_master"], ctx=ctx, rows=rows, caveats=caveats)


def hospital_metrics(ctx: MetricContext) -> dict:
    rows = ctx.claims()
    missing = sum(1 for c in rows if not (c.hospital_name or "").strip())
    named = [c for c in rows if (c.hospital_name or "").strip()]
    groups = _group(named, lambda c: c.hospital_name.strip())
    net = sum(1 for c in named if c.hospital_is_network is True)
    non_net = sum(1 for c in named if c.hospital_is_network is False)
    concentration = groups[0]["incurred_share"] if groups else None
    caveats = []
    if missing:
        caveats.append(f"{missing} claim(s) have no hospital name; excluded from hospital grouping.")
    if not named:
        caveats.append("Hospital data unavailable in scope.")
    return result(
        metric="hospital", value={"top_hospitals": groups[:10],
                                  "network_count": net, "non_network_count": non_net,
                                  "top_hospital_concentration": concentration},
        numerator=None, denominator=None,
        formula="group by hospital_name ; concentration = top hospital incurred / total incurred",
        source_tables=["claim"], ctx=ctx, rows=rows, excluded_rows=missing, caveats=caveats)


def ailment_metrics(ctx: MetricContext) -> dict:
    rows = ctx.claims()
    missing = sum(1 for c in rows if not (c.diagnosis_code_l1 or "").strip())
    named = [c for c in rows if (c.diagnosis_code_l1 or "").strip()]
    groups = _group(named, lambda c: c.diagnosis_code_l1.strip())
    # recurring indicator: an ailment appearing in more than one claim
    for g in groups:
        g["recurring_indicator"] = g["count"] > 1
    caveats = []
    if missing:
        caveats.append(f"{missing} claim(s) have no ailment/diagnosis code; excluded from ailment grouping.")
    if not named:
        caveats.append("Ailment/diagnosis data unavailable in scope.")
    return result(
        metric="ailment", value={"top_ailments": groups[:15]},
        numerator=None, denominator=None,
        formula="group by diagnosis_code_l1 ; recurring_indicator = claim_count > 1",
        source_tables=["claim"], ctx=ctx, rows=rows, excluded_rows=missing, caveats=caveats)
