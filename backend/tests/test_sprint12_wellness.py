"""Sprint 12 — governed Wellness Intelligence engines.

Covers: WellnessConfig default + override, the diagnosis->category registry, the claim-
pattern opportunity scenarios (metabolic / cardiovascular / maternity / musculoskeletal /
mental / respiratory / oncology / unmapped), restricted-block / conditional-caveat /
missing-pending guardrails, ROI-as-estimate, k-anonymity suppression, cohort-level output,
tenant isolation, evidence reconciliation, no-raw-data, determinism, API smoke, and the
Alembic chain."""
import json
import os
import re
from fastapi.testclient import TestClient

from app.main import app
from app.services.metrics import claims as m_claims
from app.services.metrics.base import MetricContext
from app.services.wellness.base import WellnessContext, SRC_AILMENT, SRC_CLAIMS, SRC_RELATION, SRC_TRENDS
from app.services.wellness import overview as w_ov, opportunities as w_op, recommendations as w_rec, planner as w_pl, roi_impact as w_roi
from app.services.wellness.config import get_wellness_config, DEFAULTS
from app.services.wellness.registry import classify, meta
from app.models.governance import WellnessConfig
from tests.test_sprint4_metrics import _seed, POLICY, MEMBER, COND, CRIT, CLAIMS_H

c = TestClient(app)
GOVERNED = {SRC_AILMENT, SRC_CLAIMS, SRC_RELATION, SRC_TRENDS}


def _tok(role="analyst", tenant="wsp12_api"):
    r = c.post("/auth/token", json={"username": "u", "tenant_id": tenant, "role": role})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _claims(plan):
    """plan = [(diagnosis_code, count), ...] -> claims CSV bytes referencing MRK-1."""
    rows, n = [], 1
    for code, cnt in plan:
        for _ in range(cnt):
            rows.append(f"POL-1,CLM-{n},MRK-1,{code},Apollo,10-Jun-2025,12-Jun-2025,500000,120000,100000,0,0,1,Y")
            n += 1
    return (CLAIMS_H + "\n" + "\n".join(rows) + "\n").encode()


def _seed_wellness(db, tenant, plan):
    _seed(db, tenant, POLICY, "policy")
    _seed(db, tenant, MEMBER, "member")
    _seed(db, tenant, _claims(plan), "claims")


def _wctx(db, tenant, **f):
    return WellnessContext(db, tenant, f)


def _cat_ids(res):
    return {o["category_id"] for o in res["opportunities"]}


# ---- config -----------------------------------------------------------------
def test_wellness_config_default_fallback(db):
    cfg = get_wellness_config(db, "no-such-tenant")
    assert cfg["source"] == "default" and cfg["k_anonymity_min_cohort_size"] == 5
    for k in DEFAULTS:
        assert k in cfg


def test_wellness_config_tenant_override(db):
    db.add(WellnessConfig(tenant_id="wsp12_cfg", k_anonymity_min_cohort_size=8,
                          opportunity_min_share=0.10, config_version="v2-test"))
    db.commit()
    cfg = get_wellness_config(db, "wsp12_cfg")
    assert cfg["source"] == "tenant_config" and cfg["k_anonymity_min_cohort_size"] == 8
    assert cfg["opportunity_min_share"] == 0.10


# ---- registry (deterministic mapping) --------------------------------------
def test_registry_maps_categories():
    assert classify("E11") == "metabolic"
    assert classify("I10") == "cardiovascular" and classify("I20") == "cardiovascular"
    assert classify("O80") == "maternity" and classify("Z34") == "maternity"
    assert classify("M54") == "musculoskeletal"
    assert classify("F32") == "mental_wellbeing"
    assert classify("J45") == "respiratory"
    assert classify("C50") == "oncology"
    assert classify("R51") == "other"
    # keyword fallback for descriptive text; free-text must NOT trigger the ICD chapter rule
    assert classify("severe hypertension") == "cardiovascular"
    assert classify("Chest pain") == "other"
    assert meta("oncology")["careful"] is True


# ---- claim-pattern opportunity scenarios ------------------------------------
def test_diabetes_produces_metabolic_opportunity(db):
    _seed_wellness(db, "wsp12_dia", [("E11", 6)])
    assert "metabolic" in _cat_ids(w_op.wellness_opportunities(_wctx(db, "wsp12_dia")))


