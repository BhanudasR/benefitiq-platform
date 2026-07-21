"""Sprint 15 — Benefit Benchmarking backend foundation (benefit design + policy T&C only).

Covers config default/override, the observation table shape (no claims columns), feature-
registry mapping, peer-group min-count + Not-Comparable, numeric/categorical/NA
classification, policy-terms comparison, gap analysis (direction-aware), discussion points,
evidence, confidence scaling, tenant isolation, Sprint-14 client scoping, determinism, API
smoke, the structural no-claims guarantee (keys+values) + no-metrics-import, and Alembic."""
import json
import os
import re
from fastapi.testclient import TestClient

from app.main import app
from app.models.canonical import PolicyVersion, BenefitTerm
from app.models.governance import BenchmarkConfig, BenchmarkObservation
from app.services.benchmarking.base import BenchmarkContext, is_gap
from app.services.benchmarking import comparison as cmp, policy_terms as pt, gaps as gp, discussion as dp
from app.services.benchmarking.config import get_benchmark_config, DEFAULTS
from app.services.benchmarking.registry import BY_ID, TERM_FEATURES, FEATURE_IDS

c = TestClient(app)
# claims-domain tokens that must NEVER appear in benchmarking output. Chosen to target claims
# CONCEPTS without matching legitimate benefit-design terms (e.g. "pre/post hospitalization"
# is a benefit, not claims hospital-usage; "co-pay" is a benefit, not a claim).
CLAIMS_TOKENS = ["claims_", "icr", "utiliz", "ailment", "incurred", "loss_ratio",
                 "premium_adequacy", "claim_count", "claim_frequency", "claim_severity",
                 "average_claim", "hospital_name", "hospital_usage", "hospital_concentration"]


def _tok(role="analyst", tenant="bm15_api"):
    r = c.post("/auth/token", json={"username": "u", "tenant_id": tenant, "role": role})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


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
    """spec = {client_id: {term_type: value_or_(value,unit,text)}}"""
    for cid, terms in spec.items():
        pid = _pv(db, tenant, cid)
        for tt, v in terms.items():
            if isinstance(v, tuple):
                _term(db, tenant, pid, tt, value=v[0], unit=v[1] if len(v) > 1 else "pct",
                      text=v[2] if len(v) > 2 else None)
            else:
                _term(db, tenant, pid, tt, value=v, unit=("amount" if "limit" in tt or "cap" in tt or "buffer" in tt else "pct"))
    db.commit()


PORT = {
    "C1": {"room_rent": 0.01, "copay": 0.20, "maternity_limit": 500000, "disease_cap": 100000, "exclusion": (None, "text", "a")},
    "C2": {"room_rent": 0.01, "copay": 0.10, "maternity_limit": 750000, "exclusion": (None, "text", "b")},
    "C3": {"room_rent": 0.02, "copay": 0.10, "maternity_limit": 750000, "exclusion": (None, "text", "b")},
    "C4": {"room_rent": 0.005, "copay": 0.10, "maternity_limit": 1000000, "exclusion": (None, "text", "b")},
}


def _bc(db, tenant, **f):
    return BenchmarkContext(db, tenant, f)


# ---- config -----------------------------------------------------------------
def test_config_default_fallback(db):
    cfg = get_benchmark_config(db, "bm15_none")
    assert cfg["source"] == "default" and cfg["min_peer_count"] == 3
    for k in DEFAULTS:
        assert k in cfg


def test_config_tenant_override(db):
    db.add(BenchmarkConfig(tenant_id="bm15_cfg", min_peer_count=5, same_tolerance_pct=0.05, config_version="v2"))
    db.commit()
    cfg = get_benchmark_config(db, "bm15_cfg")
    assert cfg["source"] == "tenant_config" and cfg["min_peer_count"] == 5 and cfg["same_tolerance_pct"] == 0.05


# ---- model / registry -------------------------------------------------------
def test_observation_table_exists_and_has_no_claims_columns():
    cols = set(BenchmarkObservation.__table__.columns.keys())
    assert {"source", "peer_group_key", "feature_id", "value", "text_value", "confidence", "last_updated", "basis"}.issubset(cols)
    assert not any(any(tok in col.lower() for tok in CLAIMS_TOKENS) for col in cols)


def test_registry_maps_to_benefit_term_types():
    assert BY_ID["room_rent"]["term_type"] == "room_rent"
    assert BY_ID["copay"]["term_type"] == "copay" and BY_ID["copay"]["direction"] == "lower_generous"
    assert BY_ID["maternity_limit"]["term_type"] == "maternity_limit"
    assert len(FEATURE_IDS) == 24 and len(TERM_FEATURES) > 0


