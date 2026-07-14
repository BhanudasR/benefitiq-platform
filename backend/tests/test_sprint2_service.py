import json
import pytest
from app.core.security import Role
from app.services import onboarding_service as svc, canonical_loader, gate
from app.services.storage import get_store
from app.models.governance import (RawFile, UploadBatch, DatasetVersion, MappingProfile,
                                    ValidationIssue, DQResult, CorrectionOverlay,
                                    ReviewItem, OverrideRecord, AuditLog)
from app.models.canonical import Claim, ClaimBillComponent
from tests._fixtures import read_bytes, CLAIMS

H = ("Txt_Policy_Number,Txt_Claim_Number,Txt_Member_Reference_Key,Txt_Diagnosis_Code_Level_I,"
     "Txt_Name_of_the_Hospital,Date_of_Admission,Date_of_Discharge,Num_Sum_Insured,"
     "Num_Total_Amount_Claimed,Num_Total_Claim_Paid,Num_Room_Charges_Claimed,"
     "Num_Nursing_Charges_claimed,Num_Percentage_of_copayment,Txt_Claim_Status,"
     "Boo_hospital_is_network_Provider")


def _csv(rows):
    return (H + "\n" + "\n".join(rows) + "\n").encode()


CONDITIONAL = _csv([  # member_ref + total_amount_claimed blank on all -> ~Conditional, no quarantine
    "POL-1,CLM-1,,I20,Hosp,05-Apr-2026,09-Apr-2026,500000,,100000,,,0,1,Y",
    "POL-1,CLM-2,,I20,Hosp,05-Apr-2026,09-Apr-2026,500000,,100000,,,0,1,Y",
    "POL-1,CLM-3,,I20,Hosp,05-Apr-2026,09-Apr-2026,500000,,100000,,,0,1,Y",
    "POL-1,CLM-4,,I20,Hosp,05-Apr-2026,09-Apr-2026,500000,,100000,,,0,1,Y",
])

CRITICAL = _csv([  # 1 clean + 4 broken (paid>claimed, blanks) -> DQ < 70, 4 quarantined
    "POL-1,CLM-OK,MRK-1,I20,Hosp,05-Apr-2026,09-Apr-2026,500000,200000,100000,40000,,0,1,Y",
    ",CLM-B1,,,,,,,100,999,,,,1,N",
    ",CLM-B2,,,,,,,100,999,,,,1,N",
    ",CLM-B3,,,,,,,100,999,,,,1,N",
    ",CLM-B4,,,,,,,100,999,,,,1,N",
])

# 2-row set whose ONLY defect is a missing critical policy_number on row 2 (fixable)
FIXABLE = _csv([
    "POL-1,CLM-OK,MRK-1,I20,Hosp,05-Apr-2026,09-Apr-2026,500000,200000,100000,0,,0,1,Y",
    ",CLM-X,MRK-2,I20,Hosp,05-Apr-2026,09-Apr-2026,500000,200000,100000,0,,0,1,Y",
])


def _upload(db, tenant, data, actor="analyst1", kind="claims"):
    return svc.register_upload(db, tenant=tenant, actor=actor, file_kind=kind,
                               file_name="c.csv", data=data)


def _map(db, tenant, batch_id, actor="rev1", save=False):
    # confirm full auto-mapping
    from app.services import tabular, mapping as mp
    m = svc.materialize(db, db.get(UploadBatch, batch_id))
    fm = {s["source_header"]: s["suggested_canonical"]
          for s in mp.suggest_mapping(m["parsed"]["headers"], m["table"])["suggestions"]
          if s["suggested_canonical"]}
    return svc.set_mapping(db, tenant=tenant, actor=actor, batch_id=batch_id,
                           field_map=fm, save_profile=save, profile_name="tpa-x")


# 1 -------------------------------------------------------------------------
def test_batch_lifecycle_persistence(db):
    b = _upload(db, "t1", read_bytes(CLAIMS))
    assert db.get(RawFile, b.raw_file_id) is not None
    assert db.get(UploadBatch, b.id).status == "UPLOADED"
    _map(db, "t1", b.id)
    assert db.get(UploadBatch, b.id).status == "MAPPED"
    svc.run_validation(db, tenant="t1", actor="a", batch_id=b.id)
    svc.run_dq(db, tenant="t1", actor="a", batch_id=b.id)
    assert db.get(UploadBatch, b.id).status == "DQ_SCORED"


