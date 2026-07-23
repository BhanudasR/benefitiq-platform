"""Sprint 24 — Source Evidence / Data Quality trust dashboard (read-only evidence composition).

Covers: overview rollup; MIN-BAND-GATES headline (worst active dataset band wins — a healthy
policy dataset cannot mask a Restricted claims dataset); records-weighted DQ shown as the
secondary score; per-dataset scoring evidence; issue severity split ERROR/WARNING/INFO; affected
records/fields; quarantined subset; module readiness from EVIDENCE_MODULE_MAP; file->batch->version
lineage; evidence reconciliation with DQResult.components; evidence 404; auth 401; tenant isolation;
client scoping (Client HR Viewer auto-scoped; foreign client_id -> 403); Alembic head unchanged.

Test-data note: ClientMaster.client_id is globally unique and RawFile.client_id is the per-file
client tag, so each test namespaces its client ids by tenant to stay isolated.
"""
import datetime
import itertools
import os
import re
from fastapi.testclient import TestClient

from app.main import app
from app.models.governance import (RawFile, UploadBatch, DatasetVersion, DQResult,
                                    ValidationIssue, MappingAudit)
from app.models.canonical import ClientMaster

c = TestClient(app)
_n = itertools.count(1)
NOW = datetime.datetime.utcnow()


def _tok(role="analyst", tenant="s24_api"):
    r = c.post("/auth/token", json={"username": "u", "tenant_id": tenant, "role": role})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _components(overall, rows, caveat):
    """Two-component DQ breakdown that RECONCILES to `overall` (sum of weighted_points == overall)
    and carries the row total in business_rule_validation.evidence.rows (records weighting)."""
    return [
        {"name": "business_rule_validation", "weight": 0.15, "fraction": 0.9,
         "weighted_points": round(overall - 5, 2), "evidence": {"rows": rows}, "caveats": []},
        {"name": "mandatory_completeness", "weight": 0.25, "fraction": 0.8,
         "weighted_points": 5.0, "evidence": {"cells": rows * 3, "filled": rows * 2},
         "caveats": ([caveat] if caveat else [])},
    ]


def _dataset(db, tenant, client_id, file_kind, *, readiness, dq, rows, restricted=False,
             status="ACTIVE", caveat=None):
    rf = RawFile(tenant_id=tenant, client_id=client_id, file_kind=file_kind,
                 file_name=f"{file_kind}_{next(_n)}.xlsx", storage_key=f"k{next(_n)}",
                 sha256=f"{file_kind}{next(_n):0>60}", size_bytes=2048, uploaded_by="u")
    db.add(rf); db.flush()
    b = UploadBatch(tenant_id=tenant, raw_file_id=rf.id, file_kind=file_kind, status="LOADED")
    db.add(b); db.flush()
    dqr = DQResult(tenant_id=tenant, upload_batch_id=b.id, overall_score=dq, readiness=readiness,
                   components=_components(dq, rows, caveat))
    db.add(dqr); db.flush()
    dv = DatasetVersion(tenant_id=tenant, upload_batch_id=b.id, version_no=1, status=status,
                        dq_score=dq, dq_result_id=dqr.id, readiness_status=readiness,
                        restricted=restricted, approved_by="rev", activated_by="adm",
                        activated_at=NOW)
    db.add(dv); db.flush()
    return rf, b, dv, dqr