def test_cardiac_produces_cardiovascular_opportunity(db):
    _seed_wellness(db, "wsp12_car", [("I10", 6)])
    assert "cardiovascular" in _cat_ids(w_op.wellness_opportunities(_wctx(db, "wsp12_car")))


def test_maternity_produces_maternity_opportunity(db):
    _seed_wellness(db, "wsp12_mat", [("O80", 6)])
    assert "maternity" in _cat_ids(w_op.wellness_opportunities(_wctx(db, "wsp12_mat")))


def test_musculoskeletal_produces_ergonomics_opportunity(db):
    _seed_wellness(db, "wsp12_mus", [("M54", 6)])
    opps = w_op.wellness_opportunities(_wctx(db, "wsp12_mus"))["opportunities"]
    mus = next(o for o in opps if o["category_id"] == "musculoskeletal")
    assert "ergonomics" in mus["suggested_intervention"].lower() or "physiotherapy" in mus["suggested_intervention"].lower()


def test_mental_health_opportunity_only_when_supported(db):
    _seed_wellness(db, "wsp12_men", [("F32", 6)])
    assert "mental_wellbeing" in _cat_ids(w_op.wellness_opportunities(_wctx(db, "wsp12_men")))
    # a single mental-health claim (below k) must NOT surface an opportunity
    _seed_wellness(db, "wsp12_men2", [("F32", 1), ("I10", 6)])
    assert "mental_wellbeing" not in _cat_ids(w_op.wellness_opportunities(_wctx(db, "wsp12_men2")))


def test_respiratory_maps_correctly(db):
    _seed_wellness(db, "wsp12_res", [("J45", 6)])
    assert "respiratory" in _cat_ids(w_op.wellness_opportunities(_wctx(db, "wsp12_res")))


def test_oncology_maps_to_screening_with_careful_wording(db):
    _seed_wellness(db, "wsp12_onc", [("C50", 6)])
    opps = w_op.wellness_opportunities(_wctx(db, "wsp12_onc"))["opportunities"]
    onc = next(o for o in opps if o["category_id"] == "oncology")
    iv = onc["suggested_intervention"].lower()
    assert "awareness" in iv and "no diagnosis advice" in iv
    assert onc["employee_impact"]["sensitive"] is True and onc["caveats"]


def test_unmapped_ailments_are_caveated(db):
    _seed_wellness(db, "wsp12_unm", [("R51", 6)])
    res = w_ov.wellness_overview(_wctx(db, "wsp12_unm"))
    assert res["unmapped_share"] > 0
    assert any("not mapped to a wellness category" in cav.lower() for cav in res["caveats"])


# ---- guardrails -------------------------------------------------------------
def test_restricted_blocks_wellness_advisory(db):
    _seed(db, "wsp12_res_block", CRIT, "claims", override=True)
    res = w_op.wellness_opportunities(_wctx(db, "wsp12_res_block"))
    assert res["advisory_blocked"] is True and res["recommendation"] == "Advisory blocked"
    assert res["opportunities"] == []


def test_conditional_adds_caveat(db):
    _seed(db, "wsp12_cond", POLICY, "policy")
    _seed(db, "wsp12_cond", MEMBER, "member")
    _seed(db, "wsp12_cond", COND, "claims")     # blank member ref -> Conditional
    res = w_ov.wellness_overview(_wctx(db, "wsp12_cond"))
    assert res["data_quality_status"] == "Conditional" and res["restricted"] is False and res["caveats"]


def test_missing_ailment_returns_pending(db):
    # claims present but no diagnosis code -> no mapped ailments -> pending
    blank = (CLAIMS_H + "\n" + "\n".join(
        f"POL-1,CLM-{i},MRK-1,,Apollo,10-Jun-2025,12-Jun-2025,500000,120000,100000,0,0,1,Y" for i in range(1, 6)) + "\n").encode()
    _seed(db, "wsp12_miss", POLICY, "policy")
    _seed(db, "wsp12_miss", MEMBER, "member")
    _seed(db, "wsp12_miss", blank, "claims")
    res = w_op.wellness_opportunities(_wctx(db, "wsp12_miss"))
    assert res["recommendation"] == "Pending" and res["confidence"] == "pending"