# 2 -------------------------------------------------------------------------
def test_mapping_profile_persisted(db):
    b = _upload(db, "t2", read_bytes(CLAIMS))
    _map(db, "t2", b.id, save=True)
    prof = db.query(MappingProfile).filter(MappingProfile.tenant_id == "t2").all()
    assert len(prof) == 1 and prof[0].field_map


# 3, 4 ----------------------------------------------------------------------
def test_validation_and_dq_persisted(db):
    b = _upload(db, "t3", read_bytes(CLAIMS)); _map(db, "t3", b.id)
    svc.run_validation(db, tenant="t3", actor="a", batch_id=b.id)
    assert db.query(ValidationIssue).filter(ValidationIssue.upload_batch_id == b.id).count() >= 1
    assert db.query(ReviewItem).filter(ReviewItem.upload_batch_id == b.id).count() == 4
    svc.run_dq(db, tenant="t3", actor="a", batch_id=b.id)
    dq = db.query(DQResult).filter(DQResult.upload_batch_id == b.id).first()
    assert dq is not None and float(dq.overall_score) >= 85
    v = svc._latest_version(db, b.id)
    assert v.dq_score is not None and v.dq_result_id == dq.id


# 5 -------------------------------------------------------------------------
def test_correction_is_overlay_raw_unchanged(db):
    b = _upload(db, "t5", FIXABLE); _map(db, "t5", b.id)
    raw = db.get(RawFile, b.raw_file_id)
    before = get_store().get(raw.storage_key)
    before_sha = raw.sha256
    svc.add_correction(db, tenant="t5", actor="rev1", batch_id=b.id,
                       raw_row_index=2, field="policy_number", corrected_value="POL-9")
    ov = db.query(CorrectionOverlay).filter(CorrectionOverlay.upload_batch_id == b.id).one()
    assert ov.corrected_value == "POL-9" and ov.corrected_by == "rev1"
    # raw bytes + hash unchanged
    after = get_store().get(raw.storage_key)
    assert after == before and db.get(RawFile, b.raw_file_id).sha256 == before_sha
    # materialized row reflects the overlay
    m = svc.materialize(db, db.get(UploadBatch, b.id))
    row2 = next(r for r in m["mapped"] if r["__raw_row_index"] == 2)
    assert row2["policy_number"] == "POL-9"


# 6 -------------------------------------------------------------------------
def test_revalidation_recomputes(db):
    b = _upload(db, "t6", FIXABLE); _map(db, "t6", b.id)
    v1 = svc.run_validation(db, tenant="t6", actor="a", batch_id=b.id)
    assert v1["quarantined_rows"] == 1
    # correcting the single missing critical field clears the quarantine
    svc.add_correction(db, tenant="t6", actor="r", batch_id=b.id, raw_row_index=2,
                       field="policy_number", corrected_value="POL-9")
    out = svc.revalidate(db, tenant="t6", actor="a", batch_id=b.id)
    assert out["validation"]["quarantined_rows"] == 0
    assert db.get(UploadBatch, b.id).status == "REVALIDATED"


# 8, 16, 17 -----------------------------------------------------------------
def test_analytics_ready_activate_and_load(db):
    b = _upload(db, "t8", read_bytes(CLAIMS)); _map(db, "t8", b.id)
    svc.run_validation(db, tenant="t8", actor="a", batch_id=b.id)
    r = svc.run_dq(db, tenant="t8", actor="a", batch_id=b.id)
    assert r["dq"]["readiness"] == "Analytics Ready"
    svc.approve(db, tenant="t8", actor="rev", role=Role.REVIEWER, batch_id=b.id)
    v = svc.activate(db, tenant="t8", actor="rev", batch_id=b.id)
    assert v.readiness_status == gate.ANALYTICS_READY and v.restricted is False
    s1 = canonical_loader.load_canonical(db, tenant="t8", actor="rev", batch_id=b.id)
    assert s1["claims_loaded"] == 4 and s1["rows_excluded_quarantined"] == 0
    claims = db.query(Claim).filter(Claim.dataset_version_id == v.id).all()
    assert all(c.data_quality_caveat is False and c.restricted is False for c in claims)
    # idempotency: re-load adds nothing
    s2 = canonical_loader.load_canonical(db, tenant="t8", actor="rev", batch_id=b.id)
    assert s2["claims_loaded"] == 0 and s2["claims_skipped_duplicate"] == 4


