"""Sprint 18 — Placement Intelligence (thin composition layer; reuses the placement-trigger
engine, never a second decision engine).

Covers: governed overview state, incumbent-defence evidence, RFQ readiness basis, quote
comparison pending (no fabricated quotes), terms comparison from benchmarking (claims-free),
recommendation consistency with /recommendations/placement-trigger, evidence slice + 404,
auth, tenant isolation, Sprint-14 client scoping, no-new-engine structural check, and the
Alembic head unchanged (no migration this sprint).
"""
import os
import re
from fastapi.testclient import TestClient

from app.main import app
from app.models.canonical import PolicyVersion, BenefitTerm

c = TestClient(app)

CLAIMS_TOKENS = ["claims_", "icr", "utiliz", "ailment", "incurred", "loss_ratio",
                 "premium_adequacy", "claim_count", "claim_frequency", "claim_severity",
                 "average_claim", "hospital_name", "hospital_usage", "hospital_concentration"]


def _tok(role="analyst", tenant="pl18_api"):
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
    "C1": {"room_rent": 0.01, "copay": 0.20, "maternity_limit": 500000, "ped_waiting": 24, "exclusion": (None, "text", "a")},
    "C2": {"room_rent": 0.01, "copay": 0.10, "maternity_limit": 750000, "ped_waiting": 12, "exclusion": (None, "text", "b")},
    "C3": {"room_rent": 0.02, "copay": 0.10, "maternity_limit": 750000, "ped_waiting": 12, "exclusion": (None, "text", "b")},
    "C4": {"room_rent": 0.005, "copay": 0.10, "maternity_limit": 1000000, "ped_waiting": 12, "exclusion": (None, "text", "b")},
}


def _walk(o):
    if isinstance(o, dict):
        for k, v in o.items():
            yield str(k); yield from _walk(v)
    elif isinstance(o, list):
        for v in o:
            yield from _walk(v)
    elif isinstance(o, str):
        yield o


# ---- views ------------------------------------------------------------------
def test_overview_returns_governed_state(db):
    _seed(db, "pl18_ov", PORT)
    r = c.get("/placement/overview?client_id=C1", headers=_tok(tenant="pl18_ov"))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["module"] == "placement_intelligence" and d["view"] == "overview"
    assert d["placement_state"] in ("yes", "no", "review")
    assert "data_quality_status" in d and "decision_summary" in d
    assert d["terms_to_protect_count"] >= 0 and d["benchmark_gaps_to_raise_count"] >= 0
    assert any("Placement Trigger" in s for s in d["source_basis"])


def test_incumbent_defence_returns_evidence(db):
    _seed(db, "pl18_def", PORT)
    d = c.get("/placement/incumbent-defence?client_id=C1", headers=_tok(tenant="pl18_def")).json()
    assert "incumbent_defence_score" in d and "defence_reasons" in d
    assert "negotiation_evidence" in d
    # operational ICR reported (may be None on No-Data) and adjusted kept separate
    assert "operational_icr" in d and "adjusted_icr" in d
    assert d["reuses_engine"] == "recommendations.placement_trigger"


def test_rfq_readiness_returns_trigger_basis(db):
    _seed(db, "pl18_rfq", PORT)
    d = c.get("/placement/rfq-readiness?client_id=C1", headers=_tok(tenant="pl18_rfq")).json()
    assert "rfq_readiness" in d and "trigger_reason" in d
    assert isinstance(d["go_to_market_required"], bool)
    assert d["placement_state"] in ("yes", "no", "review")


def test_quote_comparison_pending_when_no_quotes(db):
    _seed(db, "pl18_q", PORT)
    d = c.get("/placement/quote-comparison?client_id=C1", headers=_tok(tenant="pl18_q")).json()
    assert d["quote_data_available"] is False
    assert d["quotes"] == [] and d["quote_count"] == 0
    assert "pending" in d["message"].lower() or "upload" in d["message"].lower()
    assert "expected_fields" in d


def test_no_fabricated_quote_values(db):
    _seed(db, "pl18_qv", PORT)
    d = c.get("/placement/quote-comparison?client_id=C1", headers=_tok(tenant="pl18_qv")).json()
    # the quote list must be empty — no insurer/pricing values are ever fabricated
    assert d["quotes"] == [] and d["quote_count"] == 0 and d["quote_data_available"] is False


