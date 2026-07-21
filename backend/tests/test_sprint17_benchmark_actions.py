"""Sprint 17 — Benchmark Gap -> Renewal / Savings Sandbox linkage (one-way, governed).

Covers: flag-for-discussion, send-to-sandbox lever mapping (room_rent/copay/parent_copay/
maternity/disease_cap/corporate_buffer), unsupported gap -> discussion-only, evidence snapshot
preservation, action-history append, no-claims guarantee in the action payload, sandbox
preview delegating to the simulation service, operational-ICR-unchanged note, RBAC
(benchmark_action capability; legacy tokens & Read-only Tester denied), Client HR Viewer
client scoping, tenant isolation, the one-way import guarantee, and the Alembic head.
"""
import os
import re
from fastapi.testclient import TestClient

from app.main import app
from app.models.canonical import PolicyVersion, BenefitTerm
from app.services.linkage.actions import SANDBOX_LEVER_MAP

c = TestClient(app)

# claims-domain tokens that must NEVER appear in a benchmarking ACTION payload (design/T&C
# only). Chosen to target claims CONCEPTS without matching legitimate benefit-design terms.
CLAIMS_TOKENS = ["claims_", "icr", "utiliz", "ailment", "incurred", "loss_ratio",
                 "premium_adequacy", "claim_count", "claim_frequency", "claim_severity",
                 "average_claim", "hospital_name", "hospital_usage", "hospital_concentration"]


def _pv(db, tenant, cid):
    p = PolicyVersion(tenant_id=tenant, dataset_version_id="dv", upload_batch_id="b", raw_file_id="r",
                      raw_row_index=0, client_id=cid, policy_number=f"POL-{cid}", policy_year=2026,
                      insurer_code="150", source_dataset_version_id="dv")
    db.add(p); db.flush(); return p.id


def _term(db, tenant, pvid, tt, value=None, unit="pct", text=None):
    db.add(BenefitTerm(tenant_id=tenant, dataset_version_id="dv", upload_batch_id="b", raw_file_id="r",
                       raw_row_index=0, policy_version_id=pvid, term_type=tt, value=value, unit=unit,
                       text_value=text, status="confirmed", method="manual", confidence=0.9))


def _seed(db, tenant, spec):
    for cid, terms in spec.items():
        pid = _pv(db, tenant, cid)
        for tt, v in terms.items():
            if isinstance(v, tuple):
                _term(db, tenant, pid, tt, value=v[0], unit=v[1] if len(v) > 1 else "pct",
                      text=v[2] if len(v) > 2 else None)
            else:
                _term(db, tenant, pid, tt, value=v, unit=("amount" if "limit" in tt or "cap" in tt or "buffer" in tt else "pct"))
    db.commit()


# rich portfolio: C1 has a confirmed term for every simulation-ready feature; >=3 peers each
MAP_PORT = {
    "C1": {"room_rent": 0.01, "copay": 0.20, "parent_copay": 0.25, "maternity_limit": 500000,
           "disease_cap": 100000, "corporate_buffer": 200000, "exclusion": (None, "text", "a")},
    "C2": {"room_rent": 0.01, "copay": 0.10, "parent_copay": 0.20, "maternity_limit": 750000,
           "disease_cap": 150000, "corporate_buffer": 300000, "exclusion": (None, "text", "b")},
    "C3": {"room_rent": 0.02, "copay": 0.10, "parent_copay": 0.20, "maternity_limit": 750000,
           "disease_cap": 150000, "corporate_buffer": 300000, "exclusion": (None, "text", "b")},
    "C4": {"room_rent": 0.005, "copay": 0.10, "parent_copay": 0.20, "maternity_limit": 1000000,
           "disease_cap": 150000, "corporate_buffer": 300000, "exclusion": (None, "text", "b")},
}


