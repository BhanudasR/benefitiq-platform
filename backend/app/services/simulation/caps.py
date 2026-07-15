"""Disease/procedure cap and maternity/sub-limit simulation (foundation).

Cap Saving = Sum of Max(0, Eligible Claim Amount - Proposed Cap) over affected claims.
Shows affected claims, employer saving and employee gap risk (amount above cap the
member bears). Maternity uses the maternity sub-limit scope (O-diagnosis / maternity
claim_type)."""
from __future__ import annotations

from .base import SimContext, get_sim_config, sim_result, eligible_claim_amount, resolve_lever


def cap_simulation(sctx: SimContext, *, proposed_cap=None, disease=None, kind="disease") -> dict:
    cfg = get_sim_config(sctx.db, sctx.tenant)
    term_type = "maternity_limit" if kind == "maternity" else "disease_cap"
    cfg_default = cfg["maternity_sublimit"] if kind == "maternity" else cfg["disease_cap"]
    res = resolve_lever(sctx, request_value=proposed_cap, term_type=term_type, config_value=cfg_default)
    if res["value"] is None:
        raise ValueError("a proposed cap (or confirmed term / configured default) is required")
    cap = float(res["value"])
    rows = sctx.claims()

    def in_scope(c):
        if kind == "maternity":
            dx = (c.diagnosis_code_l1 or "").upper()
            ct = (c.claim_type or "").lower()
            return dx.startswith("O") or "matern" in ct
        if disease:
            return c.diagnosis_code_l1 == disease
        return True

    per_claim, employer_saving, employee_gap, included, scoped = [], 0.0, 0.0, 0, 0
    for c in rows:
        if not in_scope(c):
            continue
        scoped += 1
        elig = eligible_claim_amount(c)
        over = max(0.0, elig - cap)
        if over <= 0:
            continue
        employer_saving += over
        employee_gap += over
        included += 1
        per_claim.append({"claim_number": c.claim_number, "policy_year": c.policy_year,
                          "eligible_claim_amount": round(elig, 2), "cap": cap,
                          "employer_saving": round(over, 2), "employee_gap": round(over, 2)})

    op = sctx.operational_icr()
    prem = op["premium"]
    revised_icr = round((op["incurred"] - employer_saving) / prem * 100, 2) if prem else None
    name = "maternity_sublimit" if kind == "maternity" else "disease_cap"
    caveats = ["Amounts above the cap become employee gap risk (out-of-pocket).",
               "Foundation simulation — subject to policy wording on the specific benefit."]
    if kind == "maternity" and scoped == 0:
        caveats.append("No maternity-identified claims in scope (diagnosis/claim_type); result is empty.")
    if res["caveat"]:
        caveats.append(res["caveat"])
    value = {"proposed_cap": cap, "term_basis": res["term_basis"], "term_id": res["term_id"], "scope": (disease or kind), "employer_saving": round(employer_saving, 2),
             "employee_gap_risk": round(employee_gap, 2), "affected_claims": included,
             "claims_in_scope": scoped, "revised_icr": revised_icr, "per_claim": per_claim}
    return sim_result(
        simulation=name, formula="CapSaving = Sum(Max(0, EligibleClaimAmount - Cap))",
        inputs={"proposed_cap": cap, "disease": disease, "kind": kind}, value=value, rows=rows,
        source_fields=["total_claim_paid", "outstanding_amount", "diagnosis_code_l1", "claim_type"],
        source_tables=["claim"], included_claims=included, excluded_claims=len(rows) - scoped,
        excluded_reasons={"out_of_scope": len(rows) - scoped},
        assumptions=["Eligible claim amount = incurred (paid + outstanding)."],
        caveats=caveats, operational_icr=op, ctx=sctx)
