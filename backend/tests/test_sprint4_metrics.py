import pytest
from app.core.security import Role
from app.services import onboarding_service as svc, canonical_loader, mapping as mp
from app.models.governance import UploadBatch, MetricConfig
from app.services.metrics.base import MetricContext, get_config
from app.services.metrics import (claims as m_claims, icr as m_icr, portfolio as m_portfolio,
                                   trends as m_trends, large_claims as m_large, dimensions as m_dim)

POLICY_H = ("Txt_Policy_Number,Txt_Master_Policy_Number,Txt_Insurer_Code,Txt_TPA_Code,"
            "Section/Product,Txt_Type_of_Policy,Date_Policy_Start,Date_Policy_End,Total Premium,policy year")
POLICY = (POLICY_H + "\n"
          + "POL-1,MPOL-1,150,15001,GMC,3,01-Apr-2025,31-Mar-2026,1000000,2025\n"
          + "POL-1,MPOL-1,150,15001,GMC,3,01-Apr-2026,31-Mar-2027,1200000,2026\n").encode()

MEMBER_H = ("Txt_Policy_Number,Txt_Member_Reference_Key,Employee_ID,Date_of_Birth,Num_Age_of_Insured,"
            "Txt_Gender,Num_Sum_Insured,Txt_Relationship_of_Insured,policy year,Coverage Start")
MEMBER = (MEMBER_H + "\n"
          + "POL-1,MRK-1,EMP1,12-May-1985,40,1,500000,1,2025,01-Apr-2025\n"
          + "POL-1,MRK-1,EMP1,12-May-1985,41,1,500000,1,2026,01-Apr-2026\n"
          + "POL-1,MRK-2,EMP1,01-Jan-1955,70,1,500000,3,2025,01-Apr-2025\n").encode()

CLAIMS_H = ("Txt_Policy_Number,Txt_Claim_Number,Txt_Member_Reference_Key,Txt_Diagnosis_Code_Level_I,"
            "Txt_Name_of_the_Hospital,Date_of_Admission,Date_of_Discharge,Num_Sum_Insured,"
            "Num_Total_Amount_Claimed,Num_Total_Claim_Paid,Num_Outstanding_Amount,"
            "Num_Room_Charges_Claimed,Txt_Claim_Status,Boo_hospital_is_network_Provider")
CLAIMS = (CLAIMS_H + "\n"
          + "POL-1,CLM-1,MRK-1,I20,Apollo,10-Jun-2025,12-Jun-2025,500000,150000,100000,20000,0,1,Y\n"
          + "POL-1,CLM-2,MRK-2,C50,Fortis,15-Jul-2025,20-Jul-2025,500000,350000,300000,0,0,1,Y\n"
          + "POL-1,CLM-3,MRK-1,I20,Apollo,10-Jun-2026,12-Jun-2026,500000,1300000,1200000,0,0,1,Y\n").encode()


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
    return b


def _seed_all(db, tenant):
    _seed(db, tenant, POLICY, "policy")
    _seed(db, tenant, MEMBER, "member")
    _seed(db, tenant, CLAIMS, "claims")


def _ctx(db, tenant, **f):
    return MetricContext(db, tenant, f)


# 1 incurred = paid + outstanding -------------------------------------------
def test_incurred_equals_paid_plus_outstanding(db):
    _seed_all(db, "s1")
    v = m_claims.claims_metrics(_ctx(db, "s1"))["value"]
    assert v["paid"] == 1600000 and v["outstanding"] == 20000
    assert v["incurred"] == v["paid"] + v["outstanding"] == 1620000


# 2,3,4 ICR formulas + 5 written basis + caveat -----------------------------
def test_icr_formulas_and_written_basis(db):
    _seed_all(db, "s2")
    r = m_icr.icr_metrics(_ctx(db, "s2"))
    v = r["value"]
    assert v["earned_premium"] == 2200000 and r["premium_basis"] == "written"
    assert v["operational_icr"] == round(1620000 / 2200000 * 100, 2)   # 73.64
    assert v["paid_icr"] == round(1600000 / 2200000 * 100, 2)
    assert v["outstanding_icr"] == round(20000 / 2200000 * 100, 2)
    assert any("written" in c.lower() for c in r["caveats"])            # no silent substitution


# 6,7,8 multi-year trends ----------------------------------------------------
def test_multi_year_trends(db):
    _seed_all(db, "s3")
    r = m_trends.trend_metrics(_ctx(db, "s3"))
    series = {s["policy_year"]: s for s in r["value"]["series"]}
    assert series[2025]["incurred"] == 420000 and series[2026]["incurred"] == 1200000
    assert series[2025]["premium"] == 1000000 and series[2026]["premium"] == 1200000
    assert series[2025]["operational_icr"] == 42.0 and series[2026]["operational_icr"] == 100.0
    yoy = {(x["from_year"], x["to_year"]): x for x in r["value"]["yoy"]}[(2025, 2026)]
    assert yoy["premium_pct"] == 20.0
    assert yoy["incurred_pct"] == round((1200000 - 420000) / 420000 * 100, 2)
    assert yoy["medical_inflation_proxy_pct"] == yoy["avg_claim_size_pct"]


