"""Deterministic intent matcher — NO ML, NO LLM. Blocked topics are checked first; otherwise the
question is scored against each intent's trigger keywords (count of distinct hits, tie-break by
registry order). Below threshold -> unsupported, with the closest candidate intents suggested."""
from __future__ import annotations

from .intents import INTENT_REGISTRY, BLOCKED_TOPICS, get_intent


def _norm(q: str) -> str:
    return " " + (q or "").lower().strip() + " "


def blocked_reason(question: str):
    q = _norm(question)
    for b in BLOCKED_TOPICS:
        for p in b["patterns"]:
            if p in q:
                return b["reason"]
    return None


def _score(question_norm: str, intent) -> int:
    return sum(1 for t in intent["triggers"] if t in question_norm)


def match(question: str, explicit_intent: str | None = None) -> dict:
    """Returns {status, intent_id, score, reason, candidates}. status in
    matched | unsupported | blocked. Fully deterministic and explainable."""
    # explicit selection wins (still governed — must be a known intent)
    if explicit_intent:
        it = get_intent(explicit_intent)
        if it:
            return {"status": "matched", "intent_id": it["id"], "score": None,
                    "reason": "explicit intent selected", "candidates": []}
        return {"status": "unsupported", "intent_id": None, "score": 0,
                "reason": f"unknown intent '{explicit_intent}'", "candidates": []}

    br = blocked_reason(question)
    if br:
        return {"status": "blocked", "intent_id": None, "score": 0, "reason": br, "candidates": []}

    q = _norm(question)
    scored = sorted(
        ((_score(q, it), idx, it["id"]) for idx, it in enumerate(INTENT_REGISTRY)),
        key=lambda x: (-x[0], x[1]))
    best_score, _, best_id = scored[0]
    if best_score <= 0:
        return {"status": "unsupported", "intent_id": None, "score": 0,
                "reason": "no governed intent matched the question",
                "candidates": [i["id"] for i in INTENT_REGISTRY[:4]]}
    candidates = [cid for sc, _, cid in scored if sc == best_score]
    return {"status": "matched", "intent_id": best_id, "score": best_score,
            "reason": "best trigger match", "candidates": candidates}
