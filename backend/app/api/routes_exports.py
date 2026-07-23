"""Governed Client Pack / Export APIs (Sprint 25). Read-only composition of the existing engines
into a boardroom-ready client pack (contract), plus an on-demand `generate` that returns the same
contract and writes exactly ONE append-only AuditLog EXPORT event. No file is generated or
persisted (v1 = dependency-free print-ready pack; browser Print -> PDF). client_id is REQUIRED;
tenant-isolated; Client HR Viewers auto-scoped to their assigned client (foreign client_id -> 403).
No raw member/claim rows; no PII; no migration."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Body
from sqlalchemy.orm import Session

from ..api.deps import require_role, enforce_client_scope
from ..core.security import Role
from ..db.session import get_db
from ..services import audit
from ..services.exports.context import ExportContext
from ..services.exports import builder as ex_builder, readiness as ex_readiness

router = APIRouter(prefix="/exports", tags=["exports"])


def _ctx(principal, db, client_id):
    filters = {"client_id": client_id}
    enforce_client_scope(principal, filters)          # foreign/unassigned client -> 403
    return ExportContext(db, principal["tenant_id"], filters)


def _split(sections: str | None):
    if not sections:
        return None
    return [s.strip() for s in sections.split(",") if s.strip()]


@router.get("/client-pack/sections")
def client_pack_sections(client_id: str = Query(...), sections: str | None = Query(None),
                         pack_type: str | None = Query(None), db: Session = Depends(get_db),
                         principal: dict = Depends(require_role(Role.ANALYST))):
    ctx = _ctx(principal, db, client_id)
    return ex_readiness.pack_sections_catalogue(ctx, _split(sections), pack_type)


@router.get("/client-pack/preview")
def client_pack_preview(client_id: str = Query(...), sections: str | None = Query(None),
                        pack_type: str | None = Query(None), db: Session = Depends(get_db),
                        principal: dict = Depends(require_role(Role.ANALYST))):
    # pure read — NO audit event is written on preview
    ctx = _ctx(principal, db, client_id)
    return ex_builder.build_pack(ctx, _split(sections), pack_type)


@router.post("/client-pack/generate")
def client_pack_generate(client_id: str = Query(...), sections: str | None = Query(None),
                         pack_type: str | None = Query(None), body: dict = Body(default=None),
                         db: Session = Depends(get_db),
                         principal: dict = Depends(require_role(Role.ANALYST))):
    body = body or {}
    req_sections = _split(sections) or body.get("sections")
    req_pack_type = pack_type or body.get("pack_type")
    ctx = _ctx(principal, db, client_id)
    pack = ex_builder.build_pack(ctx, req_sections, req_pack_type)

    # exactly one append-only EXPORT audit event (who exported which client's pack + sections)
    actor = principal.get("sub") or principal.get("username") or "system"
    v = pack.get("value") or {}
    audit.record(db, tenant_id=principal["tenant_id"], actor=actor, action="EXPORT",
                 entity_type="client_pack", entity_id=client_id,
                 meta={"sections": v.get("included_section_ids"), "pack_type": v.get("pack_type"),
                       "pack_status": v.get("pack_status"), "directional": v.get("directional")})
    db.commit()

    pack["audit"] = {"recorded": True, "action": "EXPORT", "entity_type": "client_pack",
                     "entity_id": client_id}
    return pack
