"""Sprint 23 — Broker + Client Portfolio governed rollups (read-only composition; no migration).

Covers: broker book totals (clients/lives/premium/claims/portfolio ICR), client-scoped lives
(no double-count), renewal-due 30/60/90 buckets from policy_end_date, risk bands from
RecommendationConfig ICR thresholds, readiness distribution, high-risk selection + book NBAs;
client-360 composition (KPIs + benchmarking/placement/wellness statuses + NBA) that RECONCILES
with /metrics/icr; auth, tenant isolation, client scoping, evidence + 404, Alembic head unchanged.

Test-data note: ClientMaster.client_id is globally unique, so each test namespaces its client
ids by tenant (via _seed) to keep tests isolated.
"""
import datetime
import itertools
import os
import re
from fastapi.testclient import TestClient

from app.main import app
from app.models.governance import DatasetVersion
from app.models.canonical import PolicyVersion, MemberMaster, Claim, ClientMaster

c = TestClient(app)
_cn = itertools.count(1)
TODAY = datetime.date.today()


def _tok(role="analyst", tenant="s23_api"):
    r = c.post("/auth/token", json={"username": "u", "tenant_id": tenant, "role": role})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _dv(db, tenant):
    dvid = f"dv_{tenant}"
    if not db.query(DatasetVersion).filter(DatasetVersion.id == dvid).first():
        db.add(DatasetVersion(id=dvid, tenant_id=tenant, upload_batch_id="b", status="ACTIVE")); db.flush()
    return dvid


def _seed(db, tenant):
    """Seed two clients for `tenant`. Client ids are namespaced by tenant (ClientMaster.client_id
    is globally unique), so tests stay isolated. Returns (c1, c2)."""
    dv = _dv(db, tenant)
    c1, c2 = f"{tenant}_C1", f"{tenant}_C2"
    pvids = {}

    def pv(cid, prem, end_days):
        p = PolicyVersion(tenant_id=tenant, dataset_version_id=dv, source_dataset_version_id=dv,
                          upload_batch_id="b", raw_file_id="r", raw_row_index=0, client_id=cid,
                          policy_number=f"P-{cid}", policy_year=2026, status="ACTIVE", premium=prem,
                          policy_end_date=(TODAY + datetime.timedelta(days=end_days)) if end_days is not None else None)
        db.add(p); db.flush(); pvids[cid] = p.id

    def mem(cid, key):
        db.add(MemberMaster(tenant_id=tenant, dataset_version_id=dv, upload_batch_id="b", raw_file_id="r",
                            raw_row_index=0, policy_number=f"P-{cid}", policy_version_id=pvids[cid],
                            member_reference_key=f"{cid}_{key}", relationship="Self", sum_insured=500000,
                            age=40, policy_year=2026))

    def clm(cid, key, paid):
        db.add(Claim(tenant_id=tenant, dataset_version_id=dv, upload_batch_id="b", raw_file_id="r",
                     raw_row_index=0, policy_number=f"P-{cid}", policy_version_id=pvids[cid],
                     claim_number=f"C{next(_cn)}", member_reference_key=f"{cid}_{key}", total_claim_paid=paid,
                     outstanding_amount=0, policy_year=2026))

    db.add(ClientMaster(tenant_id=tenant, dataset_version_id=dv, upload_batch_id="b", raw_file_id="r",
                        raw_row_index=0, client_id=c1, client_name="Acme Corp"))
    pv(c1, 1000000, 20); mem(c1, "E1"); mem(c1, "E2"); clm(c1, "E1", 1600000)   # ICR 160 -> place
    pv(c2, 1000000, 200); mem(c2, "E1"); clm(c2, "E1", 500000)                  # ICR 50 -> defend
    db.commit()
    return c1, c2


# ---- Broker overview --------------------------------------------------------
def test_broker_overview_rollup(db):
    c1, c2 = _seed(db, "s23_bk")
    r = c.get("/portfolio/broker-overview", headers=_tok(tenant="s23_bk"))
    assert r.status_code == 200, r.text
    v = r.json()["value"]
    assert v["total_clients"] == 2 and v["total_lives"] == 3 and v["total_premium"] == 2000000.0
    assert v["total_claims"] == 2 and v["portfolio_icr"] == 105.0     # (1.6M+0.5M)/2M
    assert v["renewal_due"]["d30"] == 1 and v["renewal_due"]["later"] == 1
    assert v["risk_distribution"]["place"] == 1 and v["risk_distribution"]["defend"] == 1
    assert v["clients"][0]["client_name"] == "Acme Corp" and v["clients"][0]["risk_band"] == "place"
    assert [x["client_id"] for x in v["high_risk_clients"]] == [c1]
    assert len(v["next_best_actions"]) >= 1


