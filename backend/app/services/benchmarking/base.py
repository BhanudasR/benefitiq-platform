"""Benefit Benchmarking base (Sprint 15).

Builds the peer group, extracts the client's confirmed benefit terms, computes the peer
benchmark from the internal portfolio's confirmed terms, classifies each feature and
assembles the shared explainability envelope. Imports ONLY policy/term models — never the
claims/metrics/simulation services. No claims/ICR/utilization concept appears anywhere."""
from __future__ import annotations

from collections import Counter
from statistics import median

from ...models.canonical import PolicyVersion, BenefitTerm
from ...models.governance import DatasetVersion
from .config import get_benchmark_config
from .registry import FEATURES, BY_ID, TERM_FEATURES

# classification labels
SAME, ABOVE, BELOW, DIFFERENT, NA = (
    "Same as Benchmark", "Above Benchmark", "Below Benchmark",
    "Different from Benchmark", "Not Available / Not Comparable")

_DQ_LABEL = {"high": "high", "medium": "medium", "low": "low", "none": "none"}


def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


class BenchmarkContext:
    def __init__(self, db, tenant: str, filters: dict | None = None):
        self.db = db
        self.tenant = tenant
        self.f = filters or {}
        self.cfg = get_benchmark_config(db, tenant)

    def _active_ids(self):
        return [v.id for v in self.db.query(DatasetVersion).filter(
            DatasetVersion.tenant_id == self.tenant, DatasetVersion.status == "ACTIVE").all()]

    def portfolio_pvs(self):
        """Governed portfolio policy versions for the tenant (ACTIVE datasets when present)."""
        q = self.db.query(PolicyVersion).filter(PolicyVersion.tenant_id == self.tenant)
        active = self._active_ids()
        if active:
            q = q.filter(PolicyVersion.dataset_version_id.in_(active))
        return q.all()

    def target_ids(self):
        f = self.f
        pvs = self.portfolio_pvs()
        def match(p):
            if f.get("policy_version_id") and p.id != f["policy_version_id"]:
                return False
            if f.get("client_id") and p.client_id != f["client_id"]:
                return False
            if f.get("policy_id") and p.policy_number != f["policy_id"]:
                return False
            if f.get("policy_year") and p.policy_year != int(f["policy_year"]):
                return False
            return True
        # only treat as "target" when a client/policy filter is actually set
        if not any(f.get(k) for k in ("client_id", "policy_version_id", "policy_id")):
            return []
        return [p.id for p in pvs if match(p)]


def peer_group(bctx: BenchmarkContext) -> dict:
    """Internal broker-portfolio peer group: all governed policy versions EXCEPT the target
    client's. Enforces the governed minimum peer count."""
    all_pvs = bctx.portfolio_pvs()
    target = set(bctx.target_ids())
    peers = [p.id for p in all_pvs if p.id not in target]
    year = bctx.f.get("policy_year")
    min_peers = bctx.cfg["min_peer_count"]
    definition = {
        "basis": bctx.cfg["benchmark_basis"],
        "criteria": {"scope": "internal broker portfolio", "excludes_target_client": bool(target),
                     "policy_year": int(year) if year else "all"},
        "min_peer_count": min_peers,
    }
    return {"target_ids": list(target), "peer_ids": peers, "peer_count": len(peers),
            "min_peer_count": min_peers, "valid": len(peers) >= min_peers,
            "definition": definition,
            "reason": None if len(peers) >= min_peers else
            f"Peer group too small ({len(peers)} < {min_peers}); no benchmark can be formed."}


def _confirmed_terms(db, tenant, pv_ids, term_type):
    if not pv_ids:
        return []
    return db.query(BenefitTerm).filter(
        BenefitTerm.tenant_id == tenant, BenefitTerm.status == "confirmed",
        BenefitTerm.restricted == False,   # noqa: E712
        BenefitTerm.term_type == term_type,
        BenefitTerm.policy_version_id.in_(list(pv_ids))).all()


def _client_term(bctx, feature, pg):
    rows = _confirmed_terms(bctx.db, bctx.tenant, pg["target_ids"], feature["term_type"]) if feature["term_type"] else []
    if not rows:
        return None
    t = rows[0]
    return {"value": float(t.value) if t.value is not None else None,
            "text": t.text_value, "unit": t.unit,
            "confidence": float(t.confidence) if t.confidence is not None else None,
            "term_ids": [r.id for r in rows]}


def _peer_stats(bctx, feature, pg):
    rows = _confirmed_terms(bctx.db, bctx.tenant, pg["peer_ids"], feature["term_type"]) if feature["term_type"] else []
    values = [float(r.value) for r in rows if r.value is not None]
    texts = [r.text_value for r in rows if r.text_value]
    return {"values": values, "texts": texts, "count": len(rows), "term_count": len(rows)}


def _benchmark_value(feature, peer):
    if feature["comparability"] == "numeric":
        return round(median(peer["values"]), 4) if peer["values"] else None
    if feature["comparability"] in ("categorical", "text_presence"):
        return Counter(peer["texts"]).most_common(1)[0][0] if peer["texts"] else None
    return None


