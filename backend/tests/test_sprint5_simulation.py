import pytest
from app.core.security import Role
from app.services import onboarding_service as svc, canonical_loader, mapping as mp
from app.models.governance import UploadBatch
from app.services.simulation.base import SimContext
from app.services.simulation import (room_rent, copay, caps, corporate_buffer,
                                      scenario, adjusted_icr, balanced_benefit)

POLICY_H = ("Txt_Policy_Number,Txt_Master_Policy_Number,Txt_Insurer_Code,Txt_TPA_Code,Section/Product,"
            "Txt_Type_of_Policy,Date_Policy_Start,Date_Policy_End,Total Premium,"
            "Num_Corporate_Floater_Sum_Insured,policy year")
POLICY = (POLICY_H + "\n"
          + "POL-1,MPOL-1,150,15001,GMC,3,01-Apr-2025,31-Mar-2026,1000000,5000000,2025\n").encode()

MEMBER_H = ("Txt_Policy_Number,Txt_Member_Reference_Key,Employee_ID,Date_of_Birth,Num_Age_of_Insured,"
            "Txt_Gender,Num_Sum_Insured,Txt_Relationship_of_Insured,policy year")
MEMBER = (MEMBER_H + "\n"
          + "POL-1,MRK-1,EMP1,12-May-1985,40,1,500000,1,2025\n"
          + "POL-1,MRK-2,EMP1,01-Jan-1955,70,1,500000,3,2025\n").encode()

CLAIMS_H = ("Txt_Policy_Number,Txt_Claim_Number,Txt_Member_Reference_Key,Txt_Diagnosis_Code_Level_I,"
            "Txt_Name_of_the_Hospital,Date_of_Admission,Date_of_Discharge,Num_Sum_Insured,"
            "Num_Total_Amount_Claimed,Num_Total_Claim_Paid,Num_Outstanding_Amount,"
            "Num_Room_Charges_Claimed,Num_Nursing_Charges_claimed,Txt_Claim_Status")
CLAIMS = (CLAIMS_H + "\n"
          + "POL-1,CLM-1,MRK-1,I20,Apollo,10-Jun-2025,12-Jun-2025,500000,150000,100000,20000,40000,12000,1\n"
          + "POL-1,CLM-2,MRK-2,C50,Fortis,15-Jul-2025,18-Jul-2025,500000,80000,80000,0,3000,5000,1\n"
          + "POL-1,CLM-3,MRK-1,I21,Apollo,10-Aug-2025,20-Aug-2025,500000,1300000,1200000,0,0,0,1\n"
          + "POL-1,CLM-4,MRK-2,O80,Cloud,05-Sep-2025,07-Sep-2025,500000,60000,60000,0,2000,1000,1\n").encode()
# incurred: 120000 + 80000 + 1200000 + 60000 = 1,460,000 ; premium 1,000,000 -> op ICR 146.0


def _seed(db, tenant, data, kind, override=False):
    b = svc.register_upload(db, tenant=tenant, actor="rev", file_kind=kind, file_name="f.csv", data=data)
    m = svc.materialize(db, db.get(UploadBatch, b.id))
    fm = {s["source_header"]: s["suggested_canonical"]
          for s in mp.suggest_mapping(m["parsed"]["headers"], m["table"])["suggestions"]
          if s["suggested_canonical"]}
    svc.set_mapping(db, tenant=tenant, actor="rev", batch_id=b.id, field_map=fm)
    svc.run_validation(db, tenant=tenant, actor="rev", batch_id=b.id)
    svc.run_dq(db, tenant=tenant, actor="rev", batch_id=b.id)
    if override:
        svc.admin_override(db, tenant=tenant, actor="admin", role=Role.ADMIN, batch_id=b.id, reason="pilot")
    else:
        svc.approve(db, tenant=tenant, actor="rev", role=Role.REVIEWER, batch_id=b.id)
        svc.activate(db, tenant=tenant, actor="rev", batch_id=b.id)
    canonical_loader.load_canonical(db, tenant=tenant, actor="rev", batch_id=b.id)


