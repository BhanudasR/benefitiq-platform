"""Sprint 21 — Demographics + SI Utilization governed metrics (read-only aggregation over
canonical member/policy/claim; no migration).

Covers: demographic aggregation (age bands, senior>=60, gender, relationship, employee/
dependent, average age), missing-age/gender caveats, gender=null when absent; SI bands,
backend utilization, exhausted/high counts, under/over-insured signals, unlinked-claim and
missing-SI caveats, family-floater availability; auth, tenant isolation, Sprint-14 client
scoping, evidence for both + 404, and the Alembic head unchanged.
"""
import itertools
import os
import re
from fastapi.testclient import TestClient

from app.main import app
from app.models.governance import DatasetVersion
from app.models.canonical import MemberMaster, Claim, PolicyMaster

c = TestClient(app)
_cn = itertools.count(1)


def _tok(role="analyst", tenant="s21_api"):
    r = c.post("/auth/token", json={"username": "u", "tenant_id": tenant, "role": role})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _dv(db, tenant):
    dvid = f"dv_{tenant}"
    if not db.query(DatasetVersion).filter(DatasetVersion.id == dvid).first():
        db.add(DatasetVersion(id=dvid, tenant_id=tenant, upload_batch_id="b", status="ACTIVE")); db.flush()
    return dvid


def _mem(db, tenant, key, age, gender, rel, si):
    db.add(MemberMaster(tenant_id=tenant, dataset_version_id=_dv(db, tenant), upload_batch_id="b",
                        raw_file_id="r", raw_row_index=0, policy_number="POL1", member_reference_key=key,
                        age=age, gender=gender, relationship=rel, sum_insured=si, policy_year=2026))


def _clm(db, tenant, key, paid):
    db.add(Claim(tenant_id=tenant, dataset_version_id=_dv(db, tenant), upload_batch_id="b", raw_file_id="r",
                 raw_row_index=0, member_reference_key=key, policy_number="POL1", claim_number=f"C{next(_cn)}",
                 total_claim_paid=paid, outstanding_amount=0, policy_year=2026))


def _seed(db, tenant, floater=True):
    _mem(db, tenant, "E1", 65, "Male", "Self", 500000)
    _mem(db, tenant, "E2", 40, "Female", "Self", 500000)
    _mem(db, tenant, "D1", 12, "Male", "Son", 500000)
    _mem(db, tenant, "D2", 38, "Female", "Spouse", 500000)
    _mem(db, tenant, "N1", None, None, "Self", None)          # missing age + gender + SI
    _clm(db, tenant, "E1", 600000)      # utilization 1.2 -> exhausted
    _clm(db, tenant, "E2", 100000)      # utilization 0.2
    _clm(db, tenant, "ZZ", 50000)       # unlinked (no such member)
    db.add(PolicyMaster(tenant_id=tenant, dataset_version_id=_dv(db, tenant), upload_batch_id="b",
                        raw_file_id="r", raw_row_index=0, policy_number="POL1",
                        corporate_floater_sum_insured=(1000000 if floater else None)))
    db.commit()


def _walk(o):
    if isinstance(o, dict):
        for k, v in o.items():
            yield str(k); yield from _walk(v)
    elif isinstance(o, list):
        for v in o:
            yield from _walk(v)
    elif isinstance(o, str):
        yield o


# ---- Demographics -----------------------------------------------------------
def test_demographics_aggregation(db):
    _seed(db, "s21_demo")
    r = c.get("/metrics/demographics", headers=_tok(tenant="s21_demo"))
    assert r.status_code == 200, r.text
    v = r.json()["value"]
    assert v["member_count"] == 5
    assert v["senior_count"] == 1 and v["senior_share"] == 0.25 and v["senior_definition_age"] == 60
    assert v["average_age"] == 38.8
    assert v["employee_count"] == 3 and v["dependent_count"] == 2 and v["dependent_ratio"] == 0.6667
    bands = {b["band"]: b["count"] for b in v["age_bands"]}
    assert bands["0-17"] == 1 and bands["36-45"] == 2 and bands["60+"] == 1
    assert v["missing_age"] == 1 and v["missing_gender"] == 1


def test_demographics_gender_distribution_present(db):
    _seed(db, "s21_gender")
    v = c.get("/metrics/demographics", headers=_tok(tenant="s21_gender")).json()["value"]
    g = {x["key"]: x["count"] for x in v["gender_distribution"]}
    assert g["Male"] == 2 and g["Female"] == 2


def test_demographics_gender_none_when_absent(db):
    # only members without gender -> distribution is null (UI shows "Not available")
    _dv(db, "s21_nogender")
    _mem(db, "s21_nogender", "A", 30, None, "Self", 500000)
    _mem(db, "s21_nogender", "B", 45, "", "Spouse", 500000)
    db.commit()
    v = c.get("/metrics/demographics", headers=_tok(tenant="s21_nogender")).json()["value"]
    assert v["gender_distribution"] is None
    assert v["missing_gender"] == 2


