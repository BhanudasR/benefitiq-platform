"""Balanced Benefit Design — backend scoring only. Scores each candidate lever on
six dimensions (expected saving, ICR impact, employee friction, implementation
feasibility, renewal defensibility, data reliability) and classifies it. This is a
logic layer, not a separate module, and produces NO client-facing recommendation
here — only governed scores + a classification."""
from __future__ import annotations

from .base import SimContext, sim_result
from .room_rent import room_rent_simulation
from .copay import copay_simulation
from .caps import cap_simulation

# Static lever knowledge (friction/feasibility/defensibility are ordinal high/med/low).
_KB = {
    "room_rent":   {"friction": "low",    "feasibility": "high",   "defensibility": "high"},
    "copay":       {"friction": "high",   "feasibility": "high",   "defensibility": "medium"},
    "parent_copay":{"friction": "medium", "feasibility": "high",   "defensibility": "high"},
    "disease_cap": {"friction": "medium", "feasibility": "medium", "defensibility": "medium"},
    "maternity_sublimit": {"friction": "high", "feasibility": "medium", "defensibility": "medium"},
}
_ORD = {"low": 1, "medium": 2, "high": 3}


def _saving_band(frac):
    return "high" if frac >= 0.05 else "medium" if frac >= 0.01 else "low"


def _classify(saving_band, friction, defensibility, reliability):
    if reliability in ("none", "low"):
        return "Use carefully"
    fr, sv = _ORD[friction], _ORD[saving_band]
    if fr == 3 and sv <= 1:
        return "Not recommended unless critical"
    if fr == 3 and sv >= 2:
        return "High employee impact"
    if sv == 3 and fr == 1 and _ORD[defensibility] >= 2:
        return "Preferred"
    if sv >= 2 and fr <= 2:
        return "Good option"
    return "Use carefully"


def balanced_benefit_design(sctx: SimContext, *, room_rent_pct=None, copay_pct=None,
                            parent_copay_pct=None, disease_cap=None) -> dict:
    op = sctx.operational_icr()
    incurred = op["incurred"] or 0.0
    prem = op["premium"]

    def band_icr(saving):
        return round((op["incurred"] - saving) / prem * 100, 2) if prem else None

    sims = {"room_rent": room_rent_simulation(sctx, room_rent_pct=room_rent_pct),
            "copay": copay_simulation(sctx, copay_pct=copay_pct),
            "parent_copay": copay_simulation(sctx, copay_pct=parent_copay_pct, parent_only=True)}
    if disease_cap is not None:
        sims["disease_cap"] = cap_simulation(sctx, proposed_cap=disease_cap)

    def saving_of(name, r):
        v = r["value"]
        return v.get("portfolio_saving", v.get("employer_saving", 0.0))

    reliability = sims["room_rent"]["reliability"]
    levers = []
    for name, r in sims.items():
        saving = saving_of(name, r)
        frac = (saving / incurred) if incurred else 0.0
        sband = _saving_band(frac)
        kb = _KB.get(name, {"friction": "medium", "feasibility": "medium", "defensibility": "medium"})
        rel = r["reliability"]
        classification = _classify(sband, kb["friction"], kb["defensibility"], rel)
        levers.append({
            "lever": name,
            "expected_saving": round(saving, 2), "expected_saving_band": sband,
            "icr_impact_revised": band_icr(saving),
            "employee_friction": kb["friction"], "implementation_feasibility": kb["feasibility"],
            "renewal_defensibility": kb["defensibility"], "data_reliability": rel,
            "classification": classification,
        })
    levers.sort(key=lambda x: x["expected_saving"], reverse=True)

    rows = sctx.claims()
    return sim_result(
        simulation="balanced_benefit_design",
        formula="score each lever on {saving, ICR impact, friction, feasibility, defensibility, reliability} -> classify",
        inputs={"room_rent_pct": room_rent_pct, "copay_pct": copay_pct,
                "parent_copay_pct": parent_copay_pct, "disease_cap": disease_cap},
        value={"levers": levers}, rows=rows,
        source_fields=["claim", "claim_bill_component", "member_master", "policy_version"],
        source_tables=["claim", "claim_bill_component", "member_master", "policy_version"],
        included_claims=len(rows),
        assumptions=["Saving bands: >=5% high, >=1% medium, else low of incurred.",
                     "Friction/feasibility/defensibility from governed lever knowledge base."],
        caveats=["Backend scoring only — not a client-facing recommendation.",
                 "Classification blends saving, employee friction, defensibility and data reliability."],
        operational_icr=op, ctx=sctx)