# 9 -------------------------------------------------------------------------
def test_conditional_band_activates_conditional(db):
    b = _upload(db, "t9", CONDITIONAL); _map(db, "t9", b.id)
    svc.run_validation(db, tenant="t9", actor="a", batch_id=b.id)
    r = svc.run_dq(db, tenant="t9", actor="a", batch_id=b.id)
    assert 70 <= r["dq"]["overall_score"] < 85
    assert r["dq"]["readiness"] == "Conditional"
    svc.approve(db, tenant="t9", actor="rev", role=Role.REVIEWER, batch_id=b.id)
    v = svc.activate(db, tenant="t9", actor="rev", batch_id=b.id)
    assert v.readiness_status == gate.CONDITIONAL and v.restricted is False


# 7, 10, 11, 17 -------------------------------------------------------------
def test_below_threshold_blocked_then_override_restricted(db):
    b = _upload(db, "t10", CRITICAL); _map(db, "t10", b.id)
    svc.run_validation(db, tenant="t10", actor="a", batch_id=b.id)
    r = svc.run_dq(db, tenant="t10", actor="a", batch_id=b.id)
    assert r["dq"]["overall_score"] < 70
    # normal approval blocked
    with pytest.raises(svc.GateError):
        svc.approve(db, tenant="t10", actor="rev", role=Role.REVIEWER, batch_id=b.id)
    # admin override -> Restricted
    ov = svc.admin_override(db, tenant="t10", actor="admin1", role=Role.ADMIN,
                            batch_id=b.id, reason="pilot go-live, will fix next cycle")
    assert ov["readiness_status"] == gate.RESTRICTED and ov["impacted_modules"]
    v = svc._latest_version(db, b.id)
    assert v.restricted is True and v.status == "ACTIVE"
    # load excludes the critical row; loaded rows carry caveat + restricted
    s = canonical_loader.load_canonical(db, tenant="t10", actor="admin1", batch_id=b.id)
    assert s["rows_excluded_quarantined"] == 4 and s["claims_loaded"] == 1
    c = db.query(Claim).filter(Claim.dataset_version_id == v.id).one()
    assert c.data_quality_caveat is True and c.restricted is True
    assert db.query(OverrideRecord).filter(OverrideRecord.dataset_version_id == v.id).count() == 1


# 12 ------------------------------------------------------------------------
def test_non_admin_override_rejected(db):
    b = _upload(db, "t12", CRITICAL); _map(db, "t12", b.id)
    svc.run_validation(db, tenant="t12", actor="a", batch_id=b.id)
    svc.run_dq(db, tenant="t12", actor="a", batch_id=b.id)
    with pytest.raises(PermissionError):
        svc.admin_override(db, tenant="t12", actor="rev", role=Role.REVIEWER,
                           batch_id=b.id, reason="x")


# 13 ------------------------------------------------------------------------
def test_override_reason_mandatory(db):
    b = _upload(db, "t13", CRITICAL); _map(db, "t13", b.id)
    svc.run_validation(db, tenant="t13", actor="a", batch_id=b.id)
    svc.run_dq(db, tenant="t13", actor="a", batch_id=b.id)
    with pytest.raises(ValueError):
        svc.admin_override(db, tenant="t13", actor="admin1", role=Role.ADMIN,
                           batch_id=b.id, reason="   ")


# 14 ------------------------------------------------------------------------
def test_audit_row_per_transition(db):
    b = _upload(db, "t14", read_bytes(CLAIMS)); _map(db, "t14", b.id)
    svc.run_validation(db, tenant="t14", actor="a", batch_id=b.id)
    svc.run_dq(db, tenant="t14", actor="a", batch_id=b.id)
    svc.approve(db, tenant="t14", actor="rev", role=Role.REVIEWER, batch_id=b.id)
    svc.activate(db, tenant="t14", actor="rev", batch_id=b.id)
    canonical_loader.load_canonical(db, tenant="t14", actor="rev", batch_id=b.id)
    actions = {a.action for a in db.query(AuditLog).filter(AuditLog.tenant_id == "t14").all()}
    assert {"UPLOAD", "MAP", "VALIDATE", "DQ", "APPROVE", "ACTIVATE", "LOAD"} <= actions


# 15 ------------------------------------------------------------------------
def test_tenant_isolation(db):
    b = _upload(db, "tenantA", read_bytes(CLAIMS))
    with pytest.raises(LookupError):
        svc._get_batch(db, "tenantB", b.id)
    with pytest.raises(LookupError):
        svc.run_validation(db, tenant="tenantB", actor="x", batch_id=b.id)