def _seed(db, tenant):
    """Seed one client (c1) with a healthy policy dataset (DQ 90, 100 rows) and a Restricted
    claims dataset (DQ 60, 50 rows) + validation issues + mapping audits. Returns (c1, c2) where
    c2 is a second client used only for client-scoping tests."""
    c1, c2 = f"{tenant}_C1", f"{tenant}_C2"

    _, _, pol_dv, _ = _dataset(db, tenant, c1, "policy", readiness="Analytics Ready", dq=90.0, rows=100)
    _, claims_b, _, _ = _dataset(db, tenant, c1, "claims", readiness="Not Reliable", dq=60.0,
                                 rows=50, restricted=True, caveat="12 mandatory cell(s) empty")

    db.add(ClientMaster(tenant_id=tenant, dataset_version_id=pol_dv.id, upload_batch_id=pol_dv.upload_batch_id,
                        raw_file_id="r", raw_row_index=0, client_id=c1, client_name="Acme Corp"))

    # validation issues on the claims batch: 2 critical (ERROR), 1 warning, 1 info; one quarantined
    for sev, field, rule, row, quar in [
        ("ERROR", "total_claim_paid", "paid_exceeds_claimed", 3, True),
        ("ERROR", "member_reference_key", "invalid_type", 4, False),
        ("WARNING", "diagnosis_code_l1", "unmapped_value", 5, False),
        ("INFO", "claim_status", "info_note", 6, False),
    ]:
        db.add(ValidationIssue(tenant_id=tenant, upload_batch_id=claims_b.id, raw_row_index=row,
                               severity=sev, field=field, rule=rule, message=f"{rule} @ {field}",
                               quarantined=quar))

    # mapping audits (confidence for the mapping-confidence KPI)
    db.add(MappingAudit(tenant_id=tenant, upload_batch_id=claims_b.id, raw_column="Paid Amt",
                        selected_canonical="total_claim_paid", confidence_before=0.92,
                        decision="map", actor="rev"))
    db.add(MappingAudit(tenant_id=tenant, upload_batch_id=claims_b.id, raw_column="Junk",
                        selected_canonical=None, confidence_before=0.30, decision="ignore", actor="rev"))

    # second client c1-independent dataset for scoping tests
    _dataset(db, tenant, c2, "policy", readiness="Analytics Ready", dq=88.0, rows=20)
    db.add(ClientMaster(tenant_id=tenant, dataset_version_id=pol_dv.id, upload_batch_id=pol_dv.upload_batch_id,
                        raw_file_id="r", raw_row_index=1, client_id=c2, client_name="Beta Ltd"))
    db.commit()
    return c1, c2


# ---- overview + min-band gating + weighted secondary -------------------------
def test_overview_rollup_and_min_band_gating(db):
    _seed(db, "s24_ov")
    r = c.get("/data-quality/overview", headers=_tok(tenant="s24_ov"))
    assert r.status_code == 200, r.text
    d = r.json()
    v = d["value"]
    # min-band-gates: Restricted claims dataset gates the headline even though policy is Ready
    assert v["headline_readiness"] == "Restricted"
    assert d["data_quality_status"] == "Restricted" and d["advisory_blocked"] is True
    assert v["active_dataset_count"] == 3          # 2 for c1 + 1 for c2
    # records-weighted secondary across c1(90/100)+c2(88/20)+claims(60/50)
    assert v["weight_basis"] == "records"
    assert v["weighted_dq_score"] == round((90 * 100 + 60 * 50 + 88 * 20) / 170, 2)
    assert "policy" in v["gating_reason"] or "claims" in v["gating_reason"]
    assert v["issues"]["critical"] == 2 and v["issues"]["warning"] == 1 and v["issues"]["info"] == 1
    assert v["issues"]["affected_records"] == 4 and v["issues"]["quarantined"] == 1
    assert v["mapping"]["avg_confidence"] == round((0.92 + 0.30) / 2, 4)
    assert any(x["file_kind"] == "claims" for x in v["restricted_or_blocked"])


def test_dataset_scores_evidence_present(db):
    _seed(db, "s24_ds")
    v = c.get("/data-quality/overview", headers=_tok(tenant="s24_ds")).json()["value"]
    kinds = {s["file_kind"]: s for s in v["dataset_scores"]}
    assert kinds["claims"]["dq_score"] == 60.0 and kinds["claims"]["readiness"] == "Restricted"
    assert kinds["claims"]["record_count"] == 50
    assert kinds["policy"]["readiness"] == "Analytics Ready"


# ---- issues -----------------------------------------------------------------
def test_issue_severity_split_and_affected(db):
    _seed(db, "s24_is")
    v = c.get("/data-quality/issues", headers=_tok(tenant="s24_is")).json()["value"]
    assert v["severity_split"] == {"critical": 2, "warning": 1, "info": 1}
    assert v["affected_records"] == 4 and v["affected_field_count"] == 4
    assert v["quarantined"]["records"] == 1
    rules = {r["rule"] for r in v["by_rule"]}
    assert "paid_exceeds_claimed" in rules
    # affected fields carry the modules they impact (claims -> ICR etc via EVIDENCE_MODULE_MAP)
    paid = next(f for f in v["affected_fields"] if f["field"] == "total_claim_paid")
    assert "ICR" in paid["modules_impacted"]


