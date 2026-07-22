"""Sprint 22 — Settlement + Maternity + Rejection governed claim metrics (read-only; no
migration).

Covers: settlement status/paid/outstanding/closed-open/cashless-reimbursement/partial/
deduction + TAT Not-available; conservative maternity identification (keyword + ICD-O), non-
maternity excluded, missing-diagnosis caveated, normal/C-section split, limit/newborn from
confirmed terms only; rejection = Repudiated only with ratio/amount/by-type and reasons/
wrongful Not-available; auth, tenant isolation, client scoping, evidence for all three + 404,
Alembic head unchanged.
"""
import itertools
import os
import re
from fastapi.testclient import TestClient

from app.main import app
from app.models.governance import DatasetVersion
from app.models.canonical import Claim, ClaimBillComponent, BenefitTerm

c = TestClient(app)
_cn = itertools.count(1)


def _tok(role="analyst", tenant="s22_api"):
    r = c.post("/auth/token", json={"username": "u", "tenant_id": tenant, "role": role})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _dv(db, tenant):
    dvid = f"dv_{tenant}"
    if not db.query(DatasetVersion).filter(DatasetVersion.id == dvid).first():
        db.add(DatasetVersion(id=dvid, tenant_id=tenant, upload_batch_id="b", status="ACTIVE")); db.flush()
    return dvid


def _clm(db, tenant, status, paid, out, ctype, dx, claimed=None, bill=False):
    num = f"CL{next(_cn)}"
    db.add(Claim(tenant_id=tenant, dataset_version_id=_dv(db, tenant), upload_batch_id="b", raw_file_id="r",
                 raw_row_index=0, policy_number="POL1", claim_number=num, claim_status=status,
                 total_claim_paid=paid, outstanding_amount=out, total_amount_claimed=claimed,
                 claim_type=ctype, diagnosis_code_l1=dx, bill_breakup_available=bill, policy_year=2026))
    return num


def _seed(db, tenant, term=True):
    _clm(db, tenant, "Settled Fully", 100000, 0, "Cashless", "Cardiac")
    n2 = _clm(db, tenant, "Settled Partially", 80000, 20000, "Reimbursement", "Ortho", bill=True)
    _clm(db, tenant, "Under Process", 0, 50000, "Cashless", "Maternity - Normal Delivery")
    _clm(db, tenant, "Repudiated", 0, 0, "Reimbursement", "Fraud", claimed=40000)
    _clm(db, tenant, "Settled Fully", 60000, 0, "Reimbursement", "O82 Caesarean")   # ICD-O + C-section
    _clm(db, tenant, "Settled Fully", 30000, 0, "Cashless", "")                       # no diagnosis
    db.add(ClaimBillComponent(tenant_id=tenant, dataset_version_id=_dv(db, tenant), upload_batch_id="b",
                              raw_file_id="r", raw_row_index=0, claim_number=n2, component="deduction",
                              deduction_amount=5000))
    if term:
        db.add(BenefitTerm(tenant_id=tenant, dataset_version_id=_dv(db, tenant), upload_batch_id="b",
                           raw_file_id="r", raw_row_index=0, policy_number="POL1", term_type="maternity_limit",
                           value=50000, status="confirmed", method="manual"))
    db.commit()


# ---- Settlement -------------------------------------------------------------
def test_settlement_aggregation_and_tat_not_available(db):
    _seed(db, "s22_se")
    r = c.get("/metrics/settlement", headers=_tok(tenant="s22_se"))
    assert r.status_code == 200, r.text
    v = r.json()["value"]
    assert v["claim_count"] == 6 and v["paid"] == 270000.0 and v["outstanding"] == 70000.0
    assert v["closed_count"] == 5 and v["open_count"] == 1
    assert v["cashless_count"] == 3 and v["reimbursement_count"] == 3
    assert v["settled_fully_count"] == 3 and v["settled_partially_count"] == 1 and v["repudiated_count"] == 1
    assert v["deduction_amount"] == 5000.0 and v["bill_breakup_claims"] == 1
    assert v["tat"]["available"] is False
    assert "Date_of_Payment" in v["tat"]["reason"]


def test_settlement_deduction_not_available_without_bill_breakup(db):
    _dv(db, "s22_nobill")
    _clm(db, "s22_nobill", "Settled Fully", 100000, 0, "Cashless", "Cardiac")
    db.commit()
    v = c.get("/metrics/settlement", headers=_tok(tenant="s22_nobill")).json()["value"]
    assert v["deduction_amount"] is None


