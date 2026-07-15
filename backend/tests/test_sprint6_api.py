from fastapi.testclient import TestClient
from app.main import app
from app.services import onboarding_service as svc
from tests.test_sprint6_terms import _seed, POLICY, TERMS, PDF_TEXT, _pv_id

c = TestClient(app)


def _tok(role="analyst", tenant="t6api"):
    r = c.post("/auth/token", json={"username": "u", "tenant_id": tenant, "role": role})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_terms_api_extract_confirm_list(db):
    _seed(db, "t6api", POLICY, "policy")
    pvid = _pv_id(db, "t6api", 2025)
    # upload a PDF wording + Stage-1 extract (candidates only)
    bid = c.post("/batches", data={"file_kind": "terms_pdf"},
                 files={"file": ("w.pdf", PDF_TEXT, "application/pdf")}, headers=_tok("analyst")).json()["batch_id"]
    ext = c.post(f"/batches/{bid}/terms/extract", data={"policy_version_id": pvid}, headers=_tok("reviewer"))
    assert ext.status_code == 200 and ext.json()["candidate_count"] >= 4
    assert all(cd["auto_applied"] is False for cd in ext.json()["candidates"])
    # analyst cannot confirm (reviewer+)
    tid = next(cd["term_id"] for cd in ext.json()["candidates"] if cd["term_type"] == "room_rent")
    assert c.post(f"/terms/{tid}/confirm", headers=_tok("analyst")).status_code == 403
    assert c.post(f"/terms/{tid}/confirm", headers=_tok("reviewer")).status_code == 200
    # list confirmed
    lst = c.get("/terms", params={"status": "confirmed"}, headers=_tok("analyst")).json()["terms"]
    assert any(t["term_type"] == "room_rent" and t["status"] == "confirmed" for t in lst)


def test_terms_api_requires_auth():
    assert c.get("/terms").status_code == 401