# ---- peer group + classification -------------------------------------------
def test_peer_group_valid_and_numeric_classification(db):
    _seed(db, "bm15_a", PORT)
    feats = {f["feature_id"]: f for f in cmp.benchmark_features(_bc(db, "bm15_a", client_id="C1"))["features"]}
    assert feats["room_rent"]["classification"] == "Same as Benchmark"
    assert feats["copay"]["classification"] == "Above Benchmark"          # 0.20 vs peer median 0.10
    assert feats["maternity_limit"]["classification"] == "Below Benchmark"  # 500k vs peer median 750k
    assert cmp.benchmark_overview(_bc(db, "bm15_a", client_id="C1"))["valid_peer_group"] is True


def test_too_few_peers_returns_not_comparable(db):
    _seed(db, "bm15_small", {"C1": {"room_rent": 0.01}, "C2": {"room_rent": 0.01}})   # only 1 peer < min 3
    ov = cmp.benchmark_overview(_bc(db, "bm15_small", client_id="C1"))
    assert ov["valid_peer_group"] is False
    feats = {f["feature_id"]: f for f in cmp.benchmark_features(_bc(db, "bm15_small", client_id="C1"))["features"]}
    assert feats["room_rent"]["classification"] == "Not Available / Not Comparable"
    assert "too small" in " ".join(ov["caveats"]).lower()


def test_categorical_text_classification_different(db):
    _seed(db, "bm15_txt", PORT)
    feats = {f["feature_id"]: f for f in cmp.benchmark_features(_bc(db, "bm15_txt", client_id="C1"))["features"]}
    assert feats["non_payables_exclusions"]["classification"] == "Different from Benchmark"  # 'a' vs peer mode 'b'


def test_missing_client_term_is_not_available(db):
    _seed(db, "bm15_miss", PORT)   # C1 has no icu_rent term
    feats = {f["feature_id"]: f for f in cmp.benchmark_features(_bc(db, "bm15_miss", client_id="C1"))["features"]}
    assert feats["icu_limit"]["classification"] == "Not Available / Not Comparable"
    assert "no confirmed policy term" in feats["icu_limit"]["not_comparable_reason"].lower()


def test_missing_peer_benchmark_is_not_comparable(db):
    _seed(db, "bm15_np", PORT)   # only C1 has disease_cap; peers have none
    feats = {f["feature_id"]: f for f in cmp.benchmark_features(_bc(db, "bm15_np", client_id="C1"))["features"]}
    assert feats["disease_capping"]["classification"] == "Not Available / Not Comparable"
    assert "insufficient peer data" in feats["disease_capping"]["not_comparable_reason"].lower()


def test_not_captured_feature_is_na_with_reason(db):
    _seed(db, "bm15_nc", PORT)
    feats = {f["feature_id"]: f for f in cmp.benchmark_features(_bc(db, "bm15_nc", client_id="C1"))["features"]}
    assert feats["sum_insured"]["classification"] == "Not Available / Not Comparable"
    assert "not yet captured" in feats["sum_insured"]["not_comparable_reason"].lower()


# ---- policy terms / gaps / discussion --------------------------------------
def test_policy_terms_comparison_engine(db):
    _seed(db, "bm15_pt", PORT)
    res = pt.policy_terms_comparison(_bc(db, "bm15_pt", client_id="C1"))
    ids = {f["feature_id"] for f in res["policy_terms"]}
    assert "non_payables_exclusions" in ids and "ped_waiting" in ids
    assert all(BY_ID[f["feature_id"]]["category"] == "terms" for f in res["policy_terms"])


def test_gap_analysis_direction_aware(db):
    _seed(db, "bm15_gap", PORT)
    g = gp.benefit_gap_analysis(_bc(db, "bm15_gap", client_id="C1"))
    gap_ids = {x["feature_id"] for x in g["gaps"]}
    assert "copay" in gap_ids            # lower-is-better + Above => gap
    assert "maternity_limit" in gap_ids  # higher-is-better + Below => gap
    assert "non_payables_exclusions" in gap_ids  # Different => gap
    assert "room_rent" not in gap_ids    # Same => not a gap


def test_discussion_points_from_gaps(db):
    _seed(db, "bm15_disc", PORT)
    d = dp.discussion_points(_bc(db, "bm15_disc", client_id="C1"))
    assert d["count"] == len(gp.benefit_gap_analysis(_bc(db, "bm15_disc", client_id="C1"))["gaps"])
    assert all(p["discussion_point"] and p["peer_group_definition"] for p in d["discussion_points"])