def _classify(feature, client, benchmark, peer, cfg):
    if feature["comparability"] == "not_captured":
        return NA, "This benefit feature is not yet captured in structured policy terms."
    if client is None or (feature["comparability"] == "numeric" and client.get("value") is None) \
            or (feature["comparability"] != "numeric" and not client.get("text")):
        return NA, "No confirmed policy term for this feature for the client."
    if peer["count"] < cfg["min_peer_count"] or benchmark is None:
        return NA, "Insufficient peer data to form a benchmark for this feature."
    if feature["comparability"] == "numeric":
        cv, bv = client["value"], benchmark
        tol = abs(bv) * cfg["same_tolerance_pct"]
        if abs(cv - bv) <= tol:
            return SAME, None
        return (ABOVE, None) if cv > bv else (BELOW, None)
    # categorical / text_presence
    return (SAME, None) if str(client["text"]).strip().lower() == str(benchmark).strip().lower() else (DIFFERENT, None)


def _rank_basis(feature, client, peer):
    if feature["comparability"] != "numeric" or client is None or client.get("value") is None or not peer["values"]:
        return None
    cv = client["value"]
    below = sum(1 for v in peer["values"] if v < cv)
    return {"peers_below": below, "peer_count": len(peer["values"]),
            "percentile": round(below / len(peer["values"]), 3) if peer["values"] else None}


def compare_feature(bctx, feature, pg) -> dict:
    client = _client_term(bctx, feature, pg)
    peer = _peer_stats(bctx, feature, pg)
    benchmark = _benchmark_value(feature, peer)
    classification, reason = _classify(feature, client, benchmark, peer, bctx.cfg)
    disc = feature["discussion"].format(
        classification=classification.lower(),
        benchmark=(benchmark if benchmark is not None else "n/a"),
        client=(client.get("value") if client else "n/a"))
    return {
        "feature_id": feature["feature_id"], "feature": feature["label"], "category": feature["category"],
        "client_value": (client.get("value") if client else None),
        "client_text": (client.get("text") if client else None),
        "client_unit": (client.get("unit") if client else None),
        "benchmark_value": benchmark, "peer_value": benchmark,
        "peer_count": peer["count"], "peer_group_definition": pg["definition"],
        "classification": classification,
        "rank_basis": _rank_basis(feature, client, peer),
        "direction": feature["direction"],
        "source_evidence": {"source": "internal_broker_portfolio_confirmed_terms",
                            "basis": bctx.cfg["benchmark_basis"],
                            "client_term_ids": (client.get("term_ids") if client else []),
                            "peer_term_count": peer["term_count"]},
        "caveats": ([reason] if reason else []),
        "last_updated": None, "benchmark_basis": bctx.cfg["benchmark_basis"],
        "discussion_point": disc,
        "not_comparable_reason": reason,
    }


def is_gap(comparison: dict) -> bool:
    """A benefit gap = LESS generous than the peer benchmark. Direction-aware: for
    higher-is-better features that means Below; for lower-is-better (co-pay, waiting
    period) it means Above. 'Different' (categorical/text) is always a gap to review."""
    cls = comparison["classification"]
    if cls == DIFFERENT:
        return True
    direction = BY_ID[comparison["feature_id"]]["direction"]
    if direction == "higher_generous" and cls == BELOW:
        return True
    if direction == "lower_generous" and cls == ABOVE:
        return True
    return False


def _confidence(pg, comparisons, cfg):
    with_source = [c for c in comparisons if BY_ID[c["feature_id"]]["term_type"] is not None]
    present = sum(1 for c in with_source if c["classification"] != NA)
    term_avail = round(present / len(TERM_FEATURES), 3) if TERM_FEATURES else 0.0
    peer_score = clamp(pg["peer_count"] / (cfg["min_peer_count"] * 2)) if cfg["min_peer_count"] else 0.0
    score = round(clamp(cfg["weight_peer_size"] * peer_score + cfg["weight_term_availability"] * term_avail), 3)
    label = ("high" if score >= 0.7 else "medium" if score >= 0.4 else "low" if score >= 0.2 else "very low")
    return score, label, term_avail


def envelope(*, kind: str, bctx: BenchmarkContext, pg: dict, comparisons: list[dict], extra: dict) -> dict:
    caveats = []
    if not pg["valid"]:
        caveats.append(pg["reason"])
    if not pg["target_ids"]:
        caveats.append("No client/policy selected; provide a client_id or policy filter to benchmark against peers.")
    score, label, term_avail = _confidence(pg, comparisons, bctx.cfg)
    out = {
        "kind": kind,
        "summary": (f"Benefit design benchmarked against {pg['peer_count']} peer polic(ies) in the internal portfolio."
                    if pg["valid"] else "No valid peer group; benchmark not available."),
        "benchmark_domain": "benefit_design_and_policy_terms_only",
        "peer_group_definition": pg["definition"], "peer_count": pg["peer_count"],
        "valid_peer_group": pg["valid"],
        "confidence": label, "confidence_score": score, "reliability": label,
        "evidence_completeness": term_avail,
        "source": "internal_broker_portfolio",
        "benchmark_basis": bctx.cfg["benchmark_basis"], "config_version": bctx.cfg["config_version"],
        "config_basis": bctx.cfg["config_basis"],
        "caveats": caveats,
        "assumptions": [
            "Benchmarking compares benefit design and policy terms only — not cost, loss-ratio or usage experience.",
            "Peer values are computed from the internal broker portfolio's confirmed benefit terms.",
            "No benchmark is produced without a valid peer group, a peer-group definition and source evidence.",
        ],
    }
    out.update(extra)
    return out
