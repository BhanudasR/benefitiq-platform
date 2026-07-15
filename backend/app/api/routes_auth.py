"""Pilot auth: issue a JWT for a tenant-scoped role. Real IdP/SSO is later phase.
Demo users are env/DB-backed in production; here a minimal issuer for the skeleton."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from ..core.security import create_token, Role
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


@router.get("/me")
def me(principal: dict = Depends(current_principal)):
    """Echo the authenticated principal (tenant/role/sub) for the SPA. No business logic."""
    return {"sub": principal.get("sub"), "tenant_id": principal.get("tenant_id"),
            "role": principal.get("role")}
