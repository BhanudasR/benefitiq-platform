"""Governance / trust-layer tables: immutable raw registry, batches, versions,
correction overlays, mapping profiles, DQ results, validation issues, and an
append-only audit log. Every row is tenant-scoped and preserves lineage.
Portable types (sqlite/PG)."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime, Boolean, Numeric, JSON, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from ..db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class RawFile(Base):
    __tablename__ = "raw_file"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    client_id: Mapped[str] = mapped_column(String(64), nullable=True)
    file_kind: Mapped[str] = mapped_column(String(32))          # policy|member|claims|terms|benchmark|pdf
    file_name: Mapped[str] = mapped_column(String(512))
    storage_key: Mapped[str] = mapped_column(String(512))       # object-store key (content addressed)
    sha256: Mapped[str] = mapped_column(String(64), index=True) # integrity
    size_bytes: Mapped[int] = mapped_column(Integer)
    uploaded_by: Mapped[str] = mapped_column(String(128))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    immutable: Mapped[bool] = mapped_column(Boolean, default=True)


class UploadBatch(Base):
    __tablename__ = "upload_batch"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    raw_file_id: Mapped[str] = mapped_column(ForeignKey("raw_file.id"))
    status: Mapped[str] = mapped_column(String(32), default="UPLOADED")  # onboarding state machine
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class DatasetVersion(Base):
    __tablename__ = "dataset_version"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    upload_batch_id: Mapped[str] = mapped_column(ForeignKey("upload_batch.id"))
    version_no: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(24), default="DRAFT")  # DRAFT|APPROVED|ACTIVE|SUPERSEDED
    approved_by: Mapped[str] = mapped_column(String(128), nullable=True)
    approved_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class CorrectionOverlay(Base):
    """A correction NEVER mutates raw. It records the raw-row reference, field,
    old (raw) value and corrected value, kept as an overlay applied at load time."""
    __tablename__ = "correction_overlay"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    upload_batch_id: Mapped[str] = mapped_column(ForeignKey("upload_batch.id"))
    raw_row_index: Mapped[int] = mapped_column(Integer)
    field: Mapped[str] = mapped_column(String(128))
    raw_value: Mapped[str] = mapped_column(Text, nullable=True)
    corrected_value: Mapped[str] = mapped_column(Text, nullable=True)
    corrected_by: Mapped[str] = mapped_column(String(128))
    corrected_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class MappingProfile(Base):
    """A reviewer-confirmed source->canonical mapping, reusable for the next file
    with the same layout (matched by `signature`). Tenant + insurer/TPA scoped."""
    __tablename__ = "mapping_profile"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    file_kind: Mapped[str] = mapped_column(String(32))            # policy|member|claims
    name: Mapped[str] = mapped_column(String(128))
    signature: Mapped[str] = mapped_column(String(32), index=True)  # layout signature
    field_map: Mapped[dict] = mapped_column(JSON)                 # {source_header: canonical}
    created_by: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    times_reused: Mapped[int] = mapped_column(Integer, default=0)


class ValidationIssue(Base):
    __tablename__ = "validation_issue"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    upload_batch_id: Mapped[str] = mapped_column(ForeignKey("upload_batch.id"))
    raw_row_index: Mapped[int] = mapped_column(Integer, nullable=True)
    severity: Mapped[str] = mapped_column(String(16))  # ERROR|WARNING|INFO
    field: Mapped[str] = mapped_column(String(128), nullable=True)
    rule: Mapped[str] = mapped_column(String(128))
    message: Mapped[str] = mapped_column(Text)
    quarantined: Mapped[bool] = mapped_column(Boolean, default=False)


class DQResult(Base):
    __tablename__ = "dq_result"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    upload_batch_id: Mapped[str] = mapped_column(ForeignKey("upload_batch.id"))
    overall_score: Mapped[float] = mapped_column(Numeric(5, 2))
    readiness: Mapped[str] = mapped_column(String(32))  # Analytics Ready | Conditional | Not Reliable
    components: Mapped[dict] = mapped_column(JSON)       # per-component breakdown (explainability)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    actor: Mapped[str] = mapped_column(String(128))
    action: Mapped[str] = mapped_column(String(64))       # UPLOAD|MAP|VALIDATE|DQ|CORRECT|REVALIDATE|APPROVE|ACTIVATE
    entity_type: Mapped[str] = mapped_column(String(64))
    entity_id: Mapped[str] = mapped_column(String(64), nullable=True)
    meta: Mapped[dict] = mapped_column(JSON, nullable=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=_now)
