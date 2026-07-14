import tempfile, pytest
from app.services.storage import LocalObjectStore, ImmutableViolation


def test_write_once_and_idempotent():
    store = LocalObjectStore(tempfile.mkdtemp())
    r1 = store.put_immutable("t/claims/hash/f.csv", b"raw-bytes")
    assert r1["written"] is True
    # same content -> idempotent, not rewritten
    r2 = store.put_immutable("t/claims/hash/f.csv", b"raw-bytes")
    assert r2["written"] is False
    assert store.get("t/claims/hash/f.csv") == b"raw-bytes"


def test_refuses_overwrite_with_different_bytes():
    store = LocalObjectStore(tempfile.mkdtemp())
    store.put_immutable("k", b"original")
    with pytest.raises(ImmutableViolation):
        store.put_immutable("k", b"tampered")