def test_terms_comparison_shows_terms_and_gaps(db):
    _seed(db, "pl18_tc", PORT)
    d = c.get("/placement/terms-comparison?client_id=C1", headers=_tok(tenant="pl18_tc")).json()
    assert d["benchmark_domain"] == "benefit_design_and_policy_terms_only"
    ids = {t["feature_id"] for t in d["policy_terms"]}
    assert "ped_waiting" in ids and "non_payables_exclusions" in ids
    assert "benchmark_gaps_to_raise" in d and "terms_to_protect" in d
    # claims-free: no claims/ICR/utilization token anywhere in the terms payload
    blob = " ".join(_walk(d)).lower()
    for tok in CLAIMS_TOKENS:
        assert tok not in blob, f"forbidden token '{tok}' in terms-comparison"


def test_recommendation_reuses_placement_trigger(db):
    _seed(db, "pl18_rec", PORT)
    h = _tok(tenant="pl18_rec")
    rec = c.get("/placement/recommendation?client_id=C1", headers=h).json()
    direct = c.get("/recommendations/placement-trigger?client_id=C1", headers=h).json()
    # identical decision — the top-level module reuses the engine, never a second decision
    assert rec["recommendation"] == direct["recommendation"]
    assert rec["placement_triggered"] == direct["placement_triggered"]
    assert rec["incumbent_defence_score"] == direct["incumbent_defence_score"]
    assert "Placement Trigger" in rec["source"]
    assert rec["reuses_engine"] == "recommendations.placement_trigger"


def test_advisory_blocked_field_present(db):
    _seed(db, "pl18_ab", PORT)
    d = c.get("/placement/overview?client_id=C1", headers=_tok(tenant="pl18_ab")).json()
    assert "advisory_blocked" in d and isinstance(d["advisory_blocked"], bool)  # inherited from engine


# ---- evidence / auth / isolation / scoping ---------------------------------
def test_evidence_slice_and_404(db):
    _seed(db, "pl18_ev", PORT)
    h = _tok(tenant="pl18_ev")
    ev = c.get("/placement/evidence/overview?client_id=C1", headers=h)
    assert ev.status_code == 200 and "source_basis" in ev.json()
    assert c.get("/placement/evidence/bogus", headers=h).status_code == 404


def test_endpoints_require_auth(db):
    for ep in ("overview", "incumbent-defence", "rfq-readiness", "quote-comparison",
               "terms-comparison", "recommendation"):
        assert c.get(f"/placement/{ep}").status_code == 401, ep


def test_tenant_isolation(db):
    _seed(db, "pl18_ta", PORT)
    other = c.get("/placement/terms-comparison?client_id=C1", headers=_tok(tenant="pl18_tb")).json()
    # no peers in the other tenant -> no comparable terms leak across tenants
    assert other["terms_to_protect_count"] == 0 and other["benchmark_gaps_count"] == 0


def test_client_scoping_enforced_on_placement(db):
    _seed(db, "pl18_scope", PORT)
    admin = {"Authorization": f"Bearer {c.post('/auth/token', json={'username':'a','tenant_id':'pl18_scope','role':'admin'}).json()['access_token']}"}
    r = c.post("/admin/users", headers=admin, json={"email": "hr.pl@x.local", "username": "hr", "user_role": "client_hr_viewer", "client_ids": ["C1"]})
    tok = c.post("/auth/login", json={"email": "hr.pl@x.local", "password": r.json()["temporary_password"]}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    assert c.get("/placement/overview?client_id=C2", headers=h).status_code == 403
    assert c.get("/placement/overview?client_id=C1", headers=h).status_code == 200


# ---- reuse guarantee (no new decision engine) ------------------------------
def test_placement_defines_no_new_decision_engine():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    src = open(os.path.join(here, "app", "services", "placement", "engine.py"), encoding="utf-8").read()
    assert "recommendations import placement" in src            # reuses the engine
    assert "placement_trigger(" in src
    # it must NOT re-implement the decision primitives that live in recommendations.rules
    assert "def placement_decision" not in src and "def renewal_stance" not in src


# ---- Alembic head unchanged (no migration this sprint) ---------------------
def test_alembic_head_unchanged_sprint18():
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
    assert heads == ["a3d7e9f1c2b4"], heads       # unchanged from Sprint 17
    assert len([r for r, d in downs.items() if d is None]) == 1
    assert all(d in revs for d in referenced)
