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


# --- Sprint 14: expanded testing-phase roles + capability model (additive) ---
# Each granular user_role maps to (a) an existing base Role for backward-compatible route
# auth and (b) a capability set for the new admin/security behaviour. Capabilities:
#   admin · manage_users · upload · approve · view · client_scoped · read_only
#   admin · manage_users · upload · approve · view · client_scoped · read_only · benchmark_action
# Sprint 17 adds `benchmark_action`: flag/send a benchmark gap downstream to Renewal / Sandbox.
# Granted to the acting broker roles; NOT to Client HR Viewer or Read-only Tester.
ROLE_DEFS: dict[str, dict] = {
    "platform_admin": {"base": Role.ADMIN,    "label": "Platform Admin",
                       "caps": {"admin", "manage_users", "upload", "approve", "view", "benchmark_action"}},
    "broker_admin":   {"base": Role.ADMIN,    "label": "Broker Admin",
                       "caps": {"admin", "manage_users", "upload", "approve", "view", "benchmark_action"}},
    "eb_head":        {"base": Role.REVIEWER, "label": "EB Head",
                       "caps": {"upload", "approve", "view", "benchmark_action"}},
    "consultant_rm":  {"base": Role.ANALYST,  "label": "Consultant / RM",
                       "caps": {"upload", "view", "benchmark_action"}},
    "analyst":        {"base": Role.ANALYST,  "label": "Analyst",
                       "caps": {"view", "benchmark_action"}},
    "client_hr_viewer": {"base": Role.ANALYST, "label": "Client HR Viewer",
                       "caps": {"view", "client_scoped"}},
    "read_only_tester": {"base": Role.ANALYST, "label": "Read-only Tester",
                       "caps": {"view", "read_only"}},
}


def role_def(user_role: str) -> dict:
    if user_role not in ROLE_DEFS:
        raise ValueError(f"unknown user_role '{user_role}'")
    return ROLE_DEFS[user_role]


def base_role_for(user_role: str) -> Role:
    return role_def(user_role)["base"]


def capabilities_for(user_role: str) -> list[str]:
    return sorted(role_def(user_role)["caps"])


def create_login_token(*, subject: str, tenant_id: str, user_role: str,
                       broker_id: str | None = None, client_ids: list | None = None) -> str:
    """Token for a real logged-in user: carries the base role (for existing routes) plus
    granular user_role, capabilities, broker_id and client_ids for the new RBAC behaviour."""
    now = datetime.now(timezone.utc)
    claims = {
        "sub": subject, "tenant_id": tenant_id,
        "role": base_role_for(user_role).value,          # existing require_role routes use this
        "user_role": user_role, "capabilities": capabilities_for(user_role),
        "broker_id": broker_id, "client_ids": client_ids or [],
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_ttl_minutes)).timestamp()),
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm=settings.jwt_alg)
