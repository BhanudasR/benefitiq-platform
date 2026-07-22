"""SI Utilization metrics (Sprint 21) — sum-insured bands, per-member utilization
(member incurred / member sum insured), utilization bands, exhausted / high-utilization
counts and governed under/over-insured SIGNALS. Governed + explainable, tenant-scoped.

AGGREGATE ONLY — no member-level rows, no PII. Backend computes utilization; claims link to
members ONLY through the governed member_reference_key. Unlinked claims and missing SI are
caveated (never silently ignored). Under/over-insured are utilization-vs-SI signals, NOT
actuarial adequacy verdicts."""
from __future__ import annotations

from .base import MetricContext, result, incurred_of
from ...models.canonical import PolicyMaster

# governed sum-insured bands (INR) and utilization thresholds (documented constants)
SI_BANDS = [("<3L", 0, 300000), ("3-5L", 300000, 500000), ("5-10L", 500000, 1000000),
            ("10-25L", 1000000, 2500000), ("25L+", 2500000, None)]
UTIL_BAND_ORDER = ["0%", "1-25%", "25-50%", "50-75%", "75-99%", ">=100% (exhausted)"]
EXHAUSTED = 1.0
HIGH_UTIL = 0.75
OVERINSURED_MAX = 0.05     # very low utilization => SI likely high (signal only)


def _si_band(si: float):
    for label, lo, hi in SI_BANDS:
        if hi is None:
            if si >= lo:
                return label
        elif lo <= si < hi:
            return label
    return None


def _util_band(u: float):
    if u >= 1.0:
        return ">=100% (exhausted)"
    if u > 0.75:
        return "75-99%"
    if u > 0.50:
        return "50-75%"
    if u > 0.25:
        return "25-50%"
    if u > 0.0:
        return "1-25%"
    return "0%"


def si_utilization_metrics(ctx: MetricContext) -> dict:
    members = ctx.members()
    claims = ctx.claims()

    incurred_by_key: dict = {}
    unlinked = 0
    for c in claims:
        key = c.member_reference_key
        if not key:
            unlinked += 1
            continue
        incurred_by_key[key] = incurred_by_key.get(key, 0.0) + incurred_of(c)
    member_keys = {m.member_reference_key for m in members}
    unlinked += sum(1 for c in claims if c.member_reference_key and c.member_reference_key not in member_keys)

    n = len(members)
    missing_si = sum(1 for m in members if m.sum_insured is None)
    with_si = [m for m in members if m.sum_insured is not None and float(m.sum_insured) > 0]

    si_counts = {label: 0 for label, _, _ in SI_BANDS}
    for m in with_si:
        b = _si_band(float(m.sum_insured))
        if b:
            si_counts[b] += 1
    si_bands = [{"band": label, "count": si_counts[label],
                 "share": round(si_counts[label] / len(with_si), 4) if with_si else None}
                for label, _, _ in SI_BANDS]

    utils = []
    util_counts = {b: 0 for b in UTIL_BAND_ORDER}
    exhausted = high = overinsured = 0
    for m in with_si:
        si = float(m.sum_insured)
        inc = incurred_by_key.get(m.member_reference_key, 0.0)
        u = inc / si                                   # utilization is computed in the BACKEND
        utils.append(u)
        util_counts[_util_band(u)] += 1
        if u >= EXHAUSTED:
            exhausted += 1
        if u >= HIGH_UTIL:
            high += 1
        if u <= OVERINSURED_MAX:
            overinsured += 1
    utilization_bands = [{"band": b, "count": util_counts[b]} for b in UTIL_BAND_ORDER]
    average_utilization = round(sum(utils) / len(utils), 4) if utils else None
    exhausted_share = round(exhausted / len(with_si), 4) if with_si else None

    floater_policies = ctx.db.query(PolicyMaster).filter(
        PolicyMaster.tenant_id == ctx.tenant,
        PolicyMaster.dataset_version_id.in_(ctx.active_version_ids())).all()
    family_floater_available = any(p.corporate_floater_sum_insured is not None for p in floater_policies)

    caveats = []
    if missing_si:
        caveats.append(f"{missing_si} member(s) have no sum insured; excluded from SI-band and utilization analysis.")
    if unlinked:
        caveats.append(f"{unlinked} claim(s) could not be linked to a member via member_reference_key; "
                       f"excluded from member utilization (not silently ignored).")
    if not members:
        caveats.append("No members in scope.")
    caveats.append("Under-insured / over-insured are utilization-vs-SI SIGNALS only "
                   "(utilization = member incurred / member sum insured), not actuarial adequacy verdicts.")

    value = {
        "member_count": n,
        "si_bands": si_bands,
        "utilization_bands": utilization_bands,
        "average_utilization": average_utilization,
        "exhausted_count": exhausted, "exhausted_share": exhausted_share,
        "high_utilization_count": high,
        "underinsured_signal_count": high,                 # high/exhausted utilization => SI likely low
        "overinsured_signal_count": overinsured,
        "family_floater_available": family_floater_available,
        "missing_si": missing_si, "unlinked_claims": unlinked,
        "utilization_thresholds": {"exhausted": EXHAUSTED, "high": HIGH_UTIL, "overinsured_max": OVERINSURED_MAX},
    }
    return result(
        metric="si_utilization", value=value, numerator=len(with_si), denominator=(n or None),
        formula="utilization = member incurred / member sum_insured ; SI & utilization bands governed ; "
                "exhausted >= 100% ; high >= 75% ; overinsured signal <= 5%",
        source_tables=["member_master", "claim", "policy_master"], ctx=ctx, rows=members,
        excluded_rows=missing_si, caveats=caveats)
