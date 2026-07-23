"""Sprint 25 — Governed Client Pack / Export (read-only composition + on-demand generate).

Covers: sections catalogue; preview builds a governed pack (cover + content + appendix, each with
status/caveats/source/confidence/evidence/readiness); generate writes EXACTLY ONE AuditLog EXPORT
event while preview writes none; client_id required (422); auth 401; tenant isolation; client
scoping (foreign client_id -> 403); pack-level MIN-BAND-GATED trust; a Restricted section stamps
the whole pack directional; missing engine data -> 'Not available'; no raw member/claim rows / no
PII shape in the payload; Alembic head unchanged.

Client ids are namespaced per tenant (ClientMaster.client_id is globally unique)."""
import datetime
import itertools
import json
import os
import re
from fastapi.testclient import TestClient

from app.main import app
from app.models.governance import DatasetVersion, AuditLog
from app.models.canonical import PolicyVersion, MemberMaster, Claim, ClientMaster

c = TestClient(app)
_n = itertools.count(1)
TODAY = datetime.date.today()


def _tok(role="analyst", tenant="s25_api"):
    r = c.post("/auth/token", json={"username": "u", "tenant_id": tenant, "role": role})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _seed(db, tenant, restricted=False):
    cid = f"{tenant}_C1"
    dvid = f"dv_{tenant}"
    if not db.query(DatasetVersion).filter(DatasetVersion.id == dvid).first():
        db.add(DatasetVersion(id=dvid, tenant_id=tenant, upload_batch_id="b", status="ACTIVE")); db.flush()
    pv = PolicyVersion(tenant_id=tenant, dataset_version_id=dvid, source_dataset_version_id=dvid,
                       upload_batch_id="b", raw_file_id="r", raw_row_index=0, client_id=cid,
                       policy_number=f"P-{cid}", policy_year=2026, status="ACTIVE", premium=1000000,
                       policy_end_date=TODAY + datetime.timedelta(days=40), restricted=restricted)
    db.add(pv); db.flush()
    db.add(MemberMaster(tenant_id=tenant, dataset_version_id=dvid, upload_batch_id="b", raw_file_id="r",
                        raw_row_index=0, policy_number=f"P-{cid}", policy_version_id=pv.id,
                        member_reference_key=f"{cid}_E1", relationship="Self", sum_insured=500000,
                        age=40, policy_year=2026, restricted=restricted))
    db.add(Claim(tenant_id=tenant, dataset_version_id=dvid, upload_batch_id="b", raw_file_id="r",
                 raw_row_index=0, policy_number=f"P-{cid}", policy_version_id=pv.id,
                 claim_number=f"C{next(_n)}", member_reference_key=f"{cid}_E1", total_claim_paid=1200000,
                 outstanding_amount=0, policy_year=2026, restricted=restricted))
    db.add(ClientMaster(tenant_id=tenant, dataset_version_id=dvid, upload_batch_id="b", raw_file_id="r",
                        raw_row_index=0, client_id=cid, client_name="Acme Corp"))
    db.commit()
    return cid


# ---- sections catalogue -----------------------------------------------------
def test_sections_catalogue(db):
    cid = _seed(db, "s25_sec")
    r = c.get(f"/exports/client-pack/sections?client_id={cid}", headers=_tok(tenant="s25_sec"))
    assert r.status_code == 200, r.text
    v = r.json()["value"]
    assert v["client_name"] == "Acme Corp"
    ids = [s["id"] for s in v["sections"]]
    assert "executive_summary" in ids and "placement_recommendation" in ids
    assert all(set(["id", "title", "status", "readiness"]).issubset(s) for s in v["sections"])
    assert v["verdict"] in ("ready", "ready_caveated", "ready_directional", "not_ready")


# ---- preview builds a governed pack -----------------------------------------
def test_preview_builds_governed_pack(db):
    cid = _seed(db, "s25_pv")
    d = c.get(f"/exports/client-pack/preview?client_id={cid}", headers=_tok(tenant="s25_pv")).json()
    v = d["value"]
    order = v["section_order"]
    assert order[0] == "cover" and order[-1] == "data_quality_appendix"
    assert "executive_summary" in order and len(v["sections"]) == len(order)
    # every section carries the governed envelope shape
    for s in v["sections"]:
        assert set(["id", "title", "status", "readiness", "headline", "kpis", "caveats",
                    "source_tables", "confidence", "evidence"]).issubset(s)
    assert "formula" in d and d["data_quality_status"] in ("Analytics Ready", "Conditional", "Restricted", "No Data")


