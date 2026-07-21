"""Sprint 14 — Admin User Management, Testing Access & RBAC foundation.

Covers admin CRUD, temp-password (never stored plain), real-user /auth/login,
deactivated-cannot-login, capability guards (read-only tester blocked from admin/upload),
client scoping (Client HR Viewer), tenant isolation, audit entries, /auth/token backward
compatibility, and the Alembic chain."""
import os
import re
from fastapi.testclient import TestClient

from app.main import app
from app.core.security import capabilities_for
from app.models.governance import User, AuditLog

c = TestClient(app)


def _admin(tenant):
    r = c.post("/auth/token", json={"username": "admin", "tenant_id": tenant, "role": "admin"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _legacy(role, tenant):
    r = c.post("/auth/token", json={"username": "u", "tenant_id": tenant, "role": role})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _create(tenant, email, user_role, **kw):
    return c.post("/admin/users", headers=_admin(tenant),
                  json={"email": email, "username": email.split("@")[0], "user_role": user_role, **kw})


# ---- admin CRUD -------------------------------------------------------------
def test_admin_can_create_list_read_user(db):
    r = _create("s14_a", "a.create@x.local", "analyst")
    assert r.status_code == 200 and "temporary_password" in r.json()
    uid = r.json()["user"]["id"]
    assert "password" not in str(r.json()["user"]).lower()          # no password field leaked
    lst = c.get("/admin/users", headers=_admin("s14_a")).json()["users"]
    assert any(u["id"] == uid for u in lst)
    got = c.get(f"/admin/users/{uid}", headers=_admin("s14_a"))
    assert got.status_code == 200 and got.json()["user"]["email"] == "a.create@x.local"


def test_admin_can_update_role(db):
    uid = _create("s14_b", "b.role@x.local", "analyst").json()["user"]["id"]
    r = c.patch(f"/admin/users/{uid}", headers=_admin("s14_b"), json={"user_role": "eb_head"})
    assert r.status_code == 200
    assert r.json()["user"]["user_role"] == "eb_head" and r.json()["user"]["base_role"] == "reviewer"


def test_admin_can_assign_client_access(db):
    uid = _create("s14_c", "c.client@x.local", "client_hr_viewer").json()["user"]["id"]
    r = c.put(f"/admin/users/{uid}/clients", headers=_admin("s14_c"), json={"client_ids": ["C1", "C2"]})
    assert r.status_code == 200 and r.json()["user"]["assigned_client_count"] == 2


def test_admin_can_deactivate_and_activate(db):
    uid = _create("s14_d", "d.status@x.local", "analyst").json()["user"]["id"]
    assert c.post(f"/admin/users/{uid}/deactivate", headers=_admin("s14_d")).json()["user"]["status"] == "inactive"
    assert c.post(f"/admin/users/{uid}/activate", headers=_admin("s14_d")).json()["user"]["status"] == "active"


def test_admin_can_reset_password_and_it_is_not_stored_plain(db):
    r = _create("s14_e", "e.reset@x.local", "analyst")
    uid = r.json()["user"]["id"]
    rp = c.post(f"/admin/users/{uid}/reset-password", headers=_admin("s14_e"))
    assert rp.status_code == 200
    temp = rp.json()["temporary_password"]
    row = db.query(User).filter(User.id == uid).first()
    assert row.password_hash and row.password_hash != temp          # hash stored, not plain
    # new temp password authenticates
    assert c.post("/auth/login", json={"email": "e.reset@x.local", "password": temp}).status_code == 200


def test_roles_endpoint_lists_testing_roles(db):
    roles = c.get("/admin/roles", headers=_admin("s14_r")).json()["roles"]
    ids = {r["user_role"] for r in roles}
    assert {"platform_admin", "broker_admin", "read_only_tester", "client_hr_viewer"}.issubset(ids)


# ---- auth / login -----------------------------------------------------------
def test_login_works_and_deactivated_cannot_login(db):
    r = _create("s14_f", "f.login@x.local", "consultant_rm")
    temp = r.json()["temporary_password"]
    ok = c.post("/auth/login", json={"email": "f.login@x.local", "password": temp})
    assert ok.status_code == 200 and ok.json()["user_role"] == "consultant_rm"
    c.post(f"/admin/users/{r.json()['user']['id']}/deactivate", headers=_admin("s14_f"))
    assert c.post("/auth/login", json={"email": "f.login@x.local", "password": temp}).status_code == 401
    assert c.post("/auth/login", json={"email": "f.login@x.local", "password": "wrong"}).status_code == 401


def test_auth_token_remains_backward_compatible(db):
    # legacy token still authenticates existing analytics routes (no capabilities claim)
    assert c.get("/metrics/claims", headers=_legacy("analyst", "s14_bc")).status_code == 200


# ---- capability guards ------------------------------------------------------
def test_read_only_tester_blocked_from_admin(db):
    r = _create("s14_g", "g.tester@x.local", "read_only_tester")
    tok = c.post("/auth/login", json={"email": "g.tester@x.local", "password": r.json()["temporary_password"]}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    assert c.get("/admin/users", headers=h).status_code == 403
    assert c.post("/admin/users", headers=h, json={"email": "x@x.local", "username": "x", "user_role": "analyst"}).status_code == 403


def test_read_only_tester_lacks_upload_and_admin_capabilities(db):
    caps = capabilities_for("read_only_tester")
    assert "upload" not in caps and "admin" not in caps and "manage_users" not in caps
    assert "upload" in capabilities_for("consultant_rm")


def test_non_admin_legacy_analyst_blocked_from_admin(db):
    assert c.get("/admin/users", headers=_legacy("analyst", "s14_h")).status_code == 403


# ---- client scoping ---------------------------------------------------------
def test_client_hr_viewer_scoped_to_assigned_client(db):
    r = _create("s14_i", "i.hr@x.local", "client_hr_viewer", client_ids=["C1"])
    tok = c.post("/auth/login", json={"email": "i.hr@x.local", "password": r.json()["temporary_password"]}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    assert c.get("/metrics/claims?client_id=C2", headers=h).status_code == 403   # unassigned
    assert c.get("/metrics/claims?client_id=C1", headers=h).status_code == 200   # assigned


# ---- tenant isolation -------------------------------------------------------
def test_tenant_isolation(db):
    uid = _create("s14_ta", "ta.user@x.local", "analyst").json()["user"]["id"]
    # a different tenant's admin cannot see or read that user
    assert all(u["id"] != uid for u in c.get("/admin/users", headers=_admin("s14_tb")).json()["users"])
    assert c.get(f"/admin/users/{uid}", headers=_admin("s14_tb")).status_code == 404


# ---- audit ------------------------------------------------------------------
def test_audit_entries_created(db):
    r = _create("s14_au", "au.user@x.local", "analyst")
    uid = r.json()["user"]["id"]
    c.post(f"/admin/users/{uid}/reset-password", headers=_admin("s14_au"))
    c.post(f"/admin/users/{uid}/deactivate", headers=_admin("s14_au"))
    actions = {a.action for a in db.query(AuditLog).filter(AuditLog.entity_id == uid).all()}
    assert {"USER_CREATED", "PASSWORD_RESET", "USER_DEACTIVATED"}.issubset(actions)


# ---- Alembic chain ----------------------------------------------------------
def test_alembic_single_head_and_chain_intact():
    vdir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "migrations", "versions")
    revs, downs = set(), {}
    for fn in os.listdir(vdir):
        if not fn.endswith(".py"):
            continue
        txt = open(os.path.join(vdir, fn), encoding="utf-8").read()
        rev = re.search(r"revision:\s*str\s*=\s*'([^']+)'", txt)
        down = re.search(r"down_revision[^=]*=\s*'([^']+)'", txt)
        if rev:
            revs.add(rev.group(1))
            downs[rev.group(1)] = down.group(1) if down else None
    referenced = {d for d in downs.values() if d}
    heads = [r for r in revs if r not in referenced]
    assert "e9c3f7a1b2d4" in revs        # this sprint's migration is present
    assert len(heads) == 1               # single head (exact hash checked in the newest sprint test)
    assert len([r for r, d in downs.items() if d is None]) == 1
    assert all(d in revs for d in referenced)