def _seed_all(db, t):
    _seed(db, t, POLICY, "policy"); _seed(db, t, MEMBER, "member"); _seed(db, t, CLAIMS, "claims")


def _ctx(db, t, **f):
    return SimContext(db, t, f)


# 1-7 room rent chain + exclusion of non-eligible components -----------------
def test_room_rent_chain(db):
    _seed_all(db, "r1")
    r = room_rent.room_rent_simulation(_ctx(db, "r1"), room_rent_pct=0.01)
    v = r["value"]
    c1 = next(x for x in v["per_claim"] if x["claim_number"] == "CLM-1")
    assert c1["allowed_room_rent"] == 5000            # SI 500000 x 1%
    assert c1["actual_room_rent"] == 40000
    assert c1["room_rent_ratio"] == 0.125             # 5000/40000
    assert c1["proportionate_deduction_pct"] == 0.875  # 1 - 0.125
    assert c1["eligible_linked_bill"] == 40000        # room only; nursing 12000 EXCLUDED
    assert c1["claim_saving"] == 35000                # 40000 x 0.875
    assert v["portfolio_saving"] == 35000 and v["affected_claims"] == 1
    assert r["operational_icr"]["operational_icr"] == 146.0    # unchanged
    assert v["revised_icr"] == 142.5                  # (1,460,000-35,000)/1,000,000


# 8 proxy path when bill breakup missing -------------------------------------
def test_room_rent_proxy_path(db):
    _seed_all(db, "r2")
    r = room_rent.room_rent_simulation(_ctx(db, "r2"), room_rent_pct=0.01)
    assert r["value"]["proxy_claims"] == 1            # CLM-3 has no room breakup
    assert r["excluded_reasons"]["bill_breakup_missing_proxy"] == 1
    assert any("proxy" in c.lower() for c in r["caveats"])
    assert r["reliability"] in ("medium", "low")      # downgraded by proxy


# 9,10 co-pay + parent co-pay ------------------------------------------------
def test_copay_and_parent(db):
    _seed_all(db, "r3")
    r = copay.copay_simulation(_ctx(db, "r3"), copay_pct=0.10)
    assert r["value"]["employer_saving"] == 146000    # 10% of 1,460,000
    assert r["value"]["member_out_of_pocket"] == 146000
    p = copay.copay_simulation(_ctx(db, "r3"), copay_pct=0.20, parent_only=True)
    assert p["value"]["employer_saving"] == 28000     # 20% of (80000+60000) parent claims
    assert p["value"]["affected_claims"] == 2


# 11 disease cap -------------------------------------------------------------
def test_disease_cap(db):
    _seed_all(db, "r4")
    r = caps.cap_simulation(_ctx(db, "r4"), proposed_cap=500000)
    assert r["value"]["employer_saving"] == 700000    # CLM-3 1,200,000 - 500,000
    assert r["value"]["employee_gap_risk"] == 700000 and r["value"]["affected_claims"] == 1


# 12 maternity sub-limit -----------------------------------------------------
def test_maternity_sublimit(db):
    _seed_all(db, "r5")
    r = caps.cap_simulation(_ctx(db, "r5"), proposed_cap=50000, kind="maternity")
    assert r["value"]["claims_in_scope"] == 1 and r["value"]["employer_saving"] == 10000  # O80 60000-50000


# 13 corporate buffer --------------------------------------------------------
def test_corporate_buffer(db):
    _seed_all(db, "r6")
    r = corporate_buffer.corporate_buffer_simulation(_ctx(db, "r6"))
    assert r["value"]["corporate_buffer_available"] == 5000000
    assert r["value"]["estimated_buffer_draw"] == 700000    # CLM-3 1.2M over SI 0.5M
    assert r["value"]["utilization_pct"] == 14.0 and r["value"]["claims_exceeding_si"] == 1


