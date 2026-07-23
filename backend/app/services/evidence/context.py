"""Evidence composition context — resolves the tenant's governed dataset / upload set, honouring
any client-scope filter. Tenant-isolated and READ-ONLY. RawFile.client_id is the per-file client
tag used for client scoping, so a Client HR Viewer only ever sees their assigned client's files.

No canonical claims/member reads happen here (this is a governance-METADATA view); it never
mutates state and never recomputes DQ."""
from __future__ import annotations

from ...models.governance import (DatasetVersion, DQResult, UploadBatch, RawFile,
                                   ValidationIssue, ReviewItem, MappingAudit, OverrideRecord)


class EvidenceContext:
    def __init__(self, db, tenant: str, filters: dict | None = None):
        self.db = db
        self.tenant = tenant
        self.f = filters or {}
        self._bids = None

    @property
    def client_id(self):
        return self.f.get("client_id")

    # -- scoped upload batches (the spine everything hangs off) -----------------
    def batch_ids(self):
        if self._bids is None:
            q = self.db.query(UploadBatch.id).filter(UploadBatch.tenant_id == self.tenant)
            cid = self.client_id
            if cid:
                q = q.join(RawFile, RawFile.id == UploadBatch.raw_file_id).filter(
                    RawFile.client_id == cid)
            self._bids = [r[0] for r in q.all()]
        return self._bids

    def batch(self, batch_id):
        return self.db.query(UploadBatch).filter(UploadBatch.id == batch_id).first()

    def raw_file(self, batch):
        if not batch:
            return None
        return self.db.query(RawFile).filter(RawFile.id == batch.raw_file_id).first()

    # -- datasets --------------------------------------------------------------
    def datasets(self, status: str | None = None):
        bids = self.batch_ids()
        if not bids:
            return []
        q = self.db.query(DatasetVersion).filter(
            DatasetVersion.tenant_id == self.tenant,
            DatasetVersion.upload_batch_id.in_(bids))
        if status:
            q = q.filter(DatasetVersion.status == status)
        return q.order_by(DatasetVersion.created_at.asc()).all()

    def active_datasets(self):
        return self.datasets(status="ACTIVE")

    def dq_result(self, dv):
        """The persisted DQResult for a dataset version (by explicit link, else the latest for its
        batch). Never recomputed — read straight from what the pipeline stored."""
        if getattr(dv, "dq_result_id", None):
            r = self.db.query(DQResult).filter(DQResult.id == dv.dq_result_id).first()
            if r:
                return r
        return self.db.query(DQResult).filter(
            DQResult.tenant_id == self.tenant,
            DQResult.upload_batch_id == dv.upload_batch_id
        ).order_by(DQResult.created_at.desc()).first()

    def dataset_descriptors(self, status: str | None = None):
        """Join each dataset version to its batch, raw file and DQ result — the shared building
        block for overview / readiness / lineage / evidence."""
        out = []
        for dv in self.datasets(status=status):
            b = self.batch(dv.upload_batch_id)
            out.append({
                "dv": dv, "batch": b, "raw": self.raw_file(b), "dq": self.dq_result(dv),
                "file_kind": (b.file_kind if b else None),
            })
        return out

    # -- issues / review / mapping / overrides ---------------------------------
    def issues(self, severity: str | None = None):
        bids = self.batch_ids()
        if not bids:
            return []
        q = self.db.query(ValidationIssue).filter(
            ValidationIssue.tenant_id == self.tenant,
            ValidationIssue.upload_batch_id.in_(bids))
        if severity:
            q = q.filter(ValidationIssue.severity == severity)
        return q.all()

    def review_items(self):
        bids = self.batch_ids()
        if not bids:
            return []
        return self.db.query(ReviewItem).filter(
            ReviewItem.tenant_id == self.tenant,
            ReviewItem.upload_batch_id.in_(bids)).all()

    def mapping_audits(self):
        bids = self.batch_ids()
        if not bids:
            return []
        return self.db.query(MappingAudit).filter(
            MappingAudit.tenant_id == self.tenant,
            MappingAudit.upload_batch_id.in_(bids)).all()

    def override_records(self):
        dv_ids = [d.id for d in self.datasets()]
        if not dv_ids:
            return []
        return self.db.query(OverrideRecord).filter(
            OverrideRecord.tenant_id == self.tenant,
            OverrideRecord.dataset_version_id.in_(dv_ids)).all()