def _admin(tenant):
    r = c.post("/auth/token", json={"username": "a", "tenant_id": tenant, "role": "admin"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _legacy(tenant, role="analyst"):
    r = c.post("/auth/token", json={"username": "u", "tenant_id": tenant, "role": role})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _user_token(tenant, user_role, client_ids=None, email=None):
    """A real logged-in user (email+password) whose granular role drives capabilities."""
    admin = _admin(tenant)
    email = email or f"{user_role}.{tenant}@x.local"
    body = {"email": email, "username": user_role, "user_role": user_role}
    if client_ids is not None:
        body["client_ids"] = client_ids
    r = c.post("/admin/users", headers=admin, json=body)
    tmp = r.json()["temporary_password"]
    tok = c.post("/auth/login", json={"email": email, "password": tmp}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def _create(tenant, headers, feature_id, client_id="C1", action="flag_for_discussion"):
    return c.post(f"/benchmarking/gaps/{feature_id}/actions?client_id={client_id}",
                  headers=headers, json={"selected_action": action})


# ---- create / flag ----------------------------------------------------------
def test_flag_for_discussion_creates_action(db):
    _seed(db, "bm17_flag", MAP_PORT)
    h = _user_token("bm17_flag", "analyst")
    r = _create("bm17_flag", h, "copay", action="flag_for_discussion")
    assert r.status_code == 200, r.text
    a = r.json()
    assert a["feature_id"] == "copay" and a["status"] == "flagged"
    assert a["target_module"] == "discussion_only"
    assert a["classification"] == "Above Benchmark"       # server-derived, not client-sent
    assert a["simulation_ready"] is True                  # copay is a mapped lever
    assert a["benchmark_domain"] == "benefit_design_and_policy_terms_only"
    assert len(a["action_history"]) == 1


def test_send_to_sandbox_when_mapping_exists(db):
    _seed(db, "bm17_send", MAP_PORT)
    h = _user_token("bm17_send", "analyst")
    a = _create("bm17_send", h, "maternity_limit", action="send_to_sandbox").json()
    assert a["target_module"] == "renewal_sandbox" and a["simulation_ready"] is True
    assert a["sandbox_lever"] == "maternity" and a["status"] == "sent"


def test_feature_maps_to_expected_lever(db):
    _seed(db, "bm17_map", MAP_PORT)
    h = _user_token("bm17_map", "analyst")
    expected = {"room_rent": "room_rent", "copay": "copay", "parent_copay": "parent_copay",
                "maternity_limit": "maternity", "disease_capping": "disease_cap",
                "corporate_buffer": "corporate_buffer"}
    for feat, lever in expected.items():
        a = _create("bm17_map", h, feat, action="send_to_sandbox").json()
        assert a["simulation_ready"] is True, feat
        assert a["sandbox_lever"] == lever, (feat, a["sandbox_lever"])


def test_unsupported_gap_is_discussion_only(db):
    _seed(db, "bm17_unsup", MAP_PORT)
    h = _user_token("bm17_unsup", "analyst")
    for feat in ("icu_limit", "non_payables_exclusions", "ped_waiting"):
        a = _create("bm17_unsup", h, feat, action="send_to_sandbox").json()
        assert a["simulation_ready"] is False, feat
        assert a["target_module"] == "discussion_only", feat
        assert a["sandbox_lever"] is None and a["not_ready_reason"], feat


def test_send_to_sandbox_endpoint_blocks_discussion_only(db):
    _seed(db, "bm17_block", MAP_PORT)
    h = _user_token("bm17_block", "analyst")
    a = _create("bm17_block", h, "non_payables_exclusions", action="flag_for_discussion").json()
    r = c.post(f"/benchmarking/actions/{a['id']}/send-to-sandbox", headers=h)
    assert r.status_code == 200 and r.json()["ok"] is False
    assert "discussion" in r.json()["not_ready_reason"].lower()


# ---- evidence snapshot + history --------------------------------------------
def test_evidence_snapshot_preserved(db):
    _seed(db, "bm17_ev", MAP_PORT)
    h = _user_token("bm17_ev", "analyst")
    a = _create("bm17_ev", h, "copay", action="flag_for_discussion").json()
    assert a["peer_group_definition"] and a["peer_group_definition"]["basis"]
    assert a["evidence"]["source"] == "internal_broker_portfolio_confirmed_terms"
    assert a["current_client_value"] == "0.2" and a["benchmark_value"] == "0.1"
    assert a["confidence"] and a["confidence_score"] is not None


def test_action_history_appended(db):
    _seed(db, "bm17_hist", MAP_PORT)
    h = _user_token("bm17_hist", "analyst")
    a = _create("bm17_hist", h, "room_rent", action="flag_for_discussion").json()
    assert len(a["action_history"]) == 1
    sent = c.post(f"/benchmarking/actions/{a['id']}/send-to-sandbox", headers=h).json()["action"]
    assert len(sent["action_history"]) == 2
    patched = c.patch(f"/benchmarking/actions/{a['id']}", headers=h, json={"status": "reviewed"}).json()
    assert len(patched["action_history"]) == 3 and patched["status"] == "reviewed"


# ---- no-claims guarantee ----------------------------------------------------
def _walk(o):
    if isinstance(o, dict):
        for k, v in o.items():
            yield str(k); yield from _walk(v)
    elif isinstance(o, list):
        for v in o:
            yield from _walk(v)
    elif isinstance(o, str):
        yield o


def test_no_claims_in_action_payload(db):
    _seed(db, "bm17_nc", MAP_PORT)
    h = _user_token("bm17_nc", "analyst")
    _create("bm17_nc", h, "copay", action="send_to_sandbox")
    _create("bm17_nc", h, "maternity_limit", action="flag_for_discussion")
    blob = " ".join(_walk(c.get("/benchmarking/actions?client_id=C1", headers=h).json())).lower()
    for tok in CLAIMS_TOKENS:
        assert tok not in blob, f"forbidden token '{tok}' in benchmarking action payload"


# ---- sandbox preview delegates to the simulation service --------------------
def test_sandbox_preview_uses_simulation_service(db):
    _seed(db, "bm17_prev", MAP_PORT)
    h = _user_token("bm17_prev", "analyst")
    a = _create("bm17_prev", h, "copay", action="send_to_sandbox").json()
    r = c.get(f"/benchmarking/actions/{a['id']}/sandbox-preview", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["simulation_ready"] is True and body["sandbox_lever"] == "copay"
    assert body["preview"] is not None
    # the preview IS a governed simulation envelope (has the sim service's fields)
    assert "formula" in body["preview"] and "data_quality_status" in body["preview"]
    assert "operational ICR is unchanged" in body["note"]


def test_preview_for_discussion_only_returns_no_simulation(db):
    _seed(db, "bm17_prev2", MAP_PORT)
    h = _user_token("bm17_prev2", "analyst")
    a = _create("bm17_prev2", h, "icu_limit", action="flag_for_discussion").json()
    body = c.get(f"/benchmarking/actions/{a['id']}/sandbox-preview", headers=h).json()
    assert body["simulation_ready"] is False and body["preview"] is None
    assert body["not_ready_reason"]


# ---- RBAC / scoping / isolation ---------------------------------------------
def test_legacy_token_cannot_write(db):
    _seed(db, "bm17_leg", MAP_PORT)
    # legacy /auth/token principal has no capabilities claim -> write denied
    r = _create("bm17_leg", _legacy("bm17_leg"), "copay", action="flag_for_discussion")
    assert r.status_code == 403


def test_read_only_tester_cannot_create_or_send(db):
    _seed(db, "bm17_ro", MAP_PORT)
    actor = _user_token("bm17_ro", "analyst")
    a = _create("bm17_ro", actor, "copay", action="send_to_sandbox").json()
    ro = _user_token("bm17_ro", "read_only_tester")
    assert _create("bm17_ro", ro, "copay").status_code == 403
    assert c.post(f"/benchmarking/actions/{a['id']}/send-to-sandbox", headers=ro).status_code == 403
    assert c.patch(f"/benchmarking/actions/{a['id']}", headers=ro, json={"status": "reviewed"}).status_code == 403
    # ...but a read-only user can still READ the action list (client-scoped elsewhere)
    assert c.get("/benchmarking/actions", headers=ro).status_code == 200


def test_client_hr_viewer_scoped_and_readonly(db):
    _seed(db, "bm17_scope", MAP_PORT)
    actor = _user_token("bm17_scope", "analyst")
    a_c2 = _create("bm17_scope", actor, "copay", client_id="C2", action="flag_for_discussion").json()
    hr = _user_token("bm17_scope", "client_hr_viewer", client_ids=["C1"])
    # cannot create (no benchmark_action capability)
    assert _create("bm17_scope", hr, "copay", client_id="C1").status_code == 403
    # cannot read an action outside the assigned client
    assert c.get(f"/benchmarking/actions/{a_c2['id']}", headers=hr).status_code == 403


def test_tenant_isolation(db):
    _seed(db, "bm17_ta", MAP_PORT)
    h_a = _user_token("bm17_ta", "analyst")
    a = _create("bm17_ta", h_a, "copay", action="flag_for_discussion").json()
    h_b = _user_token("bm17_tb", "analyst")
    assert c.get(f"/benchmarking/actions/{a['id']}", headers=h_b).status_code == 404
    assert c.get("/benchmarking/actions", headers=h_b).json()["count"] == 0


def test_action_endpoints_require_auth(db):
    assert c.post("/benchmarking/gaps/copay/actions", json={"selected_action": "flag_for_discussion"}).status_code == 401
    assert c.get("/benchmarking/actions").status_code == 401


# ---- one-way linkage: no reverse dependency into benchmarking ---------------
def test_benchmarking_package_never_imports_simulation_or_linkage():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    bdir = os.path.join(here, "app", "services", "benchmarking")
    for fn in os.listdir(bdir):
        if not fn.endswith(".py"):
            continue
        src = open(os.path.join(bdir, fn), encoding="utf-8").read()
        assert "services.simulation" not in src, fn      # no downstream import upstream
        assert "services.linkage" not in src, fn          # no reverse dependency
        assert "import claims" not in src and "m_claims" not in src, fn


def test_lever_map_is_exactly_the_six_simulation_ready_features():
    assert set(SANDBOX_LEVER_MAP) == {"room_rent", "copay", "parent_copay", "disease_capping",
                                      "maternity_limit", "corporate_buffer"}


# ---- Alembic ----------------------------------------------------------------
def test_alembic_single_head_is_sprint17():
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
    assert heads == ["a3d7e9f1c2b4"], heads
    assert downs["a3d7e9f1c2b4"] == "f1b5d9c3a7e2"
    assert len([r for r, d in downs.items() if d is None]) == 1
    assert all(d in revs for d in referenced)
