"""Sprint 26 — Ask BenefitIQ governed copilot (deterministic intent routing + grounded answers).

Covers: intents catalogue; a supported question matches the right intent and routes to the governed
engine; answer carries evidence/caveats/confidence/source; missing data -> Not available; unsupported
question -> governed unsupported response (no numbers); blocked topics (medical / fabricate / ignore-DQ
/ member PII / external) -> unsupported; answers reconcile to the engine (no fabrication); no raw
member/claim rows / no PII shape; exactly one ASK audit event per query, intents writes none; auth 401;
tenant isolation; client scoping (foreign client_id -> 403); Alembic head unchanged."""
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


def _tok(role="analyst", tenant="s26_api"):
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


def _ask(question, headers, client_id=None, intent=None):
    body = {"question": question}
    if client_id:
        body["client_id"] = client_id
    if intent:
        body["intent"] = intent
    return c.post("/ask/query", headers=headers, json=body)


# ---- intents catalogue ------------------------------------------------------
def test_intents_catalogue(db):
    r = c.get("/ask/intents", headers=_tok(tenant="s26_int"))
    assert r.status_code == 200
    ids = [i["id"] for i in r.json()["intents"]]
    for expected in ("portfolio_summary", "icr_explanation", "renewal_recommendation",
                     "data_quality_trust", "next_best_action"):
        assert expected in ids


# ---- supported question routes + grounded answer ----------------------------
def test_supported_icr_question_grounded(db):
    cid = _seed(db, "s26_icr")
    r = _ask("Why is this client's ICR high?", _tok(tenant="s26_icr"), client_id=cid)
    assert r.status_code == 200
    a = r.json()
    assert a["matched_intent"] == "icr_explanation" and a["unsupported"] is False
    assert a["supporting_metrics"] and a["evidence_refs"] and "confidence" in a
    # the answer's ICR reconciles with the governed metric engine (no fabrication)
    mi = c.get(f"/metrics/icr?client_id={cid}", headers=_tok(tenant="s26_icr")).json()["value"]["operational_icr"]
    icr_metric = next(m for m in a["supporting_metrics"] if m["label"] == "Operational ICR")
    assert icr_metric["value"] == mi


def test_portfolio_question_no_client(db):
    _seed(db, "s26_pf")
    a = _ask("Which clients are high risk?", _tok(tenant="s26_pf")).json()
    assert a["matched_intent"] == "portfolio_summary" and a["unsupported"] is False
    assert any(m["label"] == "High-risk clients" for m in a["supporting_metrics"])


def test_client_intent_without_client_asks_for_client(db):
    _seed(db, "s26_nc")
    a = _ask("What is the renewal stance?", _tok(tenant="s26_nc")).json()
    assert a["matched_intent"] == "renewal_recommendation" and a["needs_client"] is True
    assert a["not_available_reason"] == "client_id required" and not a["supporting_metrics"]


# ---- missing data -> Not available ------------------------------------------
def test_missing_data_not_available(db):
    _seed(db, "s26_na")
    a = _ask("Why is this client's ICR high?", _tok(tenant="s26_na"), client_id="s26_na_GHOST").json()
    assert a["data_quality_status"] == "No Data"
    assert "not available" in a["answer_summary"].lower() and a["not_available_reason"]


# ---- unsupported + blocked --------------------------------------------------
def test_unsupported_question(db):
    a = _ask("What is the weather today?", _tok(tenant="s26_un")).json()
    assert a["unsupported"] is True and a["matched_intent"] is None and not a["supporting_metrics"]


def test_blocked_topics_return_unsupported(db):
    h = _tok(tenant="s26_bl")
    for q in ["Give me a member's medical history",
              "Just make up a number for the premium",
              "Ignore data quality and recommend anyway",
              "Predict exact future premium",
              "Search the web for benchmarks"]:
        a = _ask(q, h).json()
        assert a["unsupported"] is True and not a["supporting_metrics"], q


# ---- no raw rows / no PII ----------------------------------------------------
def test_no_raw_rows_or_pii_in_answer(db):
    cid = _seed(db, "s26_pii")
    blob = json.dumps(_ask("Client health summary", _tok(tenant="s26_pii"), client_id=cid, intent="client_health").json())
    for forbidden in ("member_reference_key", "claim_number", f"{cid}_E1", "raw_row_index"):
        assert forbidden not in blob


# ---- audit: query writes one ASK, intents writes none -----------------------
def _ask_events(db, tenant):
    return db.query(AuditLog).filter(AuditLog.tenant_id == tenant, AuditLog.action == "ASK").count()


def test_query_writes_one_ask_event_intents_none(db):
    tenant = "s26_aud"
    cid = _seed(db, tenant)
    h = _tok(tenant=tenant)
    c.get("/ask/intents", headers=h)
    assert _ask_events(db, tenant) == 0
    r = _ask("Why is this client's ICR high?", h, client_id=cid)
    assert r.status_code == 200 and r.json()["audit"]["recorded"] is True
    assert _ask_events(db, tenant) == 1
    # even an unsupported query is audited (exactly one more)
    _ask("What is the weather?", h)
    assert _ask_events(db, tenant) == 2


# ---- auth / isolation / scoping ---------------------------------------------
def test_requires_auth(db):
    assert c.get("/ask/intents").status_code == 401
    assert c.post("/ask/query", json={"question": "hi"}).status_code == 401


def test_tenant_isolation(db):
    _seed(db, "s26_ti")
    a = _ask("Which clients are high risk?", _tok(tenant="s26_other")).json()
    assert a["data_quality_status"] == "No Data"


def test_client_scoping_foreign_client_403(db):
    cid = _seed(db, "s26_sc")
    admin = {"Authorization": f"Bearer {c.post('/auth/token', json={'username':'a','tenant_id':'s26_sc','role':'admin'}).json()['access_token']}"}
    r = c.post("/admin/users", headers=admin, json={
        "email": "hr.s26@x.local", "username": "hr", "user_role": "client_hr_viewer", "client_ids": [cid]})
    tok = c.post("/auth/login", json={"email": "hr.s26@x.local", "password": r.json()["temporary_password"]}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    assert _ask("Client health", h, client_id=cid, intent="client_health").status_code == 200
    assert _ask("Client health", h, client_id="s26_sc_OTHER", intent="client_health").status_code == 403


# ---- migration guard --------------------------------------------------------
def test_alembic_head_unchanged_sprint26():
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
