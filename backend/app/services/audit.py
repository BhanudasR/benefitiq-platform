"""Append-only audit trail. Every onboarding action is recorded, immutable."""
from ..models.governance import AuditLog


def build_event(*, tenant_id: str, actor: str, action: str, entity_type: str,
                entity_id: str | None = None, meta: dict | None = None) -> dict:
    return {"tenant_id": tenant_id, "actor": actor, "action": action,
            "entity_type": entity_type, "entity_id": entity_id, "meta": meta or {}}


def record(db, **kw) -> AuditLog:
    row = AuditLog(**build_event(**kw))
    db.add(row)
    db.flush()
    return row
