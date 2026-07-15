from fastapi.testclient import TestClient
from app.main import app
from app.services import onboarding_service as svc, canonical_loader, mapping as mp
from app.core.security import Role
from app.models.governance import UploadBatch
from tests.test_sprint4_metrics import POLICY, MEMBER, CLAIMS, _seed_all

c = TestClient(app)


def _tok(role="analyst", tenant="apitenant"):
    r = c.post("/auth/token", json={"username": "u", "tenant_id": tenant, "role": role})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_metric_endpoints_reachable_and_governed(db):
    _seed_all(db, "apitenant")
    for ep in ("portfolio", "claims", "icr", "trends", "relation", "hospital", "ailment", "large-claims"):
        r = c.get(f"/metrics/{ep}", headers=_tok())
        assert r.status_code == 200, ep
        assert "data_quality_status" in r.json()
    icr = c.get("/metrics/icr", headers=_tok()).json()
    assert icr["premium_basis"] == "written" and icr["value"]["operational_icr"] is not None
    ev = c.get("/metrics/evidence/claims", headers=_tok())
    assert ev.status_code == 200 and "formula" in ev.json() and "numerator" in ev.json()


def test_metric_requires_auth_and_filters():
    assert c.get("/metrics/claims").status_code == 401
    r = c.get("/metrics/claims", params={"policy_year": 2025}, headers=_tok("analyst", "emptytenant"))
    assert r.status_code == 200 and r.json()["value"]["claim_count"] == 0