def test_roi_is_estimate_not_guaranteed(db):
    _seed_wellness(db, "wsp12_roi", [("E11", 6)])
    res = w_roi.wellness_roi_impact(_wctx(db, "wsp12_roi"))
    assert "not a guaranteed" in res["roi_label"].lower()
    assert all("not a guaranteed saving" in t["label"].lower() for t in res["tracking"])


def test_small_cohort_below_k_is_suppressed(db):
    _seed_wellness(db, "wsp12_supp", [("E11", 3), ("I10", 6)])   # metabolic=3 (< k5), cardiovascular=6
    res = w_op.wellness_opportunities(_wctx(db, "wsp12_supp"))
    assert "metabolic" not in _cat_ids(res) and "cardiovascular" in _cat_ids(res)
    assert res["suppressed_cohorts"] >= 1
    assert any("k-anonymity" in cav.lower() for cav in res["caveats"])


def test_outputs_are_cohort_level_not_individual(db):
    _seed_wellness(db, "wsp12_cohort", [("E11", 6)])
    o = w_op.wellness_opportunities(_wctx(db, "wsp12_cohort"))["opportunities"][0]
    assert o["affected_cohort"]["level"] == "cohort"
    assert "no individual" in o["affected_cohort"]["note"].lower()
    assert "member" not in json.dumps(o).lower()   # no member/individual identifiers leaked


# ---- governance / integrity -------------------------------------------------
def test_tenant_isolation(db):
    _seed_wellness(db, "wsp12_iso", [("E11", 6)])
    other = w_op.wellness_opportunities(_wctx(db, "wsp12_other"))
    assert other["opportunities"] == [] and other["recommendation"] in ("Pending", "Advisory blocked")


def test_evidence_reconciliation(db):
    _seed_wellness(db, "wsp12_ev", [("E11", 6), ("I10", 6)])
    res = w_ov.wellness_overview(_wctx(db, "wsp12_ev"))
    incurred_metric = m_claims.claims_metrics(MetricContext(db, "wsp12_ev", {}))["value"]["incurred"]
    ref = next(e for e in res["evidence_references"] if e["source"] == SRC_CLAIMS and e["field"] == "incurred")
    assert ref["value"] == round(incurred_metric, 2)
    assert SRC_AILMENT in res["source_metrics_used"]


def test_no_raw_data_only_governed_sources(db):
    _seed_wellness(db, "wsp12_raw", [("E11", 6)])
    res = w_op.wellness_opportunities(_wctx(db, "wsp12_raw"))
    assert set(res["source_metrics_used"]).issubset(GOVERNED)


def test_deterministic_outputs(db):
    _seed_wellness(db, "wsp12_det", [("E11", 6), ("I10", 6)])
    a = w_op.wellness_opportunities(_wctx(db, "wsp12_det"))
    b = w_op.wellness_opportunities(_wctx(db, "wsp12_det"))
    assert _cat_ids(a) == _cat_ids(b) and a["confidence_score"] == b["confidence_score"]


# ---- API smoke --------------------------------------------------------------
def test_wellness_endpoints_reachable_and_governed(db):
    _seed_wellness(db, "wsp12_api", [("E11", 6), ("I10", 6)])
    for ep in ("overview", "opportunities", "recommendations", "planner", "roi-impact"):
        r = c.get(f"/wellness/{ep}", headers=_tok())
        assert r.status_code == 200, ep
        assert "data_quality_status" in r.json() and "k_anonymity_min_cohort_size" in r.json()
    ev = c.get("/wellness/evidence/opportunities", headers=_tok())
    assert ev.status_code == 200 and "config_version" in ev.json()
    assert c.get("/wellness/evidence/bogus", headers=_tok()).status_code == 404


def test_wellness_requires_auth():
    assert c.get("/wellness/overview").status_code == 401


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
    assert heads == ["d8a2b4c6e1f3"], heads
    assert len([r for r, d in downs.items() if d is None]) == 1
    assert all(d in revs for d in referenced)
