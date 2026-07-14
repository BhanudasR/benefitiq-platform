from app.services.hashing import sha256_bytes


def test_sha256_deterministic():
    assert sha256_bytes(b"abc") == sha256_bytes(b"abc")
    assert sha256_bytes(b"abc") != sha256_bytes(b"abd")
    assert len(sha256_bytes(b"x")) == 64