def test_evidence_includes_peer_group_and_source(db):
    _seed(db, "bm15_ev", PORT)
    res = cmp.benchmark_features(_bc(db, "bm15_ev", client_id="C1"))
    rr = next(f for f in res["features"] if f["feature_id"] == "room_rent")
    assert rr["source_evidence"]["source"] == "internal_broker_portfolio_confirmed_terms"
    assert rr["peer_group_definition"]["basis"] and rr["peer_count"] == 3
    assert res["peer_group_definition"]["min_peer_count"] == 3


def test_confidence_scales_with_term_availability(db):
    _seed(db, "bm15_rich", PORT)
    _seed(db, "bm15_poor", {"C1": {"room_rent": 0.01}, "C2": {"room_rent": 0.01}, "C3": {"room_rent": 0.02}, "C4": {"room_rent": 0.005}})
    rich = cmp.benchmark_overview(_bc(db, "bm15_rich", client_id="C1"))["confidence_score"]
    poor = cmp.benchmark_overview(_bc(db, "bm15_poor", client_id="C1"))["confidence_score"]
    assert rich >= poor


# ---- isolation / determinism -----------------------------------------------
def test_tenant_isolation(db):
    _seed(db, "bm15_ta", PORT)
    other = cmp.benchmark_overview(_bc(db, "bm15_tb", client_id="C1"))
    assert other["peer_count"] == 0 and other["valid_peer_group"] is False


def test_deterministic_outputs(db):
    _seed(db, "bm15_det", PORT)
    a = cmp.benchmark_features(_bc(db, "bm15_det", client_id="C1"))["features"]
    b = cmp.benchmark_features(_bc(db, "bm15_det", client_id="C1"))["features"]
    assert {f["feature_id"]: f["classification"] for f in a} == {f["feature_id"]: f["classification"] for f in b}


# ---- no-claims guarantee ----------------------------------------------------
def _walk(o):
    """Yield every key and every string value in a nested structure."""
    if isinstance(o, dict):
        for k, v in o.items():
            yield str(k)
            yield from _walk(v)
    elif isinstance(o, list):
        for v in o:
            yield from _walk(v)
    elif isinstance(o, str):
        yield o


def test_structural_no_claims_in_output(db):
    _seed(db, "bm15_ncg", PORT)
    res = cmp.benchmark_features(_bc(db, "bm15_ncg", client_id="C1"))
    # no claims/ICR/utilization/etc token in ANY key or string value of the governed output
    blob = " ".join(_walk(res)).lower()
    for tok in CLAIMS_TOKENS:
        assert tok not in blob, f"forbidden token '{tok}' found in benchmarking output"


def test_engines_do_not_import_claims_or_metrics():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    bdir = os.path.join(here, "app", "services", "benchmarking")
    for fn in os.listdir(bdir):
        if not fn.endswith(".py"):
            continue
        src = open(os.path.join(bdir, fn), encoding="utf-8").read()
        assert "services.metrics" not in src and "services.simulation" not in src, fn
        assert "import claims" not in src and "m_claims" not in src, fn


# ---- API smoke + client scoping --------------------------------------------
def test_benchmarking_endpoints_reachable(db):
    _seed(db, "bm15_api", PORT)
    for ep in ("overview", "features", "policy-terms-comparison", "peer-comparison", "gap-analysis", "discussion-points"):
        r = c.get(f"/benchmarking/{ep}?client_id=C1", headers=_tok())
        assert r.status_code == 200, ep
        assert r.json()["benchmark_domain"] == "benefit_design_and_policy_terms_only"
    ev = c.get("/benchmarking/evidence/gap-analysis?client_id=C1", headers=_tok())
    assert ev.status_code == 200 and "peer_group_definition" in ev.json()
    assert c.get("/benchmarking/evidence/bogus", headers=_tok()).status_code == 404
    assert c.get("/benchmarking/overview").status_code == 401


def test_client_scoping_enforced_on_benchmarking(db):
    _seed(db, "bm15_scope", PORT)
    admin = {"Authorization": f"Bearer {c.post('/auth/token', json={'username':'a','tenant_id':'bm15_scope','role':'admin'}).json()['access_token']}"}
    r = c.post("/admin/users", headers=admin, json={"email": "hr.bm@x.local", "username": "hr", "user_role": "client_hr_viewer", "client_ids": ["C1"]})
    tok = c.post("/auth/login", json={"email": "hr.bm@x.local", "password": r.json()["temporary_password"]}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    assert c.get("/benchmarking/overview?client_id=C2", headers=h).status_code == 403
    assert c.get("/benchmarking/overview?client_id=C1", headers=h).status_code == 200


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
    # single linear head + single base; this sprint's revision is present in the chain
    # (a later sprint may advance the head — asserted exactly in that sprint's own test)
    assert len(heads) == 1, heads
    assert "f1b5d9c3a7e2" in revs
    assert len([r for r, d in downs.items() if d is None]) == 1
    assert all(d in revs for d in referenced)