def test_demographics_missing_age_caveated(db):
    _seed(db, "s21_ma")
    body = c.get("/metrics/demographics", headers=_tok(tenant="s21_ma")).json()
    assert any("no age" in cav.lower() for cav in body["caveats"])
    assert any("no dob inference" in cav.lower() or "no gender" in cav.lower() for cav in body["caveats"])


# ---- SI Utilization ---------------------------------------------------------
def test_si_utilization_bands_and_signals(db):
    _seed(db, "s21_si")
    r = c.get("/metrics/si-utilization", headers=_tok(tenant="s21_si"))
    assert r.status_code == 200, r.text
    v = r.json()["value"]
    assert v["member_count"] == 5 and v["missing_si"] == 1 and v["unlinked_claims"] == 1
    assert v["average_utilization"] == 0.35
    assert v["exhausted_count"] == 1 and v["exhausted_share"] == 0.25
    assert v["high_utilization_count"] == 1 and v["underinsured_signal_count"] == 1
    assert v["overinsured_signal_count"] == 2          # D1, D2 at 0% utilization
    assert v["family_floater_available"] is True
    si = {b["band"]: b["count"] for b in v["si_bands"]}
    assert si["5-10L"] == 4
    util = {b["band"]: b["count"] for b in v["utilization_bands"]}
    assert util[">=100% (exhausted)"] == 1 and util["0%"] == 2


def test_si_utilization_caveats(db):
    _seed(db, "s21_sicav")
    body = c.get("/metrics/si-utilization", headers=_tok(tenant="s21_sicav")).json()
    assert any("could not be linked" in cav.lower() for cav in body["caveats"])       # unlinked
    assert any("no sum insured" in cav.lower() for cav in body["caveats"])              # missing SI
    assert any("signals only" in cav.lower() for cav in body["caveats"])               # signal wording


def test_family_floater_not_available(db):
    _seed(db, "s21_nofloat", floater=False)
    v = c.get("/metrics/si-utilization", headers=_tok(tenant="s21_nofloat")).json()["value"]
    assert v["family_floater_available"] is False


# ---- no member-level PII ----------------------------------------------------
def test_si_utilization_has_no_member_level_rows(db):
    _seed(db, "s21_pii")
    v = c.get("/metrics/si-utilization", headers=_tok(tenant="s21_pii")).json()["value"]
    blob = " ".join(_walk(v))
    for key in ("E1", "E2", "D1", "D2", "member_reference_key"):
        assert key not in blob, f"member identifier '{key}' leaked into SI utilization output"


# ---- auth / isolation / scoping / evidence ---------------------------------
def test_endpoints_require_auth(db):
    assert c.get("/metrics/demographics").status_code == 401
    assert c.get("/metrics/si-utilization").status_code == 401


def test_tenant_isolation(db):
    _seed(db, "s21_ta")
    other = c.get("/metrics/demographics", headers=_tok(tenant="s21_tb")).json()
    assert other["value"]["member_count"] == 0 and other["data_quality_status"] == "No Data"


def test_client_scoping_enforced(db):
    _seed(db, "s21_scope")
    admin = {"Authorization": f"Bearer {c.post('/auth/token', json={'username':'a','tenant_id':'s21_scope','role':'admin'}).json()['access_token']}"}
    r = c.post("/admin/users", headers=admin, json={"email": "hr.s21@x.local", "username": "hr", "user_role": "client_hr_viewer", "client_ids": ["CL1"]})
    tok = c.post("/auth/login", json={"email": "hr.s21@x.local", "password": r.json()["temporary_password"]}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    # no client_id and multiple/none assigned resolution => scoped; a mismatching client is forbidden
    assert c.get("/metrics/demographics?client_id=CL2", headers=h).status_code == 403
    assert c.get("/metrics/demographics?client_id=CL1", headers=h).status_code == 200


def test_evidence_for_both_metrics(db):
    _seed(db, "s21_ev")
    h = _tok(tenant="s21_ev")
    ed = c.get("/metrics/evidence/demographics", headers=h)
    assert ed.status_code == 200 and ed.json()["metric"] == "demographics" and "formula" in ed.json()
    es = c.get("/metrics/evidence/si-utilization", headers=h)
    assert es.status_code == 200 and es.json()["metric"] == "si_utilization"
    assert c.get("/metrics/evidence/bogus", headers=h).status_code == 404


# ---- Alembic head unchanged (no migration this sprint) ---------------------
def test_alembic_head_unchanged_sprint21():
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
    assert heads == ["a3d7e9f1c2b4"], heads     # unchanged from Sprint 17
    assert len([r for r, d in downs.items() if d is None]) == 1
