import json
from fastapi.testclient import TestClient
from app.main import app
from app.services import tabular, mapping as mp
from tests._fixtures import read_bytes, CLAIMS

c = TestClient(app)
H = ("Txt_Policy_Number,Txt_Claim_Number,Txt_Member_Reference_Key,Txt_Diagnosis_Code_Level_I,"
     "Txt_Name_of_the_Hospital,Date_of_Admission,Date_of_Discharge,Num_Sum_Insured,"
     "Num_Total_Amount_Claimed,Num_Total_Claim_Paid,Num_Room_Charges_Claimed,"
     "Num_Nursing_Charges_claimed,Num_Percentage_of_copayment,Txt_Claim_Status,"
     "Boo_hospital_is_network_Provider")
CRITICAL = (H + "\n"
            + "POL-1,CLM-OK,MRK-1,I20,H,05-Apr-2026,09-Apr-2026,500000,200000,100000,0,,0,1,Y\n"
            + ",CLM-B1,,,,,,,100,999,,,,1,N\n" + ",CLM-B2,,,,,,,100,999,,,,1,N\n"
            + ",CLM-B3,,,,,,,100,999,,,,1,N\n" + ",CLM-B4,,,,,,,100,999,,,,1,N\n").encode()


def _tok(role="analyst", tenant="acme"):
    r = c.post("/auth/token", json={"username": "u", "tenant_id": tenant, "role": role})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _field_map(data):
    p = tabular.parse_table(data)
    return {s["source_header"]: s["suggested_canonical"]
            for s in mp.suggest_mapping(p["headers"], "claims")["suggestions"]
            if s["suggested_canonical"]}


def _create(data, tenant="acme"):
    r = c.post("/batches", data={"file_kind": "claims"},
               files={"file": ("c.csv", data, "text/csv")}, headers=_tok("analyst", tenant))
    assert r.status_code == 200
    return r.json()["batch_id"]


def _map(bid, data, tenant="acme"):
    r = c.post(f"/batches/{bid}/mapping",
               data={"field_map": json.dumps(_field_map(data))}, headers=_tok("reviewer", tenant))
    assert r.status_code == 200


def test_full_lifecycle_analytics_ready():
    data = read_bytes(CLAIMS)
    bid = _create(data); _map(bid, data)
    assert c.post(f"/batches/{bid}/validate", headers=_tok("analyst")).status_code == 200
    dq = c.post(f"/batches/{bid}/dq", headers=_tok("analyst")).json()
    assert dq["readiness"] == "Analytics Ready"
    assert c.post(f"/batches/{bid}/approve", headers=_tok("reviewer")).status_code == 200
    act = c.post(f"/batches/{bid}/activate", headers=_tok("reviewer")).json()
    assert act["readiness_status"].startswith("Analytics Ready") and act["restricted"] is False
    load = c.post(f"/batches/{bid}/load-canonical", headers=_tok("reviewer")).json()
    assert load["loaded"] == 4 and load["data_quality_caveat"] is False


def test_rbac_analyst_cannot_approve_or_map():
    data = read_bytes(CLAIMS); bid = _create(data)
    # analyst mapping -> 403 (needs reviewer)
    r = c.post(f"/batches/{bid}/mapping", data={"field_map": "{}"}, headers=_tok("analyst"))
    assert r.status_code == 403
    _map(bid, data)
    c.post(f"/batches/{bid}/validate", headers=_tok("analyst"))
    c.post(f"/batches/{bid}/dq", headers=_tok("analyst"))
    # analyst approve -> 403
    assert c.post(f"/batches/{bid}/approve", headers=_tok("analyst")).status_code == 403


def test_below_threshold_approve_409_then_admin_override():
    bid = _create(CRITICAL); _map(bid, CRITICAL)
    c.post(f"/batches/{bid}/validate", headers=_tok("analyst"))
    c.post(f"/batches/{bid}/dq", headers=_tok("analyst"))
    # reviewer approve blocked by gate -> 409
    assert c.post(f"/batches/{bid}/approve", headers=_tok("reviewer")).status_code == 409
    # reviewer override -> 403 (admin only)
    assert c.post(f"/batches/{bid}/override", data={"reason": "x"},
                  headers=_tok("reviewer")).status_code == 403
    # admin override -> Restricted
    ov = c.post(f"/batches/{bid}/override", data={"reason": "pilot go-live"},
                headers=_tok("admin"))
    assert ov.status_code == 200 and ov.json()["readiness_status"].startswith("Restricted")
    load = c.post(f"/batches/{bid}/load-canonical", headers=_tok("reviewer")).json()
    assert load["restricted"] is True and load["rows_excluded_quarantined"] == 4


def test_override_missing_reason_rejected():
    bid = _create(CRITICAL); _map(bid, CRITICAL)
    c.post(f"/batches/{bid}/validate", headers=_tok("analyst"))
    c.post(f"/batches/{bid}/dq", headers=_tok("analyst"))
    # empty reason -> 400 (service ValueError); absent field -> 422 (FastAPI)
    r = c.post(f"/batches/{bid}/override", data={"reason": "   "}, headers=_tok("admin"))
    assert r.status_code == 400
    r2 = c.post(f"/batches/{bid}/override", headers=_tok("admin"))
    assert r2.status_code == 422


def test_tenant_isolation_via_api():
    data = read_bytes(CLAIMS)
    bid = _create(data, tenant="tenantA")
    # tenantB cannot read tenantA's batch
    r = c.get(f"/batches/{bid}", headers=_tok("analyst", tenant="tenantB"))
    assert r.status_code == 404
    # owner can
    assert c.get(f"/batches/{bid}", headers=_tok("analyst", tenant="tenantA")).status_code == 200
