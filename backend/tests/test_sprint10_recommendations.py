"""Sprint 10 — governed Recommendation + Placement Trigger + Next Best Action engines.

Covers: config-driven thresholds + default fallback, the ICR/trend/one-off decision
scenarios, restricted-block / conditional-caveat / missing-pending guardrails, savings
treated as scenario (not guaranteed), balanced-design influence, placement yes/no/review,
NBA generation, operational-ICR-unchanged + adjusted-separate, tenant isolation, evidence
reconciliation, no-raw-data, determinism, API smoke, and Alembic chain integrity."""
import os
import re
from fastapi.testclient import TestClient

from app.main import app
from app.core.security import Role
from app.services.metrics import icr as m_icr
from app.services.metrics.base import MetricContext
from app.services.recommendations.base import RecoContext, gather_signals, impacts, SRC_ICR, SRC_TRENDS, SRC_LARGE, SRC_ADJ, SRC_BAL
from app.services.recommendations import renewal, placement, nba, rules
from app.services.recommendations.config import get_reco_config, DEFAULTS
from app.models.governance import RecommendationConfig
from tests.test_sprint4_metrics import _seed, _seed_all, POLICY, MEMBER, COND, CRIT

c = TestClient(app)
GOVERNED = {SRC_ICR, SRC_TRENDS, SRC_LARGE, SRC_ADJ, SRC_BAL}


def _tok(role="analyst", tenant="s10_rec"):
    r = c.post("/auth/token", json={"username": "u", "tenant_id": tenant, "role": role})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _rctx(db, tenant, **f):
    return RecoContext(db, tenant, f)


# ---- synthetic signal for pure rule tests (no DB) --------------------------
def make_sig(op_icr=None, adjusted_icr=None, large_share=0.0, large_count=0,
             trend_icr_pct=None, preferred_levers=None, levers=None):
    return {
        "op_icr": op_icr, "adjusted_icr": adjusted_icr,
        "large_share": large_share, "large_count": large_count,
        "trend_icr_pct": trend_icr_pct,
        "preferred_levers": preferred_levers or [],
        "high_friction_levers": [],
        "levers": levers or [], "one_off_claims": [],
    }


CFG = dict(DEFAULTS)


# ---- config governance -----------------------------------------------------
def test_default_config_fallback(db):
    cfg = get_reco_config(db, "no-such-tenant")
    assert cfg["source"] == "default" and cfg["config_version"] == "v1-default"
    for k in DEFAULTS:
        assert k in cfg
    assert cfg["icr_negotiate_max"] == 120.0


def test_tenant_config_overrides_defaults_and_drives_stance(db):
    db.add(RecommendationConfig(tenant_id="s10_cfg", icr_negotiate_max=105.0, config_version="v2-test"))
    db.commit()
    cfg = get_reco_config(db, "s10_cfg")
    assert cfg["source"] == "tenant_config" and cfg["icr_negotiate_max"] == 105.0
    # op 110 is Negotiate under default(120) but Redesign under this tenant config(105)
    assert rules.renewal_stance(make_sig(op_icr=110.0), CFG)[0] == "Negotiate"
    assert rules.renewal_stance(make_sig(op_icr=110.0), cfg)[0] == "Redesign"


# ---- pure rule scenarios (deterministic, config-driven) --------------------
def test_high_icr_poor_trend_recommends_redesign():
    stance, reasons = rules.renewal_stance(make_sig(op_icr=115.0, trend_icr_pct=15.0), CFG)
    assert stance == "Redesign"                       # Negotiate escalated by adverse trend
    assert any(r["rule"] == "adverse_trend" for r in reasons)


def test_high_icr_strong_one_off_recommends_defend():
    stance, reasons = rules.renewal_stance(
        make_sig(op_icr=130.0, adjusted_icr=90.0, large_share=0.5, large_count=3), CFG)
    assert stance == "Defend"
    assert any(r["rule"] == "event_driven_defendable" for r in reasons)


