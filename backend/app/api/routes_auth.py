"""Pilot auth. `/auth/token` is the dev/pilot mint (unchanged) used by tests and internal
tools. `/auth/login` (Sprint 14) authenticates REAL admin-managed users by email+password,
blocks deactivated users, updates last_login, audits the login, and mints a token carrying
the base role plus granular user_role, capabilities, broker_id and client_ids."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..core.security import create_token, create_login_token, Role
from ..db.session import get_db
from ..services import users as user_svc
from .deps import current_principal

router = APIRouter(prefix="/auth", tags=["auth"])


class TokenRequest(BaseModel):
    username: str
    tenant_id: str
    role: Role = Role.ANALYST


@router.post("/token")
def issue_token(req: TokenRequest):
    tok = create_token(subject=req.username, tenant_id=req.tenant_id, role=req.role)
    return {"access_token": tok, "token_type": "bearer", "role": req.role.value,
            "tenant_id": req.tenant_id}


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    """Real-user login. 401 on bad credentials OR deactivated user (no distinction leaked)."""
    u = user_svc.authenticate(db, email=req.email, password=req.password)
    if u is None:
        raise HTTPException(401, "invalid credentials or inactive user")
    db.commit()
    tok = create_login_token(subject=u.email, tenant_id=u.tenant_id, user_role=u.user_role,
                             broker_id=u.broker_id, client_ids=list(u.client_ids or []))
    return {"access_token": tok, "token_type": "bearer", "role": u.base_role,
            "user_role": u.user_role, "tenant_id": u.tenant_id}


@router.get("/me")
def me(principal: dict = Depends(current_principal)):
    """Echo the authenticated principal for the SPA. Adds granular RBAC fields when present
    (real-login tokens); legacy tokens still return sub/tenant/role unchanged."""
    return {"sub": principal.get("sub"), "tenant_id": principal.get("tenant_id"),
            "role": principal.get("role"),
            "user_role": principal.get("user_role"),
            "capabilities": principal.get("capabilities"),
            "broker_id": principal.get("broker_id"),
            "client_ids": principal.get("client_ids")}
