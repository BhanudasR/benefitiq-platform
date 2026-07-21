from fastapi import Depends, Header, HTTPException, status
from ..core.security import decode_token, Role, has_role


def current_principal(authorization: str = Header(default="")) -> dict:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    try:
        claims = decode_token(authorization.split(" ", 1)[1])
    except ValueError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e))
    return claims


def require_role(required: Role):
    def _dep(principal: dict = Depends(current_principal)) -> dict:
        if not has_role(Role(principal["role"]), required):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "insufficient role")
        return principal
    return _dep


# --- Sprint 14: capability / admin guards + client scoping (additive) ---
# Backward compatible: legacy tokens (from /auth/token, no "capabilities" claim) are NOT
# restricted by capability checks. Only real logged-in users (with a capabilities claim)
# are constrained. This keeps all existing routes and tests working unchanged.
def require_capability(cap: str):
    def _dep(principal: dict = Depends(current_principal)) -> dict:
        caps = principal.get("capabilities")
        if caps is None:            # legacy token -> unrestricted (dev/pilot backward-compat)
            return principal
        if cap not in caps:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"missing capability '{cap}'")
        return principal
    return _dep


def require_admin(principal: dict = Depends(current_principal)) -> dict:
    """Admin routes: real users need the manage_users capability; legacy tokens fall back to
    the base ADMIN role so existing dev/admin tokens still work."""
    caps = principal.get("capabilities")
    if caps is not None:
        if "manage_users" not in caps:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "admin capability required")
        return principal
    if not has_role(Role(principal["role"]), Role.ADMIN):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin role required")
    return principal


def enforce_client_scope(principal: dict, filters: dict) -> dict:
    """Client HR Viewer (capability 'client_scoped') may only access their assigned clients.
    No-op for everyone else and for legacy tokens. Mutates/returns the filter dict."""
    caps = principal.get("capabilities") or []
    if "client_scoped" not in caps:
        return filters
    assigned = principal.get("client_ids") or []
    requested = filters.get("client_id")
    if requested:
        if requested not in assigned:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "client not assigned to this user")
        return filters
    if len(assigned) == 1:
        filters["client_id"] = assigned[0]
        return filters
    raise HTTPException(status.HTTP_403_FORBIDDEN, "client_id required (restricted to assigned clients)")
