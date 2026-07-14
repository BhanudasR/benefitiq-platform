import json
from fastapi.testclient import TestClient
from app.main import app
from tests._fixtures import read_bytes, CLAIMS

c = TestClient(app)


def _token(role="analyst"):
    r = c.post("/auth/token", json={"username": "u1", "tenant_id": "acme", "role": role})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _file():
    return {"file": ("claims.csv", read_bytes(CLAIMS), "text/csv")}


def test_profile_endpoint():
    r = c.post("/onboarding/profile", data={"file_kind": "claims"},
               files=_file(), headers=_token())
    assert r.status_code == 200
    body = r.json()
    assert body["table"] == "claims"
    assert body["profile"]["column_count"] == 15
    assert len(body["profile"]["preview"]) == 4


def test_requires_auth():
    r = c.post("/onboarding/profile", data={"file_kind": "claims"}, files=_file())
    assert r.status_code == 401


def test_unknown_file_kind_rejected():
    r = c.post("/onboarding/profile", data={"file_kind": "nonsense"},
               files=_file(), headers=_token())
    assert r.status_code == 400


def test_mapping_suggest_endpoint():
    r = c.post("/onboarding/mapping/suggest", data={"file_kind": "claims"},
               files=_file(), headers=_token())
    assert r.status_code == 200
    body = r.json()
    assert body["overall_confidence"] >= 0.99
    assert body["unmapped_mandatory"] == []
    assert "layout_signature" in body


def test_confirm_requires_reviewer_role():
    hdrs = json.dumps(["Txt_Policy_Number", "Txt_Claim_Number"])
    fm = json.dumps({"Txt_Policy_Number": "policy_number",
                     "Txt_Claim_Number": "claim_number"})
    # analyst cannot confirm
    r = c.post("/onboarding/mapping/confirm",
               data={"file_kind": "claims", "headers": hdrs, "field_map": fm},
               headers=_token("analyst"))
    assert r.status_code == 403


def test_confirm_and_reuse_profile():
    parsed_headers = c.post("/onboarding/mapping/suggest", data={"file_kind": "claims"},
                            files=_file(), headers=_token()).json()["suggestions"]
    headers = [s["source_header"] for s in parsed_headers]
    field_map = {s["source_header"]: s["suggested_canonical"]
                 for s in parsed_headers if s["suggested_canonical"]}
    r = c.post("/onboarding/mapping/confirm",
               data={"file_kind": "claims", "headers": json.dumps(headers),
                     "field_map": json.dumps(field_map), "save_as_profile": "true",
                     "profile_name": "tpa-x-claims"},
               headers=_token("reviewer"))
    assert r.status_code == 200 and r.json()["confirmed"] is True
    assert r.json().get("profile_saved") is True
    # reuse against the same layout
    r2 = c.post("/onboarding/mapping/reuse", data={"file_kind": "claims"},
                files=_file(), headers=_token())
    assert r2.status_code == 200
    assert r2.json()["full_match"] is True
    assert r2.json()["profile_name"] == "tpa-x-claims"


def test_dq_score_endpoint_full_pipeline():
    r = c.post("/onboarding/dq-score", data={"file_kind": "claims"},
               files=_file(), headers=_token())
    assert r.status_code == 200
    body = r.json()
    assert body["dq_score"]["readiness"] == "Analytics Ready"
    assert body["dq_score"]["reconciles"] is True
    assert body["dq_score"]["overall_score"] >= 85
    assert "review_queue" in body
    assert body["review_queue"]["quarantined_count"] == 0
