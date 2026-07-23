"""Ask service — orchestrates match -> (block/unsupported short-circuit) -> route -> compose into
the governed answer contract. Every answer is grounded in a governed engine envelope; unsupported
and blocked questions return a governed decline with no numbers; a client-scoped intent without a
client returns a governed clarification. Read-only; the route writes the single ASK audit event."""
from __future__ import annotations

from . import CONFIDENCE_FALLBACK
from .intents import get_intent, BLOCKED_MESSAGE, INTENT_REGISTRY
from .matcher import match
from .router import route
from .composer import compose


def _base(question):
    return {
        "question": question, "matched_intent": None, "intent_title": None, "intent_category": None,
        "unsupported": False, "needs_client": False, "answer_summary": None, "key_points": [],
        "supporting_metrics": [], "evidence_refs": [], "source_tables": [], "caveats": [],
        "confidence": None, "data_quality_status": None, "not_available_reason": None,
        "recommended_next_action": None, "candidates": [],
    }


def _unsupported(question, reason, message, candidates):
    out = _base(question)
    out.update({"unsupported": True, "answer_summary": message, "not_available_reason": reason,
                "confidence": "none", "data_quality_status": "No Data", "candidates": candidates})
    return out


def intents_catalogue():
    """Allowed intents for the guided cards (no engine internals leaked)."""
    return [{"id": i["id"], "category": i["category"], "title": i["title"],
             "examples": i["examples"], "scope": i["scope"], "needs_client_id": i["needs_client_id"]}
            for i in INTENT_REGISTRY]


def answer(actx, question: str, explicit_intent: str | None = None) -> dict:
    m = match(question, explicit_intent)

    if m["status"] == "blocked":
        return _unsupported(question, f"blocked:{m['reason']}",
                            BLOCKED_MESSAGE.get(m["reason"], "This request is outside Ask BenefitIQ's governed scope."),
                            [i["id"] for i in INTENT_REGISTRY[:4]])
    if m["status"] == "unsupported":
        return _unsupported(question, "no_supported_intent",
                            "That question is outside Ask BenefitIQ's governed scope. Try one of the supported "
                            "questions — for example portfolio summary, client health, ICR explanation, or renewal stance.",
                            m.get("candidates") or [])

    intent = get_intent(m["intent_id"])
    out = _base(question)
    out.update({"matched_intent": intent["id"], "intent_title": intent["title"],
                "intent_category": intent["category"], "candidates": m.get("candidates") or []})

    # client-scoped intent needs a client — governed clarification, not a guess
    if intent["needs_client_id"] and not actx.client_id:
        out.update({"needs_client": True, "data_quality_status": "No Data", "confidence": "none",
                    "not_available_reason": "client_id required",
                    "answer_summary": f"'{intent['title']}' is a client-specific question — select a client to answer it."})
        return out

    env = route(intent["id"], actx)
    status = env.get("data_quality_status") or "No Data"
    caveats = list(env.get("caveats") or [])
    confidence = env.get("reliability") or env.get("confidence") or CONFIDENCE_FALLBACK.get(status, "none")
    source_tables = env.get("source_tables") or env.get("source_basis") or []
    evidence_refs = [{"engine": intent["engine"], "formula": env.get("formula")}]

    out.update({"data_quality_status": status, "caveats": caveats, "confidence": confidence,
                "source_tables": source_tables, "evidence_refs": evidence_refs})

    if status == "No Data":
        out.update({"answer_summary": "Not available — there is no governed data for this question in the "
                                      "selected scope.",
                    "not_available_reason": "no governed data in scope"})
        return out

    parts = compose(intent["id"], env)
    out.update({"answer_summary": parts["summary"], "key_points": parts["key_points"] or [],
                "supporting_metrics": parts["metrics"] or [], "recommended_next_action": parts["next_action"]})
    return out
