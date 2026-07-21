"""Benchmark-gap action service (Sprint 17).

A broker-selected Benefit Benchmarking gap is snapshot into a BenchmarkAction and, when a
governed simulation lever exists, sent downstream to the Savings Sandbox for impact
simulation. Rules enforced here:
  * The gap is SERVER-DERIVED from governed benchmarking data — client-sent benchmark values
    are never trusted.
  * The benchmark evidence (client value, benchmark value, classification, peer group,
    confidence, source evidence, caveats) is SNAPSHOT at creation time and never recomputed
    for the same action (audit trail).
  * `sandbox_preview` DELEGATES to the existing simulation service — no new simulation math —
    and its result never re-enters benchmarking classification (one-way).
  * Unsupported features are discussion-only / not simulation-ready with a reason — we never
    invent a lever.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException

from ...models.governance import BenchmarkAction
from ..benchmarking.base import BenchmarkContext, peer_group, compare_feature
from ..benchmarking.gaps import benefit_gap_analysis
from ..benchmarking.registry import BY_ID
from ..simulation.base import SimContext
from ..simulation import room_rent, copay, caps, corporate_buffer

# Governed static map: benchmark feature_id -> the ONE governed simulation lever it feeds.
# Only these six are simulation-ready. Every other feature (icu_limit, newborn_cover,
# ped_waiting, daycare, non_payables_exclusions, and all not-captured features) is
# discussion-only. We never invent a lever.
SANDBOX_LEVER_MAP: dict[str, dict] = {
    "room_rent":        {"lever": "room-rent",         "sim": "room_rent",        "param": "room_rent_pct"},
    "copay":            {"lever": "copay",             "sim": "copay",            "param": "copay_pct"},
    "parent_copay":     {"lever": "parent-copay",      "sim": "parent_copay",     "param": "parent_copay_pct"},
    "disease_capping":  {"lever": "disease-cap",       "sim": "disease_cap",      "param": "proposed_cap"},
    "maternity_limit":  {"lever": "maternity-sublimit", "sim": "maternity",       "param": "proposed_cap"},
    "corporate_buffer": {"lever": "corporate-buffer",  "sim": "corporate_buffer", "param": None},
}

VALID_ACTIONS = {"flag_for_discussion", "send_to_sandbox", "send_to_renewal_strategy", "mark_reviewed"}
VALID_STATUS = {"flagged", "sent", "reviewed", "archived"}
NA = "Not Available / Not Comparable"
LINKAGE = "benchmark_gap_to_renewal_one_way"

# governed simulation dispatch (downstream only) — each entry delegates to the sim service
_SIM = {
    "room_rent":        lambda ctx: room_rent.room_rent_simulation(ctx),
    "copay":            lambda ctx: copay.copay_simulation(ctx),
    "parent_copay":     lambda ctx: copay.copay_simulation(ctx, parent_only=True),
    "disease_cap":      lambda ctx: caps.cap_simulation(ctx, kind="disease"),
    "maternity":        lambda ctx: caps.cap_simulation(ctx, kind="maternity"),
    "corporate_buffer": lambda ctx: corporate_buffer.corporate_buffer_simulation(ctx),
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _s(v):
    return None if v is None else str(v)


def _filters_of(action) -> dict:
    return {"client_id": action.client_id, "policy_id": action.policy_id,
            "policy_version_id": action.policy_version_id}


def lever_for(feature_id: str, classification: str):
    """Resolve (simulation_ready, sandbox_lever, not_ready_reason) for a feature. Never
    invents a lever: unmapped or Not-Comparable features are discussion-only."""
    m = SANDBOX_LEVER_MAP.get(feature_id)
    if m is None:
        return False, None, ("No governed simulation lever exists for this benefit feature; it is "
                             "discussion-only — send to Renewal Intelligence for qualitative review.")
    if classification == NA:
        return False, None, ("Feature is Not Comparable for this client, so it cannot be simulated; "
                             "discussion-only.")
    return True, m["sim"], None


def _snapshot(bctx: BenchmarkContext, feature_id: str) -> dict:
    """Server-derive the gap from governed benchmarking data (never trust client input)."""
    feat = BY_ID.get(feature_id)
    if feat is None:
        raise HTTPException(404, f"unknown benchmark feature '{feature_id}'")
    pg = peer_group(bctx)
    comp = compare_feature(bctx, feat, pg)      # per-feature design/T&C snapshot (claims-free)
    env = benefit_gap_analysis(bctx)            # envelope-level confidence + caveats
    sim_ready, lever, reason = lever_for(feature_id, comp["classification"])
    client_val = comp.get("client_value")
    if client_val is None:
        client_val = comp.get("client_text")
    env_caveats = [c for c in (env.get("caveats") or []) if c]
    return {
        "feature_id": feature_id, "feature_name": comp["feature"],
        "current_client_value": _s(client_val), "benchmark_value": _s(comp.get("benchmark_value")),
        "classification": comp["classification"], "peer_group_definition": comp["peer_group_definition"],
        "confidence": env.get("confidence"), "confidence_score": env.get("confidence_score"),
        "evidence": comp.get("source_evidence"),
        "caveats": (comp.get("caveats") or []) + env_caveats,
        "simulation_ready": sim_ready, "sandbox_lever": lever, "not_ready_reason": reason,
    }


def create_action(db, principal: dict, feature_id: str, filters: dict, selected_action: str) -> dict:
    if selected_action not in VALID_ACTIONS:
        raise HTTPException(400, f"invalid selected_action '{selected_action}'")
    tenant = principal["tenant_id"]
    snap = _snapshot(BenchmarkContext(db, tenant, dict(filters)), feature_id)

    if selected_action == "send_to_sandbox":
        target = "renewal_sandbox" if snap["simulation_ready"] else "discussion_only"
    elif selected_action == "send_to_renewal_strategy":
        target = "renewal_strategy"
    else:
        target = "discussion_only"
    status = {"flag_for_discussion": "flagged", "send_to_sandbox": "sent",
              "send_to_renewal_strategy": "sent", "mark_reviewed": "reviewed"}[selected_action]

    actor = principal.get("sub")
    hist = [{"at": _now().isoformat(), "action": selected_action, "by": actor,
             "note": f"created ({target})"}]
    row = BenchmarkAction(
        tenant_id=tenant, client_id=filters.get("client_id"), policy_id=filters.get("policy_id"),
        policy_version_id=filters.get("policy_version_id"),
        feature_id=snap["feature_id"], feature_name=snap["feature_name"],
        current_client_value=snap["current_client_value"], benchmark_value=snap["benchmark_value"],
        classification=snap["classification"], peer_group_definition=snap["peer_group_definition"],
        confidence=snap["confidence"], confidence_score=snap["confidence_score"],
        evidence=snap["evidence"], caveats=snap["caveats"],
        selected_action=selected_action, target_module=target,
        simulation_ready=snap["simulation_ready"], sandbox_lever=snap["sandbox_lever"],
        not_ready_reason=snap["not_ready_reason"], status=status, action_history=hist,
        created_by=actor,
    )
    db.add(row); db.commit(); db.refresh(row)
    return serialize(row)


def _get_row(db, tenant: str, action_id: str) -> BenchmarkAction:
    row = db.query(BenchmarkAction).filter(
        BenchmarkAction.tenant_id == tenant, BenchmarkAction.id == action_id).first()
    if row is None:
        raise HTTPException(404, "action not found")
    return row


def get_action(db, tenant: str, action_id: str) -> dict:
    return serialize(_get_row(db, tenant, action_id))


def list_actions(db, tenant: str, client_id: str | None = None) -> dict:
    q = db.query(BenchmarkAction).filter(BenchmarkAction.tenant_id == tenant)
    if client_id:
        q = q.filter(BenchmarkAction.client_id == client_id)
    rows = q.order_by(BenchmarkAction.created_at.desc()).all()
    return {"actions": [serialize(r) for r in rows], "count": len(rows), "linkage": LINKAGE,
            "benchmark_domain": "benefit_design_and_policy_terms_only"}


def send_to_sandbox(db, principal: dict, action_id: str) -> dict:
    row = _get_row(db, principal["tenant_id"], action_id)
    if not row.simulation_ready:      # governed discussion-only outcome — never force a simulation
        return {"ok": False, "simulation_ready": False,
                "not_ready_reason": row.not_ready_reason or "This feature is discussion-only.",
                "action": serialize(row)}
    row.target_module = "renewal_sandbox"
    row.status = "sent"
    row.updated_at = _now()
    hist = list(row.action_history or [])
    hist.append({"at": _now().isoformat(), "action": "send_to_sandbox", "by": principal.get("sub"),
                 "note": f"sent to Savings Sandbox lever '{row.sandbox_lever}'"})
    row.action_history = hist
    db.commit(); db.refresh(row)
    return {"ok": True, "simulation_ready": True, "sandbox_lever": row.sandbox_lever,
            "action": serialize(row)}


def sandbox_preview(db, principal: dict, action_id: str) -> dict:
    """Read-only preview: delegate to the governed simulation service (no new math). The
    returned simulation envelope is a scenario estimate; operational ICR is unchanged."""
    row = _get_row(db, principal["tenant_id"], action_id)
    base = {"action_id": row.id, "feature_id": row.feature_id, "feature_name": row.feature_name,
            "sandbox_lever": row.sandbox_lever, "simulation_ready": bool(row.simulation_ready),
            "linkage": LINKAGE,
            "note": ("Impact simulation runs in Renewal Intelligence / Savings Sandbox. Benefit "
                     "Benchmarking does not compute cost impact. Output is a scenario estimate, not a "
                     "guaranteed saving; operational ICR is unchanged.")}
    if not row.simulation_ready:
        base["not_ready_reason"] = row.not_ready_reason or "Discussion-only; no simulation lever."
        base["preview"] = None
        return base
    fn = _SIM.get(row.sandbox_lever)
    if fn is None:      # defensive — lever_for already guarantees a mapped lever
        base["not_ready_reason"] = "No simulation dispatcher for this lever."
        base["preview"] = None
        return base
    ctx = SimContext(db, principal["tenant_id"], _filters_of(row))
    try:
        base["preview"] = fn(ctx)       # governed simulation envelope, computed by the sim service
    except ValueError as e:
        raise HTTPException(400, str(e))
    return base


def patch_action(db, principal: dict, action_id: str, *, status=None, selected_action=None) -> dict:
    row = _get_row(db, principal["tenant_id"], action_id)
    changed = []
    if selected_action is not None:
        if selected_action not in VALID_ACTIONS:
            raise HTTPException(400, f"invalid selected_action '{selected_action}'")
        row.selected_action = selected_action
        changed.append(f"selected_action={selected_action}")
    if status is not None:
        if status not in VALID_STATUS:
            raise HTTPException(400, f"invalid status '{status}'")
        row.status = status
        changed.append(f"status={status}")
    if changed:
        row.updated_at = _now()
        hist = list(row.action_history or [])
        hist.append({"at": _now().isoformat(), "action": "patch", "by": principal.get("sub"),
                     "note": ", ".join(changed)})
        row.action_history = hist
        db.commit(); db.refresh(row)
    return serialize(row)


def serialize(row: BenchmarkAction) -> dict:
    return {
        "id": row.id, "tenant_id": row.tenant_id, "client_id": row.client_id,
        "policy_id": row.policy_id, "policy_version_id": row.policy_version_id,
        "feature_id": row.feature_id, "feature_name": row.feature_name,
        "current_client_value": row.current_client_value, "benchmark_value": row.benchmark_value,
        "classification": row.classification, "peer_group_definition": row.peer_group_definition,
        "confidence": row.confidence,
        "confidence_score": float(row.confidence_score) if row.confidence_score is not None else None,
        "evidence": row.evidence, "caveats": row.caveats or [],
        "selected_action": row.selected_action, "target_module": row.target_module,
        "simulation_ready": bool(row.simulation_ready), "sandbox_lever": row.sandbox_lever,
        "not_ready_reason": row.not_ready_reason, "status": row.status,
        "action_history": row.action_history or [], "created_by": row.created_by,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "benchmark_domain": "benefit_design_and_policy_terms_only", "linkage": LINKAGE,
    }