def test_broker_lives_are_client_scoped(db):
    # 3 distinct members across 2 clients must NOT be double-counted per client
    c1, c2 = _seed(db, "s23_lives")
    v = c.get("/portfolio/broker-overview", headers=_tok(tenant="s23_lives")).json()["value"]
    per = {x["client_id"]: x["lives"] for x in v["clients"]}
    assert per[c1] == 2 and per[c2] == 1 and v["total_lives"] == 3


# ---- Client overview + reconciliation --------------------------------------
def test_client_overview_composition(db):
    c1, _ = _seed(db, "s23_cl")
    v = c.get(f"/portfolio/client-overview?client_id={c1}", headers=_tok(tenant="s23_cl")).json()["value"]
    assert v["client_name"] == "Acme Corp" and v["lives"] == 2 and v["operational_icr"] == 160.0
    assert v["renewal_status"]["due_bucket"] == "d30"
    assert "valid_peer_group" in v["benchmarking_status"]
    assert "placement_state" in v["placement_status"]
    assert "posture" in v["wellness_status"]
    assert v["next_best_action"]["recommendation"] is not None
    assert set(["renewal", "benchmarking", "placement", "wellness", "claims"]).issubset(v["links"].keys())


def test_client_overview_reconciles_with_metrics_icr(db):
    c1, _ = _seed(db, "s23_rec")
    h = _tok(tenant="s23_rec")
    co = c.get(f"/portfolio/client-overview?client_id={c1}", headers=h).json()["value"]["operational_icr"]
    mi = c.get(f"/metrics/icr?client_id={c1}", headers=h).json()["value"]["operational_icr"]
    assert co == mi == 160.0        # client-360 is single-source with the module engines


# ---- auth / isolation / scoping / evidence ---------------------------------
def test_endpoints_require_auth(db):
    assert c.get("/portfolio/broker-overview").status_code == 401
    assert c.get("/portfolio/client-overview?client_id=any").status_code == 401


def test_tenant_isolation(db):
    _seed(db, "s23_ta")
    other = c.get("/portfolio/broker-overview", headers=_tok(tenant="s23_tb")).json()
    assert other["value"]["total_clients"] == 0 and other["data_quality_status"] == "No Data"


def test_client_scoping_broker_view_scoped_to_assigned_client(db):
    c1, c2 = _seed(db, "s23_scope")
    admin = {"Authorization": f"Bearer {c.post('/auth/token', json={'username':'a','tenant_id':'s23_scope','role':'admin'}).json()['access_token']}"}
    r = c.post("/admin/users", headers=admin, json={"email": "hr.s23@x.local", "username": "hr", "user_role": "client_hr_viewer", "client_ids": [c1]})
    tok = c.post("/auth/login", json={"email": "hr.s23@x.local", "password": r.json()["temporary_password"]}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    # a Client HR Viewer's broker view is auto-scoped to their assigned client (c1 only, not c2)
    v = c.get("/portfolio/broker-overview", headers=h).json()["value"]
    assert v["total_clients"] == 1 and v["clients"][0]["client_id"] == c1
    # and they cannot read another client's 360
    assert c.get(f"/portfolio/client-overview?client_id={c2}", headers=h).status_code == 403


def test_evidence_and_404(db):
    _seed(db, "s23_ev")
    h = _tok(tenant="s23_ev")
    e = c.get("/portfolio/evidence/broker-overview", headers=h)
    assert e.status_code == 200 and e.json()["module"] == "broker_portfolio" and "formula" in e.json()
    assert c.get("/portfolio/evidence/bogus", headers=h).status_code == 404


def test_alembic_head_unchanged_sprint23():
    vdir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "migrations", "versions")
    revs, downs = set(), {}
    for fn in os.listdir(vdir):
        if not fn.endswith(".py"):
            continue
        txt = open(os.path.join(vdir, fn), encoding="utf-8").read()
        rev = re.search(r"revision:\s*str\s*=\s*'([^']+)'", txt)
        down = re.search(r"down_revision[^=]*=\s*'([^']+)'", txt)
        if rev:
            revs.add(rev.group(1)); downs[rev.group(1)] = down.group(1) if down else None
    referenced = {d for d in downs.values() if d}
    heads = [r for r in revs if r not in referenced]
    assert heads == ["a3d7e9f1c2b4"], heads