# 14,15 adjusted ICR separate + operational unchanged ------------------------
def test_adjusted_icr_separate(db):
    _seed_all(db, "r7")
    r = adjusted_icr.adjusted_icr_simulation(_ctx(db, "r7"))
    v = r["value"]
    assert v["operational_icr"] == 146.0              # unchanged, large claim kept in
    assert v["operational_incurred"] == 1460000       # includes CLM-3
    assert v["adjusted_icr"] == 26.0                  # (1,460,000-1,200,000)/1,000,000
    assert len(v["one_off_claims"]) == 1
    assert "Defendable ICR" in v["adjusted_label"]
    assert any("not final actuarial truth" in c.lower() or "defendable" in c.lower() for c in r["caveats"])


# 16 balanced design scoring + classification --------------------------------
def test_balanced_design(db):
    _seed_all(db, "r8")
    r = balanced_benefit.balanced_benefit_design(_ctx(db, "r8"), room_rent_pct=0.01,
                                                 copay_pct=0.10, parent_copay_pct=0.20)
    levers = {l["lever"]: l for l in r["value"]["levers"]}
    valid = {"Preferred", "Good option", "Use carefully", "High employee impact",
             "Not recommended unless critical"}
    for l in r["value"]["levers"]:
        assert l["classification"] in valid
        assert set(("expected_saving", "icr_impact_revised", "employee_friction",
                    "implementation_feasibility", "renewal_defensibility", "data_reliability")) <= set(l)
    assert levers["copay"]["classification"] == "High employee impact"      # high friction + high saving
    assert levers["room_rent"]["employee_friction"] == "low"


# 17 restricted advisory block -----------------------------------------------
CRIT = (CLAIMS_H + "\n"
        + "POL-1,CLM-OK,MRK-1,I20,Apollo,10-Jun-2025,12-Jun-2025,500000,150000,100000,0,40000,0,1\n"
        + "\n".join(",CLM-B%d,,,,,,,100,999,,,,1" % i for i in range(1, 5)) + "\n").encode()


def test_restricted_blocks_advisory(db):
    _seed(db, "r9", CRIT, "claims", override=True)
    r = room_rent.room_rent_simulation(_ctx(db, "r9"))
    assert r["restricted"] is True and r["advisory_blocked"] is True
    assert any("restricted" in c.lower() for c in r["caveats"])


# 18 conditional caveat ------------------------------------------------------
COND = (CLAIMS_H + "\n"
        + "\n".join("POL-1,CLM-%d,,I20,Apollo,10-Jun-2025,12-Jun-2025,500000,,100000,,40000,0,1" % i
                    for i in range(1, 5)) + "\n").encode()


def test_conditional_caveat(db):
    _seed(db, "r10", COND, "claims")
    r = room_rent.room_rent_simulation(_ctx(db, "r10"))
    assert r["conditional"] is True and r["data_quality_status"] == "Conditional"


# 19 tenant isolation --------------------------------------------------------
def test_tenant_isolation(db):
    _seed_all(db, "r11")
    r = room_rent.room_rent_simulation(_ctx(db, "other"))
    assert r["value"]["portfolio_saving"] == 0 and r["data_quality_status"] == "No Data"


# 20 evidence reconciliation -------------------------------------------------
def test_evidence_reconciles(db):
    _seed_all(db, "r12")
    r = room_rent.room_rent_simulation(_ctx(db, "r12"), room_rent_pct=0.01)
    assert round(sum(x["claim_saving"] for x in r["value"]["per_claim"]), 2) == r["value"]["portfolio_saving"]
    assert r["formula"] and r["source_tables"] and "assumptions" in r


# 21 no computation path bypasses governed data ------------------------------
def test_no_bypass_governed_data(db):
    # 4 critical rows quarantined (never loaded), 1 clean -> sim sees only the clean claim
    _seed(db, "r13", CRIT, "claims", override=True)
    r = copay.copay_simulation(_ctx(db, "r13"), copay_pct=0.10)
    assert r["included_claims"] == 1                  # only the governed, loaded claim
