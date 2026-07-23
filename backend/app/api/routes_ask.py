"""Ask BenefitIQ — governed copilot API (Sprint 26). Deterministic intent routing to the existing
governed engines; answers are evidence-grounded and NON-PERSISTED. No LLM, no external calls, no
new dependency, no migration. `/ask/intents` is a pure read (no audit); `/ask/query` writes exactly
one append-only AuditLog ASK event. Tenant-isolated; client-scoped intents require client_id and
reject a foreign/unassigned client with 403."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session

from ..api.deps import require_role, enforce_client_scope
from ..core.security import Role
from ..db.session import get_db
from ..services import audit
from ..services.ask.router import AskContext
from ..services.ask import service as ask_service

router = APIRouter(prefix="/ask", tags=["ask"])


@router.get("/intents")
def intents(principal: dict = Depends(require_role(Role.ANALYST))):
    # pure read — no audit
    return {"intents": ask_service.intents_catalogue()}


@router.post("/query")
def query(body: dict = Body(...), db: Session = Depends(get_db),
          principal: dict = Depends(require_role(Role.ANALYST))):
    question = (body or {}).get("question") or ""
    explicit_intent = (body or {}).get("intent")
    client_id = (body or {}).get("client_id")

    filters = {"client_id": client_id}
    enforce_client_scope(principal, filters)          # foreign/unassigned client -> 403
    actx = AskContext(db, principal["tenant_id"], filters)

    ans = ask_service.answer(actx, question, explicit_intent)

    # exactly one append-only ASK audit event per query (who asked what, which intent, dq status)
    actor = principal.get("sub") or principal.get("username") or "system"
    audit.record(db, tenant_id=principal["tenant_id"], actor=actor, action="ASK",
                 entity_type="ask_query", entity_id=(filters.get("client_id") or "portfolio"),
                 meta={"question": question[:500], "matched_intent": ans.get("matched_intent"),
                       "unsupported": ans.get("unsupported"), "data_quality_status": ans.get("data_quality_status")})
    db.commit()

    ans["audit"] = {"recorded": True, "action": "ASK"}
    return ans
