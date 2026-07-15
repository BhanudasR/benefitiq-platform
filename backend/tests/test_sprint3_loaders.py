import pytest
from app.core.security import Role
from app.services import onboarding_service as svc, canonical_loader
from app.services import mapping as mp
from app.models.governance import UploadBatch, AuditLog
from app.models.canonical import (PolicyVersion, PolicyMaster, MemberMaster,
                                   MemberCoverage, Claim, ClaimBillComponent)

POLICY_H = ("Txt_Policy_Number,Txt_Master_Policy_Number,Txt_Insurer_Code,Txt_TPA_Code,"
            "Section/Product,Txt_Type_of_Policy,Date_Policy_Start,Date_Policy_End,"
            "Total Premium,policy year")
POLICY_3YR = (POLICY_H + "\n"
              + "POL-1,MPOL-1,150,15001,GMC,3,01-Apr-2024,31-Mar-2025,9000000,2024\n"
              + "POL-1,MPOL-1,150,15001,GMC,3,01-Apr-2025,31-Mar-2026,10000000,2025\n"
              + "POL-1,MPOL-1,150,15001,GMC,3,01-Apr-2026,31-Mar-2027,11000000,2026\n").encode()
POLICY_2YR = (POLICY_H + "\n"
              + "POL-1,MPOL-1,150,15001,GMC,3,01-Apr-2025,31-Mar-2026,10000000,2025\n"
              + "POL-1,MPOL-1,150,15001,GMC,3,01-Apr-2026,31-Mar-2027,11000000,2026\n").encode()

MEMBER_H = ("Txt_Policy_Number,Txt_Member_Reference_Key,Employee_ID,Date_of_Birth,"
            "Num_Age_of_Insured,Txt_Gender,Num_Sum_Insured,Txt_Relationship_of_Insured,"
            "policy year,Coverage Start")
MEMBER_2YR = (MEMBER_H + "\n"
              + "POL-1,MRK-1,EMP1,12-May-1985,40,1,500000,1,2025,01-Apr-2025\n"
              + "POL-1,MRK-1,EMP1,12-May-1985,41,1,500000,1,2026,01-Apr-2026\n").encode()

CLAIMS_H = ("Txt_Policy_Number,Txt_Claim_Number,Txt_Member_Reference_Key,Txt_Diagnosis_Code_Level_I,"
            "Txt_Name_of_the_Hospital,Date_of_Admission,Date_of_Discharge,Num_Sum_Insured,"
            "Num_Total_Amount_Claimed,Num_Total_Claim_Paid,Num_Room_Charges_Claimed,"
            "Num_Nursing_Charges_claimed,Num_Percentage_of_copayment,Txt_Claim_Status,"
            "Boo_hospital_is_network_Provider")
CLAIMS_2YR = (CLAIMS_H + "\n"
              + "POL-1,CLM-1,MRK-1,I20,Hosp,10-Jun-2025,12-Jun-2025,500000,200000,100000,40000,,0,1,Y\n"
              + "POL-1,CLM-2,MRK-1,I20,Hosp,10-Jun-2026,12-Jun-2026,500000,200000,100000,40000,,0,1,Y\n").encode()
# no policy loaded / no year -> unresolved
CLAIMS_UNRESOLVED = (CLAIMS_H + "\n"
                     + "POL-9,CLM-9,MRK-9,I20,Hosp,10-Jun-2020,12-Jun-2020,500000,200000,100000,0,,0,1,Y\n").encode()


def _to_active(db, tenant, data, kind, actor="rev", override=False):
    b = svc.register_upload(db, tenant=tenant, actor=actor, file_kind=kind, file_name="f.csv", data=data)
    m = svc.materialize(db, db.get(UploadBatch, b.id))
    fm = {s["source_header"]: s["suggested_canonical"]
          for s in mp.suggest_mapping(m["parsed"]["headers"], m["table"])["suggestions"]
          if s["suggested_canonical"]}
    svc.set_mapping(db, tenant=tenant, actor=actor, batch_id=b.id, field_map=fm)
    svc.run_validation(db, tenant=tenant, actor=actor, batch_id=b.id)
    dq = svc.run_dq(db, tenant=tenant, actor=actor, batch_id=b.id)["dq"]
    if override:
        svc.admin_override(db, tenant=tenant, actor="admin", role=Role.ADMIN, batch_id=b.id, reason="pilot")
    else:
        svc.approve(db, tenant=tenant, actor=actor, role=Role.REVIEWER, batch_id=b.id)
        svc.activate(db, tenant=tenant, actor=actor, batch_id=b.id)
    return b, dq


def _load(db, tenant, batch, actor="rev", file_default_year=None):
    return canonical_loader.load_canonical(db, tenant=tenant, actor=actor,
                                           batch_id=batch.id, file_default_year=file_default_year)


# --- policy loader + 3-year -------------------------------------------------
def test_policy_loader_3_year_creates_3_policy_versions(db):
    b, _ = _to_active(db, "p3", POLICY_3YR, "policy")
    out = _load(db, "p3", b)
    assert out["loaded"] == 3
    pvs = db.query(PolicyVersion).filter(PolicyVersion.tenant_id == "p3",
                                         PolicyVersion.policy_number == "POL-1").all()
    assert {p.policy_year for p in pvs} == {2024, 2025, 2026}
    assert sorted(out["policy_years_detected"]) == [2024, 2025, 2026]
    assert db.query(PolicyMaster).filter(PolicyMaster.tenant_id == "p3").count() == 3


