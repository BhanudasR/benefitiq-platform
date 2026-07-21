"""Admin user-management service (Sprint 14). Governed, tenant-scoped CRUD for real
platform users. Passwords are bcrypt-hashed — plain text is NEVER stored or logged; a
temporary password is returned to the admin exactly once (on create/reset). Every
mutating action is written to the append-only AuditLog."""
from __future__ import annotations

import secrets
from datetime import datetime, timezone

from ..core.security import hash_password, verify_password, base_role_for, ROLE_DEFS
from ..models.governance import User
from . import audit


def _now():
    return datetime.now(timezone.utc)


def _temp_password() -> str:
    """A one-time temporary password. Shown to the admin once; only its hash is stored."""
    return secrets.token_urlsafe(9)


def serialize(u: User) -> dict:
    """Safe user projection for API responses — never includes the password hash."""
    return {
        "id": u.id, "email": u.email, "username": u.username, "display_name": u.display_name,
        "base_role": u.base_role, "user_role": u.user_role,
        "tenant_id": u.tenant_id, "broker_id": u.broker_id,
        "client_ids": list(u.client_ids or []), "assigned_client_count": len(u.client_ids or []),
        "status": u.status,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "updated_at": u.updated_at.isoformat() if u.updated_at else None,
        "created_by": u.created_by,
        "last_login": u.last_login.isoformat() if u.last_login else None,
    }


def _audit(db, *, tenant_id, actor, action, user_id, meta=None):
    audit.record(db, tenant_id=tenant_id, actor=actor, action=action,
                 entity_type="app_user", entity_id=user_id, meta=meta or {})


def create_user(db, *, actor, tenant_id, email, username, user_role,
                display_name=None, broker_id=None, client_ids=None, created_by=None) -> tuple[User, str]:
    if user_role not in ROLE_DEFS:
        raise ValueError(f"unknown user_role '{user_role}'")
    if db.query(User).filter(User.email == email).first():
        raise ValueError("email already exists")
    temp = _temp_password()
    u = User(email=email, username=username, display_name=display_name,
             password_hash=hash_password(temp), base_role=base_role_for(user_role).value,
             user_role=user_role, tenant_id=tenant_id, broker_id=broker_id,
             client_ids=list(client_ids or []), status="active", created_by=created_by or actor)
    db.add(u)
    db.flush()
    _audit(db, tenant_id=tenant_id, actor=actor, action="USER_CREATED", user_id=u.id,
           meta={"email": email, "user_role": user_role})   # NB: no password in audit
    return u, temp


def list_users(db, tenant_id) -> list[User]:
    return db.query(User).filter(User.tenant_id == tenant_id).order_by(User.created_at).all()


def get_user(db, tenant_id, user_id) -> User | None:
    return db.query(User).filter(User.tenant_id == tenant_id, User.id == user_id).first()


def update_user(db, *, actor, tenant_id, user_id, display_name=None, user_role=None,
                broker_id=None, status=None) -> User:
    u = get_user(db, tenant_id, user_id)
    if u is None:
        raise ValueError("user not found")
    role_changed = False
    if display_name is not None:
        u.display_name = display_name
    if broker_id is not None:
        u.broker_id = broker_id
    if status is not None:
        u.status = status
    if user_role is not None and user_role != u.user_role:
        if user_role not in ROLE_DEFS:
            raise ValueError(f"unknown user_role '{user_role}'")
        u.user_role = user_role
        u.base_role = base_role_for(user_role).value
        role_changed = True
    u.updated_at = _now()
    db.flush()
    _audit(db, tenant_id=tenant_id, actor=actor,
           action="ROLE_CHANGED" if role_changed else "USER_UPDATED", user_id=u.id,
           meta={"user_role": u.user_role} if role_changed else {})
    return u


def set_clients(db, *, actor, tenant_id, user_id, client_ids) -> User:
    u = get_user(db, tenant_id, user_id)
    if u is None:
        raise ValueError("user not found")
    u.client_ids = list(client_ids or [])
    u.updated_at = _now()
    db.flush()
    _audit(db, tenant_id=tenant_id, actor=actor, action="CLIENT_ACCESS_CHANGED", user_id=u.id,
           meta={"client_count": len(u.client_ids)})
    return u


def reset_password(db, *, actor, tenant_id, user_id) -> tuple[User, str]:
    u = get_user(db, tenant_id, user_id)
    if u is None:
        raise ValueError("user not found")
    temp = _temp_password()
    u.password_hash = hash_password(temp)
    u.updated_at = _now()
    db.flush()
    _audit(db, tenant_id=tenant_id, actor=actor, action="PASSWORD_RESET", user_id=u.id)  # no pw
    return u, temp


def set_status(db, *, actor, tenant_id, user_id, active: bool) -> User:
    u = get_user(db, tenant_id, user_id)
    if u is None:
        raise ValueError("user not found")
    u.status = "active" if active else "inactive"
    u.updated_at = _now()
    db.flush()
    _audit(db, tenant_id=tenant_id, actor=actor,
           action="USER_ACTIVATED" if active else "USER_DEACTIVATED", user_id=u.id)
    return u


def authenticate(db, *, email, password) -> User | None:
    """Return the user on valid credentials + active status, else None. Deactivated users
    are blocked. Updates last_login and audits a LOGIN event on success."""
    u = db.query(User).filter(User.email == email).first()
    if u is None or u.status != "active":
        return None
    if not verify_password(password, u.password_hash):
        return None
    u.last_login = _now()
    db.flush()
    _audit(db, tenant_id=u.tenant_id, actor=u.email, action="LOGIN", user_id=u.id)
    return u
