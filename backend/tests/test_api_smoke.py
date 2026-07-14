from fastapi.testclient import TestClient
from app.main import app

c = TestClient(app)


def _token(role="analyst"):
    r = c.post("/auth/token", json={"username": "u1", "tenant_id": "acme", "role": role})
    assert r.status_code == 200
    return r.json()["access_token"]


def test_health():
    r = c.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_upload_requires_auth():
    r = c.post("/uploads", data={"file_kind": "claims"},
               files={"file": ("f.csv", b"a,b\n1,2\n", "text/csv")})
    assert r.status_code == 401


def test_immutable_upload_roundtrip():
    tok = _token()
    files = {"file": ("claims.csv", b"col1,col2\n1,2\n", "text/csv")}
    r = c.post("/uploads", data={"file_kind": "claims"}, files=files,
               headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "UPLOADED" and body["immutable"] is True
    assert len(body["sha256"]) == 64 and body["tenant_id"] == "acme"
    # re-upload identical bytes -> idempotent (not rewritten), same hash
    r2 = c.post("/uploads", data={"file_kind": "claims"}, files=files,
                headers={"Authorization": f"Bearer {tok}"})
    assert r2.json()["sha256"] == body["sha256"] and r2.json()["written"] is False
