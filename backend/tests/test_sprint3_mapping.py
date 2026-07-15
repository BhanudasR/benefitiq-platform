import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import Role
from app.services import onboarding_service as svc, mapping_workflow as mw, mapping as mp
from app.models.governance import MappingAudit, MappingProfile

CLAIMS_H = ("Txt_Policy_Number,Txt_Claim_Number,Txt_Member_Reference_Key,Num_Sum_Insured,"
            "Num_Total_Amount_Claimed,Num_Total_Claim_Paid,Txt_Claim_Status,XCOL")
JUNK = (CLAIMS_H + "\n" + "POL-1,CLM-1,MRK-1,500000,200000,100000,1,somevalue\n").encode()


def _upload(db, tenant, data=JUNK, kind="claims", actor="rev"):
    return svc.register_upload(db, tenant=tenant, actor=actor, file_kind=kind,
                               file_name="f.csv", data=data)


# tier classifier ------------------------------------------------------------
def test_confidence_tier_thresholds():
    assert mp.confidence_tier(1.0, True) == "high"
    assert mp.confidence_tier(0.7, True) == "medium"
    assert mp.confidence_tier(0.4, True) == "low"
    assert mp.confidence_tier(0.0, False) == "unmapped"


# 4: low/unmapped blocks confirmation until a manual decision ----------------
def test_unmapped_column_blocks_until_manual(db):
    b = _upload(db, "mm1")
    r = mw.review(db, tenant="mm1", batch_id=b.id)
    assert "XCOL" in r["unmapped"] and "XCOL" in r["blocking"]
    assert r["can_proceed"] is False
    # user maps it -> no longer blocking
    r2 = mw.manual_decision(db, tenant="mm1", actor="rev", batch_id=b.id,
                            raw_column="XCOL", decision="map", canonical="provider_code")
    assert r2["can_proceed"] is True and "XCOL" not in r2["blocking"]


# 5: ignore requires a reason -----------------------------------------------
def test_ignore_requires_reason(db):
    b = _upload(db, "mm2")
    with pytest.raises(ValueError):
        mw.manual_decision(db, tenant="mm2", actor="rev", batch_id=b.id,
                           raw_column="XCOL", decision="ignore", reason="  ")
    r = mw.manual_decision(db, tenant="mm2", actor="rev", batch_id=b.id,
                           raw_column="XCOL", decision="ignore", reason="not needed for analysis")
    assert r["can_proceed"] is True


# 7: MappingAudit records the before/after -----------------------------------
def test_mapping_audit_records_before_after(db):
    b = _upload(db, "mm3")
    mw.manual_decision(db, tenant="mm3", actor="alice", batch_id=b.id,
                       raw_column="XCOL", decision="map", canonical="provider_code")
    a = db.query(MappingAudit).filter(MappingAudit.tenant_id == "mm3",
                                      MappingAudit.raw_column == "XCOL").one()
    assert a.decision == "map" and a.selected_canonical == "provider_code"
    assert a.previous_suggestion is None and float(a.confidence_before) == 0.0
    assert a.actor == "alice"


# 6: alias saved is reused on the next upload --------------------------------
def test_alias_saved_and_reused_next_upload(db):
    b1 = _upload(db, "mm4")
    mw.manual_decision(db, tenant="mm4", actor="rev", batch_id=b1.id,
                       raw_column="XCOL", decision="alias", canonical="provider_code")
    assert db.query(MappingProfile).filter(MappingProfile.tenant_id == "mm4",
                                           MappingProfile.name == "__aliases__").one().version == 1
    # brand-new upload, same layout -> XCOL now resolves via the learned alias
    b2 = _upload(db, "mm4")
    r = mw.review(db, tenant="mm4", batch_id=b2.id)
    xcol = next(s for s in r["suggestions"] if s["source_header"] == "XCOL")
    assert xcol["suggested_canonical"] == "provider_code" and xcol["method"] == "alias"
    assert "XCOL" not in r["blocking"]


# API: review + RBAC on manual ----------------------------------------------
c = TestClient(app)


def _tok(role="analyst", tenant="acme"):
    r = c.post("/auth/token", json={"username": "u", "tenant_id": tenant, "role": role})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_manual_mapping_api_rbac():
    bid = c.post("/batches", data={"file_kind": "claims"},
                 files={"file": ("f.csv", JUNK, "text/csv")}, headers=_tok("analyst")).json()["batch_id"]
    rev = c.get(f"/batches/{bid}/mapping/review", headers=_tok("analyst"))
    assert rev.status_code == 200 and rev.json()["can_proceed"] is False
    # analyst cannot make a manual mapping decision (reviewer+)
    a = c.post(f"/batches/{bid}/mapping/manual",
               data={"raw_column": "XCOL", "decision": "map", "canonical": "provider_code"},
               headers=_tok("analyst"))
    assert a.status_code == 403
    ok = c.post(f"/batches/{bid}/mapping/manual",
                data={"raw_column": "XCOL", "decision": "map", "canonical": "provider_code"},
                headers=_tok("reviewer"))
    assert ok.status_code == 200 and ok.json()["can_proceed"] is True