# 9 dynamic year filters -----------------------------------------------------
def test_dynamic_year_filters(db):
    _seed_all(db, "s4")
    one = m_claims.claims_metrics(_ctx(db, "s4", policy_year=2025))["value"]
    assert one["claim_count"] == 2 and one["incurred"] == 420000
    rng = m_claims.claims_metrics(_ctx(db, "s4", year_range="2025-2026"))["value"]
    assert rng["claim_count"] == 3 and rng["incurred"] == 1620000


# 10 relation split ----------------------------------------------------------
def test_relation_split(db):
    _seed_all(db, "s5")
    r = m_dim.relation_metrics(_ctx(db, "s5"))
    groups = {g["key"]: g for g in r["value"]["groups"]}
    assert "Father" in groups and groups["Father"]["incurred"] == 300000
    assert r["value"]["parent_claim_share"] == round(300000 / 1620000, 4)


# 11 hospital split ----------------------------------------------------------
def test_hospital_split(db):
    _seed_all(db, "s6")
    top = m_dim.hospital_metrics(_ctx(db, "s6"))["value"]["top_hospitals"]
    assert top[0]["key"] == "Apollo" and top[0]["incurred"] == 1320000


# 12 ailment split -----------------------------------------------------------
def test_ailment_split(db):
    _seed_all(db, "s7")
    top = m_dim.ailment_metrics(_ctx(db, "s7"))["value"]["top_ailments"]
    a = {g["key"]: g for g in top}
    assert a["I20"]["incurred"] == 1320000 and a["I20"]["recurring_indicator"] is True


# 13,14 large-claim threshold config + flagged-not-removed --------------------
def test_large_claim_threshold_and_not_removed(db):
    _seed_all(db, "s8")
    r = m_large.large_claim_metrics(_ctx(db, "s8"))
    assert r["value"]["threshold"] == 1000000 and r["value"]["large_claim_count"] == 1
    assert r["value"]["large_claims"][0]["claim_number"] == "CLM-3"
    # still counted in ICR (not removed)
    assert m_icr.icr_metrics(_ctx(db, "s8"))["value"]["incurred"] == 1620000
    # tenant-config threshold override
    db.add(MetricConfig(tenant_id="s8", large_claim_threshold=2000000)); db.commit()
    r2 = m_large.large_claim_metrics(_ctx(db, "s8"))
    assert r2["value"]["threshold"] == 2000000 and r2["value"]["large_claim_count"] == 0


# 15 conditional caveat ------------------------------------------------------
COND = (CLAIMS_H + "\n"
        + "\n".join("POL-1,CLM-%d,,I20,Apollo,10-Jun-2025,12-Jun-2025,500000,,100000,,0,1,Y" % i
                    for i in range(1, 5)) + "\n").encode()


def test_conditional_caveat_propagation(db):
    _seed(db, "s9", COND, "claims")
    r = m_claims.claims_metrics(_ctx(db, "s9"))
    assert r["data_quality_status"] == "Conditional" and r["conditional"] is True


# 16 restricted propagation + advisory block ---------------------------------
CRIT = (CLAIMS_H + "\n"
        + "POL-1,CLM-OK,MRK-1,I20,Apollo,10-Jun-2025,12-Jun-2025,500000,200000,100000,0,0,1,Y\n"
        + "\n".join(",CLM-B%d,,,,,,,100,999,,,1,N" % i for i in range(1, 5)) + "\n").encode()


def test_restricted_propagation_blocks_advisory(db):
    _seed(db, "s10", CRIT, "claims", override=True)
    r = m_claims.claims_metrics(_ctx(db, "s10"))
    assert r["data_quality_status"] == "Restricted" and r["restricted"] is True
    assert r["advisory_blocked"] is True
    assert any("restricted" in c.lower() for c in r["caveats"])


# 17 tenant isolation --------------------------------------------------------
def test_tenant_isolation(db):
    _seed_all(db, "s11")
    other = m_claims.claims_metrics(_ctx(db, "other-tenant"))
    assert other["value"]["claim_count"] == 0 and other["data_quality_status"] == "No Data"


# 18 quarantined/critical rows excluded --------------------------------------
def test_quarantined_rows_excluded(db):
    _seed(db, "s12", CRIT, "claims", override=True)   # 4 critical rows quarantined, 1 clean loaded
    v = m_claims.claims_metrics(_ctx(db, "s12"))["value"]
    assert v["claim_count"] == 1     # only the clean row reached canonical


# 19 evidence reconciliation -------------------------------------------------
def test_evidence_reconciles(db):
    _seed_all(db, "s13")
    r = m_claims.claims_metrics(_ctx(db, "s13"))
    assert r["numerator"] == r["value"]["incurred"]
    assert r["value"]["incurred"] == r["value"]["paid"] + r["value"]["outstanding"]
    assert "claim" in r["source_tables"] and r["formula"]


# 20 missing dimension caveat ------------------------------------------------
NO_AILMENT = (CLAIMS_H + "\n"
              + "POL-1,CLM-1,MRK-1,,Apollo,10-Jun-2025,12-Jun-2025,500000,150000,100000,0,0,1,Y\n").encode()


def test_missing_dimension_caveat(db):
    _seed(db, "s14", NO_AILMENT, "claims")
    r = m_dim.ailment_metrics(_ctx(db, "s14"))
    assert r["value"]["top_ailments"] == [] and r["excluded_rows"] == 1
    assert any("ailment" in c.lower() for c in r["caveats"])
