"""Immutable object store for raw uploads.

Contract: content-addressed, write-once. Re-writing the same key with the SAME
bytes is idempotent; re-writing with DIFFERENT bytes raises ImmutableViolation.
Raw files are NEVER overwritten or modified — corrections live in overlays.
Backends: local filesystem (dev/test) or S3-compatible (MinIO/AWS Mumbai).
"""
from __future__ import annotations
import os
from .hashing import sha256_bytes


class ImmutableViolation(Exception):
    pass


class LocalObjectStore:
    def __init__(self, root: str):
        self.root = root
        os.makedirs(root, exist_ok=True)

    def _path(self, key: str) -> str:
        p = os.path.join(self.root, key)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        return p

    def put_immutable(self, key: str, data: bytes) -> dict:
        p = self._path(key)
        digest = sha256_bytes(data)
        if os.path.exists(p):
            existing = open(p, "rb").read()
            if sha256_bytes(existing) != digest:
                raise ImmutableViolation(f"Refusing to overwrite existing raw object at {key}")
            return {"key": key, "sha256": digest, "size": len(data), "written": False}
        with open(p, "wb") as f:
            f.write(data)
        try:
            os.chmod(p, 0o444)  # read-only: raw is immutable
        except OSError:
            pass
        return {"key": key, "sha256": digest, "size": len(data), "written": True}

    def get(self, key: str) -> bytes:
        with open(self._path(key), "rb") as f:
            return f.read()

    def exists(self, key: str) -> bool:
        return os.path.exists(self._path(key))


def get_store(settings=None):
    from ..core.config import settings as s
    s = settings or s
    if s.storage_backend == "local":
        return LocalObjectStore(s.storage_local_root)
    raise NotImplementedError("S3 backend wired in infra; use local for dev/test")
