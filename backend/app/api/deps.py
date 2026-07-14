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
