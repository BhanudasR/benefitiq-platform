"""Export composition context — a client-scoped bundle shared by the section builders. The pack
is inherently client-scoped (client_id is required upstream); tenant isolation + client scoping
are enforced at the router (enforce_client_scope) before this is constructed. Read-only."""
from __future__ import annotations

from ...models.canonical import ClientMaster


class ExportContext:
    def __init__(self, db, tenant: str, filters: dict | None = None):
        self.db = db
        self.tenant = tenant
        self.f = filters or {}

    @property
    def client_id(self):
        return self.f.get("client_id")

    def filt(self) -> dict:
        """Fresh filter dict for an engine sub-context (engines mutate their own copy)."""
        return {"client_id": self.client_id}

    def client_name(self) -> str:
        cid = self.client_id
        row = self.db.query(ClientMaster).filter(
            ClientMaster.tenant_id == self.tenant, ClientMaster.client_id == cid).first()
        return row.client_name if row and row.client_name else (cid or "Unknown client")