def test_placement_yes_when_not_defensible():
    sig = make_sig(op_icr=200.0, adjusted_icr=180.0, large_share=0.0, preferred_levers=[])
    dec = rules.placement_decision(sig, CFG)
    assert dec["triggered"] == "yes" and dec["rfq_readiness"] >= CFG["rfq_ready_min"]


def test_placement_no_when_incumbent_defence_strong():
    sig = make_sig(op_icr=80.0, adjusted_icr=60.0, large_share=0.5)
    dec = rules.placement_decision(sig, CFG)
    assert dec["triggered"] == "no" and dec["defence_score"] >= CFG["incumbent_defence_strong_min"]


def test_next_best_actions_generated_from_evidence():
    sig = make_sig(op_icr=130.0, adjusted_icr=90.0, large_share=0.5, large_count=2,
                   preferred_levers=["room_rent"])
    acts = [a["rule"] for a in rules.next_best_actions(sig, CFG, "Redesign", "review")]
    assert "defend_one_off" in acts and "negotiate_with_adjusted" in acts and "use_sandbox_levers" in acts


def test_balanced_design_influences_recommendation():
    with_levers = make_sig(op_icr=140.0, adjusted_icr=140.0, preferred_levers=["room_rent"])
    without = make_sig(op_icr=140.0, adjusted_icr=140.0, preferred_levers=[])
    a_with = [a["rule"] for a in rules.next_best_actions(with_levers, CFG, "Redesign", "review")]
    a_without = [a["rule"] for a in rules.next_best_actions(without, CFG, "Redesign", "review")]
    assert "use_sandbox_levers" in a_with and "use_sandbox_levers" not in a_without
    # weak-lever sub-signal raises RFQ readiness when no preferred levers exist
    assert rules.rfq_readiness(without, CFG)[0] >= rules.rfq_readiness(with_levers, CFG)[0]


def test_savings_are_scenario_not_guaranteed():
    sig = make_sig(levers=[{"lever": "room_rent", "expected_saving": 35000, "classification": "Preferred"}])
    employer, _ = impacts(sig)
    assert "not guaranteed" in employer["note"].lower()


# ---- integration on governed seeded data -----------------------------------
def test_seeded_renewal_operational_icr_unchanged_and_adjusted_separate(db):
    _seed_all(db, "s10_r1")
    rr = renewal.renewal_recommendation(_rctx(db, "s10_r1"))
    op_metric = m_icr.icr_metrics(MetricContext(db, "s10_r1", {}))["value"]["operational_icr"]
    assert rr["operational_icr"] == op_metric                 # never mutated
    assert rr["adjusted_icr"] is not None and rr["adjusted_icr"] != rr["operational_icr"]
    assert "never replaces Operational ICR" in rr["adjusted_icr_note"]
    assert rr["recommendation"] in {"Defend", "Negotiate", "Redesign", "Place", "Monitor"}
    assert set(rr["source_metrics_used"]) == GOVERNED
    assert rr["confidence"] in {"high", "medium", "low", "very low"}


def test_evidence_reconciliation(db):
    _seed_all(db, "s10_r2")
    rr = renewal.renewal_recommendation(_rctx(db, "s10_r2"))
    op_metric = m_icr.icr_metrics(MetricContext(db, "s10_r2", {}))["value"]["operational_icr"]
    icr_ref = next(e for e in rr["evidence_references"] if e["source"] == SRC_ICR and e["field"] == "operational_icr")
    assert icr_ref["value"] == op_metric                      # evidence reconciles to source metric
    assert rr["reasoning"] and all("rule" in r and "explanation" in r for r in rr["reasoning"])


def test_no_raw_data_only_governed_sources(db):
    _seed_all(db, "s10_r3")
    rr = renewal.renewal_recommendation(_rctx(db, "s10_r3"))
    assert set(rr["source_metrics_used"]).issubset(GOVERNED)  # only governed metric/sim outputs
    sig = gather_signals(_rctx(db, "s10_r3"))
    assert isinstance(sig["results"]["icr"], dict)            # composed from governed metric engine


