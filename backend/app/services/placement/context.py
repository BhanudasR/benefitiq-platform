"""Placement composition context — wraps the governed RecoContext (for the reused placement-
trigger engine) and BenchmarkContext (for claims-free terms + gaps). Both are tenant-scoped
and share the same client/policy filters. Built lazily so each view pays only for what it uses."""
from __future__ import annotations

from ..recommendations.base import RecoContext
from ..benchmarking.base import BenchmarkContext


class PlacementContext:
    def __init__(self, db, tenant: str, filters: dict | None = None):
        self.db = db
        self.tenant = tenant
        self.f = filters or {}
        self._rctx = None
        self._bctx = None

    @property
    def rctx(self) -> RecoContext:
        if self._rctx is None:
            self._rctx = RecoContext(self.db, self.tenant, dict(self.f))
        return self._rctx

    @property
    def bctx(self) -> BenchmarkContext:
        if self._bctx is None:
            self._bctx = BenchmarkContext(self.db, self.tenant, dict(self.f))
        return self._bctx
