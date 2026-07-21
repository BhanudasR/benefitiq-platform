"""Admin User Management APIs (Sprint 14). Additive, protected, tenant-isolated. Only
users with the manage_users capability (Platform/Broker Admin) — or legacy admin tokens —
may call these. Passwords are never returned except the one-time temporary password on
create/reset. Backend is the source of truth for access."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..api.deps import require_admin
from ..core.security import ROLE_DEFS
from ..db.session import get_db
from ..services import users as svc

router = APIRouter(prefix="/admin", tags=["admin"])


class CreateUserReq(BaseModel):
    email: str
    username: str
    user_role: str
    display_name: str | None = None
    broker_id: str | None = None
    client_ids: list[str] = []


class UpdateUserReq(BaseModel):
    display_name: str | None = None
    user_role: str | None = None
    broker_id: str | None = None
    status: str | None = None


class ClientsReq(BaseModel):
    client_ids: list[str] = []


def _actor(principal: dict) -> str:
    return principal.get("sub") or "admin"


@router.get("/roles")
def roles(principal: dict = Depends(require_admin)):
    return {"roles": [{"user_role": k, "label": v["label"], "base_role": v["base"].value,
                       "capabilities": sorted(v["caps"])} for k, v in ROLE_DEFS.items()]}


@router.get("/users")
def list_users(db: Session = Depends(get_db), principal: dict = Depends(require_admin)):
    return {"users": [svc.serialize(u) for u in svc.list_users(db, principal["tenant_id"])]}


@router.post("/users")
def create_user(req: CreateUserReq, db: Session = Depends(get_db), principal: dict = Depends(require_admin)):
    try:
        u, temp = svc.create_user(db, actor=_actor(principal), tenant_id=principal["tenant_id"],
                                  email=req.email, username=req.username, user_role=req.user_role,
                                  display_name=req.display_name, broker_id=req.broker_id,
                                  client_ids=req.client_ids, created_by=_actor(principal))
    except ValueError as e:
        raise HTTPException(400, str(e))
    db.commit()
    # temporary_password is shown to the admin exactly once here; it is not stored in plain text
    return {"user": svc.serialize(u), "temporary_password": temp}


@router.get("/users/{user_id}")
def get_user(user_id: str, db: Session = Depends(get_db), principal: dict = Depends(require_admin)):
    u = svc.get_user(db, principal["tenant_id"], user_id)
    if u is None:
        raise HTTPException(404, "user not found")
    return {"user": svc.serialize(u)}


@router.patch("/users/{user_id}")
def update_user(user_id: str, req: UpdateUserReq, db: Session = Depends(get_db), principal: dict = Depends(require_admin)):
    try:
        u = svc.update_user(db, actor=_actor(principal), tenant_id=principal["tenant_id"], user_id=user_id,
                            display_name=req.display_name, user_role=req.user_role,
                            broker_id=req.broker_id, status=req.status)
    except ValueError as e:
        raise HTTPException(404 if "not found" in str(e) else 400, str(e))
    db.commit()
    return {"user": svc.serialize(u)}


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: str, db: Session = Depends(get_db), principal: dict = Depends(require_admin)):
    try:
        u, temp = svc.reset_password(db, actor=_actor(principal), tenant_id=principal["tenant_id"], user_id=user_id)
    except ValueError as e:
        raise HTTPException(404, str(e))
    db.commit()
    return {"user": svc.serialize(u), "temporary_password": temp}


@router.post("/users/{user_id}/deactivate")
def deactivate(user_id: str, db: Session = Depends(get_db), principal: dict = Depends(require_admin)):
    try:
        u = svc.set_status(db, actor=_actor(principal), tenant_id=principal["tenant_id"], user_id=user_id, active=False)
    except ValueError as e:
        raise HTTPException(404, str(e))
    db.commit()
    return {"user": svc.serialize(u)}


@router.post("/users/{user_id}/activate")
def activate(user_id: str, db: Session = Depends(get_db), principal: dict = Depends(require_admin)):
    try:
        u = svc.set_status(db, actor=_actor(principal), tenant_id=principal["tenant_id"], user_id=user_id, active=True)
    except ValueError as e:
        raise HTTPException(404, str(e))
    db.commit()
    return {"user": svc.serialize(u)}


@router.put("/users/{user_id}/clients")
def set_clients(user_id: str, req: ClientsReq, db: Session = Depends(get_db), principal: dict = Depends(require_admin)):
    try:
        u = svc.set_clients(db, actor=_actor(principal), tenant_id=principal["tenant_id"], user_id=user_id,
                            client_ids=req.client_ids)
    except ValueError as e:
        raise HTTPException(404, str(e))
    db.commit()
    return {"user": svc.serialize(u)}