def test_issue_severity_filter(db):
    _seed(db, "s24_isf")
    v = c.get("/data-quality/issues?severity=ERROR", headers=_tok(tenant="s24_isf")).json()["value"]
    assert v["severity_split"] == {"critical": 2, "warning": 0, "info": 0}


# ---- module readiness -------------------------------------------------------
def test_module_readiness_from_map(db):
    _seed(db, "s24_mr")
    v = c.get("/data-quality/module-readiness", headers=_tok(tenant="s24_mr")).json()["value"]
    mods = {m["module"]: m for m in v["modules"]}
    # claims-driven modules inherit the Restricted claims dataset
    assert mods["ICR"]["readiness"] == "Restricted" and mods["ICR"]["source_file_kind"] == "claims"
    assert mods["Claims"]["restricted"] is True
    # policy-driven modules inherit the healthy policy dataset
    assert mods["Broker Portfolio"]["readiness"] == "Analytics Ready"
    # member/terms have no active dataset -> Not available (No Data)
    assert mods["Demographics"]["readiness"] == "No Data"
    assert mods["Benefits & Benchmarking"]["readiness"] == "No Data"
    # wellness has no dedicated dataset -> advisory fallback to claims
    assert mods["Wellness Intelligence"]["advisory_fallback"] is True
    assert mods["Wellness Intelligence"]["source_file_kind"] == "claims"


# ---- lineage ----------------------------------------------------------------
def test_lineage_chain(db):
    _seed(db, "s24_ln")
    v = c.get("/data-quality/lineage", headers=_tok(tenant="s24_ln")).json()["value"]
    assert v["file_count"] == 3 and v["active_count"] == 3 and v["immutable_raw"] is True
    f = v["files"][0]
    assert f["batch_id"] and f["dataset_version_id"] and f["sha256_short"]
    assert set(v["kinds"]) == {"policy", "claims"}


# ---- evidence reconciliation + 404 ------------------------------------------
def test_evidence_reconciles_with_components(db):
    _seed(db, "s24_ev")
    d = c.get("/data-quality/evidence/overview", headers=_tok(tenant="s24_ev")).json()
    assert d["value"]["reconciles_all"] is True
    claims = next(x for x in d["value"]["datasets"] if x["file_kind"] == "claims")
    assert claims["overall_score"] == 60.0 and claims["sum_weighted_points"] == 60.0
    assert claims["reconciles"] is True


def test_evidence_unknown_kind_404(db):
    _seed(db, "s24_e404")
    assert c.get("/data-quality/evidence/bogus", headers=_tok(tenant="s24_e404")).status_code == 404


# ---- auth / isolation / scoping ---------------------------------------------
def test_endpoints_require_auth(db):
    assert c.get("/data-quality/overview").status_code == 401
    assert c.get("/data-quality/issues").status_code == 401
    assert c.get("/data-quality/module-readiness").status_code == 401
    assert c.get("/data-quality/lineage").status_code == 401


def test_tenant_isolation(db):
    _seed(db, "s24_ta")
    other = c.get("/data-quality/overview", headers=_tok(tenant="s24_tb")).json()
    assert other["value"]["active_dataset_count"] == 0 and other["data_quality_status"] == "No Data"


def test_client_scoping(db):
    c1, c2 = _seed(db, "s24_sc")
    admin = {"Authorization": f"Bearer {c.post('/auth/token', json={'username':'a','tenant_id':'s24_sc','role':'admin'}).json()['access_token']}"}
    r = c.post("/admin/users", headers=admin, json={
        "email": "hr.s24@x.local", "username": "hr", "user_role": "client_hr_viewer", "client_ids": [c1]})
    tok = c.post("/auth/login", json={"email": "hr.s24@x.local", "password": r.json()["temporary_password"]}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    # HR Viewer's overview auto-scoped to c1 -> only c1's 2 datasets (not c2's)
    v = c.get("/data-quality/overview", headers=h).json()["value"]
    assert v["active_dataset_count"] == 2
    # and they cannot read another client's evidence
    assert c.get("/data-quality/overview?client_id=" + c2, headers=h).status_code == 403


# ---- migration guard --------------------------------------------------------
def test_alembic_head_unchanged_sprint24():
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
