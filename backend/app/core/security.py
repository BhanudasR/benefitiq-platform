"""Auth + RBAC skeleton. JWT bearer tokens; tenant-scoped role checks.

Roles (pilot): ADMIN > REVIEWER > ANALYST. Every principal carries a tenant_id
so all data access is tenant-isolated. Full SSO/deep RBAC is a later phase.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from enum import Enum
from jose import jwt, JWTError
from passlib.context import CryptContext
from .config import settings

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


class Role(str, Enum):
    ADMIN = "admin"
    REVIEWER = "reviewer"
    ANALYST = "analyst"


_ORDER = {Role.ANALYST: 1, Role.REVIEWER: 2, Role.ADMIN: 3}


def hash_password(p: str) -> str:
    return pwd.hash(p)


def verify_password(p: str, h: str) -> bool:
    return pwd.verify(p, h)


def create_token(*, subject: str, tenant_id: str, role: Role) -> str:
    now = datetime.now(timezone.utc)
    claims = {
        "sub": subject, "tenant_id": tenant_id, "role": role.value,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_ttl_minutes)).timestamp()),
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm=settings.jwt_alg)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_alg])
    except JWTError as e:
        raise ValueError(f"invalid token: {e}")


def has_role(actual: Role, required: Role) -> bool:
    return _ORDER[actual] >= _ORDER[required]
