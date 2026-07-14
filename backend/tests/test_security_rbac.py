import pytest
from app.core.security import create_token, decode_token, Role, has_role


def test_token_roundtrip():
    tok = create_token(subject="u1", tenant_id="acme", role=Role.REVIEWER)
    claims = decode_token(tok)
    assert claims["sub"] == "u1" and claims["tenant_id"] == "acme" and claims["role"] == "reviewer"


def test_role_hierarchy():
    assert has_role(Role.ADMIN, Role.ANALYST)
    assert has_role(Role.REVIEWER, Role.ANALYST)
    assert not has_role(Role.ANALYST, Role.REVIEWER)


def test_bad_token_rejected():
    with pytest.raises(ValueError):
        decode_token("not-a-token")
