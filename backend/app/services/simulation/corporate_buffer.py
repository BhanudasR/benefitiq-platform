"""Corporate buffer / floater simulation (foundation). Estimates how much of the
corporate floater is drawn by claims that exceed the individual member Sum Insured."""
from __future__ import annotations

from .base import SimContext, sim_result, eligible_claim_amount
from ..profiling import parse_number


def corporate_buffer_simulation(sctx: SimContext) -> dict:
    rows = sctx.claims()
    pvs = sctx.mc.scoped_policy_versions()
    buffer_available = 0.0
    for p in pvs:
        struct = p.sum_insured_structure or {}
        cf = struct.get("corporate_floater_sum_insured")
        if cf is not None:
            buffer_available += float(cf)

    per_claim, buffer_draw, exceeding = [], 0.0, 0
    for c in rows:
        si = parse_number(c.sum_insured)
        elig = eligible_claim_amount(c)
        if si is not None and elig > si:
            over = elig - si
            buffer_draw += over
            exceeding += 1
            per_claim.append({"claim_number": c.claim_number, "sum_insured": si,
                              "incurred": round(elig, 2), "buffer_draw": round(over, 2)})
    util = round(buffer_draw / buffer_available * 100, 2) if buffer_available else None
    caveats = ["Foundation estimate: buffer draw = incurred above individual SI.",
               "Actual buffer rules depend on policy wording (per-family caps, ordering)."]
    if not buffer_available:
        caveats.append("No corporate floater found in policy data; utilization not computable.")
    value = {"corporate_buffer_available": round(buffer_available, 2),
             "estimated_buffer_draw": round(buffer_draw, 2), "utilization_pct": util,
             "claims_exceeding_si": exceeding, "per_claim": per_claim}
    return sim_result(
        simulation="corporate_buffer", formula="BufferDraw = Sum(Max(0, Incurred - Individual SI))",
        inputs={}, value=value, rows=rows,
        source_fields=["sum_insured", "policy_version.sum_insured_structure", "total_claim_paid", "outstanding_amount"],
        source_tables=["claim", "policy_version"], included_claims=exceeding,
        excluded_claims=len(rows) - exceeding, assumptions=["Buffer draws only above individual SI."],
        caveats=caveats, operational_icr=sctx.operational_icr(), ctx=sctx)
