"""Portfolio composition context — resolves the tenant's governed client set (honouring any
client-scope filter) and shares filters with the reused engines. Tenant-scoped."""
from __future__ import annotations

from ...models.canonical import PolicyVersion
from ...models.governance import DatasetVersion


class PortfolioContext:
    def __init__(self, db, tenant: str, filters: dict | None = None):
        self.db = db
        self.tenant = tenant
        self.f = filters or {}

    def active_version_ids(self):
        return [v.id for v in self.db.query(DatasetVersion).filter(
            DatasetVersion.tenant_id == self.tenant, DatasetVersion.status == "ACTIVE").all()]

    def client_ids(self):
        """Distinct governed client ids from active-dataset policy versions, honouring the
        client-scope filter (a Client HR Viewer sees only their assigned client)."""
        active = self.active_version_ids()
        if not active:
            return []
        q = self.db.query(PolicyVersion.client_id).filter(
            PolicyVersion.tenant_id == self.tenant,
            PolicyVersion.dataset_version_id.in_(active))
        cid = self.f.get("client_id")
        if cid:
            q = q.filter(PolicyVersion.client_id == cid)
        return sorted({c[0] for c in q.all() if c[0]})
