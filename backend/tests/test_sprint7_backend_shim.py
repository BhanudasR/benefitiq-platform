from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings

c = TestClient(app)


def _tok(role="analyst", tenant="acme"):
    r = c.post("/auth/token", json={"username": "u", "tenant_id": tenant, "role": role})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_cors_origins_config_driven():
    # config-driven (not hard-coded) — default includes the dev SPA origin
    assert "localhost:5173" in settings.cors_origins


def test_cors_header_present_on_allowed_origin():
    r = c.get("/health", headers={"Origin": "http://localhost:5173"})
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_me_echoes_principal():
    r = c.get("/auth/me", headers=_tok("reviewer", "acme"))
    assert r.status_code == 200
    body = r.json()
    assert body["tenant_id"] == "acme" and body["role"] == "reviewer" and body["sub"] == "u"


def test_me_requires_auth():
    assert c.get("/auth/me").status_code == 401
