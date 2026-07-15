from fastapi.testclient import TestClient
from app.main import app
from tests.test_sprint5_simulation import _seed_all

c = TestClient(app)


def _tok(role="analyst", tenant="simapi"):
    r = c.post("/auth/token", json={"username": "u", "tenant_id": tenant, "role": role})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_simulation_endpoints(db):
    _seed_all(db, "simapi")
    for ep in ("room-rent", "copay", "parent-copay", "corporate-buffer", "adjusted-icr",
               "balanced-design", "scenario", "maternity-sublimit"):
        r = c.get(f"/simulation/{ep}", headers=_tok())
        assert r.status_code == 200, ep
        assert "operational_icr" in r.json() or ep in ("scenario",)  # op ICR always shown
    # disease-cap needs a cap
    assert c.get("/simulation/disease-cap", params={"proposed_cap": 500000}, headers=_tok()).json()["value"]["employer_saving"] == 700000
    # room-rent with pct override
    rr = c.get("/simulation/room-rent", params={"room_rent_pct": 0.01}, headers=_tok()).json()
    assert rr["operational_icr"]["operational_icr"] == 146.0 and rr["value"]["portfolio_saving"] == 35000
    ev = c.get("/simulation/evidence/room-rent", headers=_tok())
    assert ev.status_code == 200 and "formula" in ev.json() and "operational_icr" in ev.json()


def test_simulation_requires_auth():
    assert c.get("/simulation/room-rent").status_code == 401