def test_missing_data_renders_not_available(db):
    # a client with no canonical data -> content sections are Not available (No Data), not zeros
    cid = _seed(db, "s25_na")
    other = f"{cid}_ghost"
    # request a real tenant but a client with no rows: scope allows (analyst), sections No Data
    d = c.get(f"/exports/client-pack/preview?client_id={other}", headers=_tok(tenant="s25_na")).json()
    exec_s = next(s for s in d["value"]["sections"] if s["id"] == "executive_summary")
    # governed No-Data: section flagged No Data and "Not available" surfaced in the headline
    assert exec_s["status"] == "No Data" and "not available" in exec_s["headline"].lower()
    assert d["value"]["pack_status"] == "No Data"


# ---- min-band-gated pack trust ----------------------------------------------
def test_restricted_section_stamps_pack_directional(db):
    cid = _seed(db, "s25_rx", restricted=True)
    d = c.get(f"/exports/client-pack/preview?client_id={cid}", headers=_tok(tenant="s25_rx")).json()
    assert d["value"]["pack_status"] == "Restricted" and d["value"]["directional"] is True
    assert d["advisory_blocked"] is True
    assert any("directional" in x.lower() for x in d["caveats"])
    cover = next(s for s in d["value"]["sections"] if s["id"] == "cover")
    assert any("directional" in x.lower() for x in cover["caveats"])


def test_healthy_pack_not_directional(db):
    cid = _seed(db, "s25_ok", restricted=False)
    d = c.get(f"/exports/client-pack/preview?client_id={cid}", headers=_tok(tenant="s25_ok")).json()
    assert d["value"]["directional"] is False and d["value"]["pack_status"] != "Restricted"


# ---- generate writes exactly one EXPORT audit; preview writes none ----------
def _export_events(db, tenant, cid):
    return db.query(AuditLog).filter(AuditLog.tenant_id == tenant, AuditLog.action == "EXPORT",
                                     AuditLog.entity_id == cid).count()


def test_preview_writes_no_audit_generate_writes_one(db):
    tenant = "s25_aud"
    cid = _seed(db, tenant)
    h = _tok(tenant=tenant)
    c.get(f"/exports/client-pack/preview?client_id={cid}", headers=h)
    assert _export_events(db, tenant, cid) == 0            # preview is a pure read
    r = c.post(f"/exports/client-pack/generate?client_id={cid}", headers=h)
    assert r.status_code == 200 and r.json()["audit"]["recorded"] is True
    assert _export_events(db, tenant, cid) == 1            # exactly one EXPORT event
    row = db.query(AuditLog).filter(AuditLog.tenant_id == tenant, AuditLog.action == "EXPORT",
                                    AuditLog.entity_id == cid).first()
    assert row.entity_type == "client_pack" and "sections" in row.meta


# ---- required params / auth / isolation / scoping ---------------------------
def test_client_id_required(db):
    assert c.get("/exports/client-pack/preview", headers=_tok(tenant="s25_req")).status_code == 422


def test_endpoints_require_auth(db):
    assert c.get("/exports/client-pack/preview?client_id=x").status_code == 401
    assert c.get("/exports/client-pack/sections?client_id=x").status_code == 401
    assert c.post("/exports/client-pack/generate?client_id=x").status_code == 401


def test_tenant_isolation(db):
    _seed(db, "s25_ti")
    d = c.get("/exports/client-pack/preview?client_id=s25_ti_C1", headers=_tok(tenant="s25_other")).json()
    # different tenant sees no governed data for that client -> No Data pack
    assert d["data_quality_status"] == "No Data"
    exec_s = next(s for s in d["value"]["sections"] if s["id"] == "executive_summary")
    assert exec_s["status"] == "No Data"


def test_client_scoping_foreign_client_403(db):
    cid = _seed(db, "s25_sc")
    admin = {"Authorization": f"Bearer {c.post('/auth/token', json={'username':'a','tenant_id':'s25_sc','role':'admin'}).json()['access_token']}"}
    r = c.post("/admin/users", headers=admin, json={
        "email": "hr.s25@x.local", "username": "hr", "user_role": "client_hr_viewer", "client_ids": [cid]})
    tok = c.post("/auth/login", json={"email": "hr.s25@x.local", "password": r.json()["temporary_password"]}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    assert c.get(f"/exports/client-pack/preview?client_id={cid}", headers=h).status_code == 200
    assert c.get("/exports/client-pack/preview?client_id=s25_sc_OTHER", headers=h).status_code == 403


# ---- no raw rows / no PII shape ---------------------------------------------
def test_no_raw_rows_or_pii_in_payload(db):
    cid = _seed(db, "s25_pii")
    blob = json.dumps(c.get(f"/exports/client-pack/preview?client_id={cid}", headers=_tok(tenant="s25_pii")).json())
    for forbidden in ("member_reference_key", "claim_number", f"{cid}_E1", "raw_row_index", "sha256"):
        assert forbidden not in blob


# ---- migration guard --------------------------------------------------------
def test_alembic_head_unchanged_sprint25():
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