# --- member loader year-wise coverage --------------------------------------
def test_member_loader_preserves_year_wise_coverage(db):
    _to_active(db, "m2", POLICY_2YR, "policy")  # so periods exist (not required but realistic)
    pb, _ = _to_active(db, "m2", POLICY_2YR, "policy")
    _load(db, "m2", pb)
    b, _ = _to_active(db, "m2", MEMBER_2YR, "member")
    out = _load(db, "m2", b)
    assert out["loaded"] == 2
    covs = db.query(MemberCoverage).filter(MemberCoverage.tenant_id == "m2",
                                           MemberCoverage.member_reference_key == "MRK-1").all()
    assert {c.policy_year for c in covs} == {2025, 2026}          # both years preserved, not overwritten
    assert db.query(MemberMaster).filter(MemberMaster.member_reference_key == "MRK-1",
                                         MemberMaster.tenant_id == "m2").count() == 2


# --- claims linkage does not cross years -----------------------------------
def test_claims_link_to_correct_policy_year(db):
    pb, _ = _to_active(db, "c2", POLICY_2YR, "policy")
    _load(db, "c2", pb)
    b, _ = _to_active(db, "c2", CLAIMS_2YR, "claims")
    out = _load(db, "c2", b)
    assert out["loaded"] == 2 and out["unresolved_policy_year_rows"] == 0
    c1 = db.query(Claim).filter(Claim.tenant_id == "c2", Claim.claim_number == "CLM-1").one()
    c2 = db.query(Claim).filter(Claim.tenant_id == "c2", Claim.claim_number == "CLM-2").one()
    assert c1.policy_year == 2025 and c2.policy_year == 2026        # no cross-year mixing
    assert c1.linkage_status == "resolved" and c2.linkage_status == "resolved"
    # bill components loaded, breakup flag set
    assert out["bill_components_loaded"] >= 2
    assert c1.bill_breakup_available is True


# --- unresolved policy year -> caveat, not silent assignment -----------------
def test_unresolved_policy_year_marked_not_assigned(db):
    b, _ = _to_active(db, "cu", CLAIMS_UNRESOLVED, "claims")
    out = _load(db, "cu", b)
    assert out["loaded"] == 1 and out["unresolved_policy_year_rows"] == 1
    c = db.query(Claim).filter(Claim.tenant_id == "cu", Claim.claim_number == "CLM-9").one()
    assert c.policy_year is None and c.linkage_status == "unresolved"


# --- critical excluded + idempotent + lineage + audit -----------------------
def test_critical_excluded_idempotent_lineage_audit(db):
    b, _ = _to_active(db, "cx", CLAIMS_2YR, "claims")
    out = _load(db, "cx", b)
    assert out["rows_excluded_quarantined"] == 0 and out["loaded"] == 2
    # lineage present on every row
    for c in db.query(Claim).filter(Claim.tenant_id == "cx").all():
        assert c.dataset_version_id and c.upload_batch_id and c.raw_file_id and c.raw_row_index is not None
    # idempotent reload
    out2 = _load(db, "cx", b)
    assert out2["loaded"] == 0 and out2["skipped_duplicate"] == 2
    # audit LOAD written
    assert db.query(AuditLog).filter(AuditLog.tenant_id == "cx", AuditLog.action == "LOAD").count() >= 2


# --- conditional caveat propagation ----------------------------------------
CONDITIONAL_CLAIMS = (CLAIMS_H + "\n"
    + "\n".join("POL-1,CLM-%d,,I20,Hosp,05-Apr-2026,09-Apr-2026,500000,,100000,,,0,1,Y" % i
                for i in range(1, 5)) + "\n").encode()


def test_conditional_dataset_propagates_caveat(db):
    b, dq = _to_active(db, "cond", CONDITIONAL_CLAIMS, "claims")
    assert 70 <= dq["overall_score"] < 85
    out = _load(db, "cond", b)
    assert out["data_quality_caveat"] is True and out["caveat_rows"] == out["loaded"]
    assert all(c.data_quality_caveat is True for c in
               db.query(Claim).filter(Claim.tenant_id == "cond").all())


# --- restricted propagation via override -----------------------------------
CRITICAL_CLAIMS = (CLAIMS_H + "\n"
    + "POL-1,CLM-OK,MRK-1,I20,Hosp,05-Apr-2026,09-Apr-2026,500000,200000,100000,40000,,0,1,Y\n"
    + "\n".join(",CLM-B%d,,,,,,,100,999,,,,1,N" % i for i in range(1, 5)) + "\n").encode()


def test_restricted_dataset_propagates_restricted(db):
    b, dq = _to_active(db, "res", CRITICAL_CLAIMS, "claims", override=True)
    assert dq["overall_score"] < 70
    out = _load(db, "res", b)
    assert out["restricted"] is True and out["rows_excluded_quarantined"] == 4 and out["loaded"] == 1
    c = db.query(Claim).filter(Claim.tenant_id == "res").one()
    assert c.restricted is True and c.data_quality_caveat is True


# --- tenant isolation on load ----------------------------------------------
def test_loader_tenant_isolation(db):
    b, _ = _to_active(db, "ta", CLAIMS_2YR, "claims")
    with pytest.raises(LookupError):
        canonical_loader.load_canonical(db, tenant="tb", actor="x", batch_id=b.id)
