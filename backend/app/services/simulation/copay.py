"""Co-pay and parent co-pay simulation.

Co-pay Saving = Eligible Claim Amount x Proposed Co-pay %  (eligible = incurred).
Employer saving shifts to the member as out-of-pocket (member impact shown clearly).
Parent co-pay applies only to claims linked to a parent member (Father/Mother)."""
from __future__ import annotations

from .base import SimContext, get_sim_config, sim_result, eligible_claim_amount


def copay_simulation(sctx: SimContext, *, copay_pct=None, parent_only=False) -> dict:
    key = "parent_copay_pct" if parent_only else "copay_pct"
    cfg = get_sim_config(sctx.db, sctx.tenant, {key: copay_pct})
    pct = cfg[key]
    rows = sctx.claims()
    relmap = sctx.relation_map() if parent_only else {}

    per_claim, employer_saving, member_oop, included = [], 0.0, 0.0, 0
    excl = {"not_parent_claim": 0, "unlinked_relation": 0}
    for c in rows:
        if parent_only:
            rel = relmap.get((c.member_reference_key, c.policy_year)) or relmap.get(c.member_reference_key)
            if rel is None:
                excl["unlinked_relation"] += 1
                continue
            if rel not in ("Father", "Mother"):
                excl["not_parent_claim"] += 1
                continue
        elig = eligible_claim_amount(c)
        saving = round(elig * pct, 2)
        employer_saving += saving
        member_oop += saving
        included += 1
        per_claim.append({"claim_number": c.claim_number, "policy_year": c.policy_year,
                          "eligible_claim_amount": round(elig, 2), "copay_saving": saving})

    op = sctx.operational_icr()
    prem = op["premium"]
    revised_icr = round((op["incurred"] - employer_saving) / prem * 100, 2) if prem else None
    name = "parent_copay" if parent_only else "copay"
    caveats = ["Co-pay shifts cost from employer to member; member out-of-pocket equals employer saving.",
               "Illustrative what-if — not a change to actual claim settlement."]
    if parent_only:
        caveats.append("Parent co-pay applies only to claims linked to a parent (Father/Mother) member.")
    value = {"proposed_copay_pct": pct, "pct_source": cfg["source"],
             "employer_saving": round(employer_saving, 2),
             "member_out_of_pocket": round(member_oop, 2),
             "revised_icr": revised_icr, "affected_claims": included, "per_claim": per_claim}
    return sim_result(
        simulation=name, formula="CopaySaving = EligibleClaimAmount x copay_pct (member bears the co-pay)",
        inputs={key: pct, "parent_only": parent_only}, value=value, rows=rows,
        source_fields=["total_claim_paid", "outstanding_amount", "member_reference_key"]
        + (["member_master.relationship"] if parent_only else []),
        source_tables=["claim"] + (["member_master"] if parent_only else []),
        included_claims=included, excluded_claims=sum(excl.values()), excluded_reasons=excl,
        assumptions=["Eligible claim amount = incurred (paid + outstanding)."],
        caveats=caveats, operational_icr=op, ctx=sctx)