# ---- Maternity --------------------------------------------------------------
def test_maternity_identification_and_split(db):
    _seed(db, "s22_ma")
    v = c.get("/metrics/maternity", headers=_tok(tenant="s22_ma")).json()["value"]
    assert v["maternity_claim_count"] == 2            # "Maternity - Normal Delivery" + "O82 Caesarean"
    assert v["incurred"] == 110000.0 and v["average_claim_size"] == 55000.0
    assert v["split_available"] is True and v["normal_count"] == 1 and v["csection_count"] == 1
    assert v["maternity_limit"] == 50000.0            # confirmed benefit term
    assert v["newborn_cover"] is None                 # no confirmed term -> Not available
    assert v["excluded_no_diagnosis"] == 1


def test_maternity_excludes_non_maternity_and_caveats(db):
    _seed(db, "s22_maex")
    body = c.get("/metrics/maternity", headers=_tok(tenant="s22_maex")).json()
    # non-maternity diagnoses (Cardiac, Ortho, Fraud) are not counted
    assert body["value"]["maternity_claim_count"] == 2
    assert any("governed maternity keyword" in cav.lower() or "identified" in cav.lower() for cav in body["caveats"])
    assert any("no diagnosis" in cav.lower() for cav in body["caveats"])


def test_maternity_limit_only_from_confirmed_term(db):
    _seed(db, "s22_noterm", term=False)
    v = c.get("/metrics/maternity", headers=_tok(tenant="s22_noterm")).json()["value"]
    assert v["maternity_limit"] is None and v["newborn_cover"] is None


# ---- Rejection --------------------------------------------------------------
def test_rejection_repudiated_only(db):
    _seed(db, "s22_re")
    v = c.get("/metrics/rejection", headers=_tok(tenant="s22_re")).json()["value"]
    assert v["total_claims"] == 6 and v["rejection_count"] == 1
    assert v["rejection_amount"] == 40000.0 and v["rejection_ratio"] == 0.1667
    assert v["by_claim_type"] == [{"key": "Reimbursement", "count": 1}]
    assert v["top_reasons"] is None and v["wrongful_rejection"] is None


def test_rejection_reasons_not_available_caveated(db):
    _seed(db, "s22_recav")
    body = c.get("/metrics/rejection", headers=_tok(tenant="s22_recav")).json()
    assert any("no rejection-reason field" in cav.lower() for cav in body["caveats"])
    assert any("wrongful" in cav.lower() for cav in body["caveats"])


# ---- auth / isolation / scoping / evidence ---------------------------------
def test_endpoints_require_auth(db):
    for ep in ("settlement", "maternity", "rejection"):
        assert c.get(f"/metrics/{ep}").status_code == 401, ep


def test_tenant_isolation(db):
    _seed(db, "s22_ta")
    other = c.get("/metrics/settlement", headers=_tok(tenant="s22_tb")).json()
    assert other["value"]["claim_count"] == 0 and other["data_quality_status"] == "No Data"


def test_client_scoping_enforced(db):
    _seed(db, "s22_scope")
    admin = {"Authorization": f"Bearer {c.post('/auth/token', json={'username':'a','tenant_id':'s22_scope','role':'admin'}).json()['access_token']}"}
    r = c.post("/admin/users", headers=admin, json={"email": "hr.s22@x.local", "username": "hr", "user_role": "client_hr_viewer", "client_ids": ["CL1"]})
    tok = c.post("/auth/login", json={"email": "hr.s22@x.local", "password": r.json()["temporary_password"]}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    assert c.get("/metrics/maternity?client_id=CL2", headers=h).status_code == 403
    assert c.get("/metrics/maternity?client_id=CL1", headers=h).status_code == 200


def test_evidence_for_all_three(db):
    _seed(db, "s22_ev")
    h = _tok(tenant="s22_ev")
    for m in ("settlement", "maternity", "rejection"):
        e = c.get(f"/metrics/evidence/{m}", headers=h)
        assert e.status_code == 200 and e.json()["metric"] == m and "formula" in e.json()
    assert c.get("/metrics/evidence/bogus", headers=h).status_code == 404


def test_alembic_head_unchanged_sprint22():
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
    assert len([r for r, d in downs.items() if d is None]) == 1