def test_deterministic_outputs(db):
    _seed_all(db, "s10_r4")
    a = renewal.renewal_recommendation(_rctx(db, "s10_r4"))
    b = renewal.renewal_recommendation(_rctx(db, "s10_r4"))
    assert a["recommendation"] == b["recommendation"]
    assert a["confidence_score"] == b["confidence_score"]
    assert [r["rule"] for r in a["reasoning"]] == [r["rule"] for r in b["reasoning"]]


def test_tenant_isolation(db):
    _seed_all(db, "s10_r5")
    other = renewal.renewal_recommendation(_rctx(db, "s10_other"))
    assert other["operational_icr"] is None and other["recommendation"] == "Monitor"


def test_missing_metrics_returns_pending(db):
    rr = renewal.renewal_recommendation(_rctx(db, "s10_empty"))
    assert rr["recommendation"] == "Monitor" and rr["confidence"] == "pending"
    assert rr["operational_icr"] is None


def test_restricted_blocks_recommendation(db):
    _seed(db, "s10_r6", CRIT, "claims", override=True)
    rr = renewal.renewal_recommendation(_rctx(db, "s10_r6"))
    assert rr["advisory_blocked"] is True and rr["recommendation"] == "Advisory blocked"
    assert any("restricted" in c.lower() for c in rr["caveats"])
    pp = placement.placement_trigger(_rctx(db, "s10_r6"))
    assert pp["placement_triggered"] == "review" and pp["advisory_blocked"] is True
    nn = nba.next_best_action_reco(_rctx(db, "s10_r6"))
    assert nn["recommendation"] == "Advisory blocked" and nn["actions"] == []


def test_conditional_adds_caveat(db):
    _seed(db, "s10_r7", POLICY, "policy")
    _seed(db, "s10_r7", MEMBER, "member")
    _seed(db, "s10_r7", COND, "claims")
    rr = renewal.renewal_recommendation(_rctx(db, "s10_r7"))
    assert rr["data_quality_status"] == "Conditional"
    assert rr["restricted"] is False and rr["caveats"]


def test_placement_engine_shape_on_governed_data(db):
    _seed_all(db, "s10_r8")
    pp = placement.placement_trigger(_rctx(db, "s10_r8"))
    assert pp["placement_triggered"] in {"yes", "no", "review"}
    assert 0.0 <= pp["incumbent_defence_score"] <= 1.0
    assert 0.0 <= pp["rfq_readiness"] <= 1.0
    assert pp["negotiation_evidence"]["operational_icr"] == pp["operational_icr"]


# ---- API smoke -------------------------------------------------------------
def test_recommendation_endpoints_reachable_and_governed(db):
    _seed_all(db, "s10_rec")
    for ep in ("renewal", "placement-trigger", "next-best-action"):
        r = c.get(f"/recommendations/{ep}", headers=_tok())
        assert r.status_code == 200, ep
        body = r.json()
        assert "recommendation" in body and "confidence" in body and "evidence_references" in body
        assert body["operational_icr"] is not None
    ev = c.get("/recommendations/evidence/renewal", headers=_tok())
    assert ev.status_code == 200 and "reasoning" in ev.json() and "config_version" in ev.json()
    assert c.get("/recommendations/evidence/bogus", headers=_tok()).status_code == 404


def test_recommendation_requires_auth_and_isolates_tenant():
    assert c.get("/recommendations/renewal").status_code == 401
    r = c.get("/recommendations/renewal", headers=_tok(tenant="s10_empty2"))
    assert r.status_code == 200 and r.json()["recommendation"] == "Monitor"


# ---- Alembic chain integrity ----------------------------------------------
def test_alembic_single_head_and_chain_intact():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    vdir = os.path.join(here, "migrations", "versions")
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
    # exactly one base (down=None) and one head (never referenced as a down_revision)
    referenced = {d for d in downs.values() if d}
    heads = [r for r in revs if r not in referenced]
    bases = [r for r, d in downs.items() if d is None]
    assert heads == ["d8a2b4c6e1f3"], heads   # chain head advances as new migrations are added
    assert len(bases) == 1
    # every down_revision points to a known revision (unbroken chain)
    assert all(d in revs for d in referenced)
