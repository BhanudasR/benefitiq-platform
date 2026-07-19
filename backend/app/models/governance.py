"""Governance / trust-layer tables: immutable raw registry, batches, dataset
versions, correction overlays, mapping profiles, review queue, DQ results,
validation issues, admin override records, and an append-only audit log.
Every row is tenant-scoped and preserves lineage. Portable types (sqlite/PG)."""
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
    file_kind: Mapped[str] = mapped_column(String(32))
    field_map: Mapped[dict] = mapped_column(JSON, nullable=True)   # confirmed {source_header: canonical}
    # onboarding state machine
    status: Mapped[str] = mapped_column(String(32), default="UPLOADED")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class DatasetVersion(Base):
    __tablename__ = "dataset_version"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    upload_batch_id: Mapped[str] = mapped_column(ForeignKey("upload_batch.id"))
    version_no: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(24), default="DRAFT")  # DRAFT|APPROVED|ACTIVE|SUPERSEDED
    dq_score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=True)
    dq_result_id: Mapped[str] = mapped_column(String(36), nullable=True)
    readiness_status: Mapped[str] = mapped_column(String(48), nullable=True)  # Analytics Ready|Conditional|Restricted
    restricted: Mapped[bool] = mapped_column(Boolean, default=False)
    approved_by: Mapped[str] = mapped_column(String(128), nullable=True)
    approved_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    activated_by: Mapped[str] = mapped_column(String(128), nullable=True)
    activated_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class CorrectionOverlay(Base):
    """A correction NEVER mutates raw. It records the raw-row reference, field,
    old (raw) value and corrected value, kept as an overlay applied at load time."""
    __tablename__ = "correction_overlay"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    upload_batch_id: Mapped[str] = mapped_column(ForeignKey("upload_batch.id"))
    raw_row_index: Mapped[int] = mapped_column(Integer)
    field: Mapped[str] = mapped_column(String(128))              # canonical field
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
    file_kind: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(128))
    signature: Mapped[str] = mapped_column(String(32), index=True)
    field_map: Mapped[dict] = mapped_column(JSON)
    created_by: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    times_reused: Mapped[int] = mapped_column(Integer, default=0)
    version: Mapped[int] = mapped_column(Integer, default=1)          # bumped on each confirmed change
    priority: Mapped[int] = mapped_column(Integer, default=0)         # user-confirmed profiles rank higher
    ignored_columns: Mapped[dict] = mapped_column(JSON, nullable=True)  # columns user marked "not required"


class ReviewItem(Base):
    """Persisted review-queue entry (row-level). Quarantined rows carry a proposed
    correction action. Regenerated on each (re)validation for the batch."""
    __tablename__ = "review_item"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    upload_batch_id: Mapped[str] = mapped_column(ForeignKey("upload_batch.id"))
    raw_row_index: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16))             # clean|warn|quarantine
    proposed_action: Mapped[str] = mapped_column(Text, nullable=True)
    issues: Mapped[dict] = mapped_column(JSON, nullable=True)   # list of issues for this row
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


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


class OverrideRecord(Base):
    """Admin override for a below-threshold (DQ < 70) dataset. Loads Restricted only,
    never critical rows. Captures the full governance context for audit."""
    __tablename__ = "override_record"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    dataset_version_id: Mapped[str] = mapped_column(ForeignKey("dataset_version.id"))
    upload_batch_id: Mapped[str] = mapped_column(String(36))
    admin_user: Mapped[str] = mapped_column(String(128))
    dq_score: Mapped[float] = mapped_column(Numeric(5, 2))
    failed_components: Mapped[dict] = mapped_column(JSON)     # components below full marks
    impacted_modules: Mapped[dict] = mapped_column(JSON)     # modules affected by the caveat
    reason: Mapped[str] = mapped_column(Text)                # mandatory
    resulting_status: Mapped[str] = mapped_column(String(48))  # Restricted / Not Reliable...
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class MappingAudit(Base):
    """Audit of every manual mapping decision (map / ignore / alias). Captures the
    before/after so mapping changes are fully traceable and versioned."""
    __tablename__ = "mapping_audit"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    upload_batch_id: Mapped[str] = mapped_column(String(36), nullable=True)
    mapping_profile_id: Mapped[str] = mapped_column(String(36), nullable=True)
    mapping_profile_version: Mapped[int] = mapped_column(Integer, nullable=True)
    raw_column: Mapped[str] = mapped_column(String(255))
    selected_canonical: Mapped[str] = mapped_column(String(128), nullable=True)
    previous_suggestion: Mapped[str] = mapped_column(String(128), nullable=True)
    confidence_before: Mapped[float] = mapped_column(Numeric(5, 3), nullable=True)
    decision: Mapped[str] = mapped_column(String(16))     # map|ignore|alias
    reason: Mapped[str] = mapped_column(Text, nullable=True)
    actor: Mapped[str] = mapped_column(String(128))
    at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class MetricConfig(Base):
    """Tenant-scoped analytics configuration. Large-claim threshold defaults to
    Rs 10 lakh; configurable per tenant now (per client/policy later)."""
    __tablename__ = "metric_config"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True, unique=True)
    large_claim_threshold: Mapped[float] = mapped_column(Numeric(18, 2), default=1000000)
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class SimulationConfig(Base):
    """Tenant-scoped simulation lever defaults (overridable per request). Percentages
    are fractions (0.01 = 1%). Not actuarial rates — governed 'what-if' defaults."""
    __tablename__ = "simulation_config"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True, unique=True)
    room_rent_pct: Mapped[float] = mapped_column(Numeric(6, 4), default=0.01)     # allowed RR = SI x pct
    copay_pct: Mapped[float] = mapped_column(Numeric(6, 4), default=0.10)
    parent_copay_pct: Mapped[float] = mapped_column(Numeric(6, 4), default=0.20)
    disease_cap: Mapped[float] = mapped_column(Numeric(18, 2), nullable=True)
    maternity_sublimit: Mapped[float] = mapped_column(Numeric(18, 2), default=50000)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class RecommendationConfig(Base):
    """Tenant-scoped governed thresholds for the recommendation engines (Sprint 10).
    ICR bands, incumbent-defensibility / RFQ-readiness cutoffs and confidence weights
    live here so decision thresholds are governed, versioned, auditable and explainable
    — never hidden only inside code. Safe defaults apply when no tenant row exists.
    ICR bands are percentages (e.g. 120 = 120%); cutoffs/weights are fractions (0..1)."""
    __tablename__ = "recommendation_config"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True, unique=True)
    # ICR bands (operational ICR %): <=defend comfortable; <=negotiate moderate; <=redesign high; above => place
    icr_defend_max: Mapped[float] = mapped_column(Numeric(8, 2), default=100.0)
    icr_negotiate_max: Mapped[float] = mapped_column(Numeric(8, 2), default=120.0)
    icr_redesign_max: Mapped[float] = mapped_column(Numeric(8, 2), default=150.0)
    # one-off large-claim incurred share (fraction) at/above which loss is "event-driven" and defendable
    one_off_share_defend_min: Mapped[float] = mapped_column(Numeric(6, 4), default=0.30)
    # YoY ICR worsening (percentage points) beyond which the trend is treated as adverse
    trend_worsening_pct: Mapped[float] = mapped_column(Numeric(8, 2), default=10.0)
    # placement decision cutoffs (fractions 0..1)
    incumbent_defence_strong_min: Mapped[float] = mapped_column(Numeric(6, 4), default=0.65)
    rfq_ready_min: Mapped[float] = mapped_column(Numeric(6, 4), default=0.60)
    # confidence model weights (fractions; should sum to ~1)
    weight_data_quality: Mapped[float] = mapped_column(Numeric(6, 4), default=0.60)
    weight_evidence_completeness: Mapped[float] = mapped_column(Numeric(6, 4), default=0.40)
    config_version: Mapped[str] = mapped_column(String(32), default="v1-default")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class WellnessConfig(Base):
    """Tenant-scoped governed thresholds + privacy settings for the Wellness engines
    (Sprint 12). Opportunity cutoffs, k-anonymity minimum cohort size and confidence
    weights are governed, versioned, auditable and explainable — never hidden only in
    code. Safe defaults apply when no tenant row exists. Shares are fractions (0..1)."""
    __tablename__ = "wellness_config"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True, unique=True)
    # a wellness category is an "opportunity" when it clears BOTH cutoffs
    opportunity_min_share: Mapped[float] = mapped_column(Numeric(6, 4), default=0.05)   # of incurred
    min_claim_count: Mapped[int] = mapped_column(Integer, default=2)
    # privacy: cohorts smaller than this are suppressed (never exposed)
    k_anonymity_min_cohort_size: Mapped[int] = mapped_column(Integer, default=5)
    # confidence model weights (fractions; should sum to ~1)
    weight_data_quality: Mapped[float] = mapped_column(Numeric(6, 4), default=0.60)
    weight_evidence_completeness: Mapped[float] = mapped_column(Numeric(6, 4), default=0.40)
    config_version: Mapped[str] = mapped_column(String(32), default="v1-default")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class TermsAudit(Base):
    """Audit of every terms confirmation / rejection / ignore decision (before/after)."""
    __tablename__ = "terms_audit"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    benefit_term_id: Mapped[str] = mapped_column(String(36), index=True)
    action: Mapped[str] = mapped_column(String(16))       # confirm|reject|ignore
    before_status: Mapped[str] = mapped_column(String(16), nullable=True)
    after_status: Mapped[str] = mapped_column(String(16))
    before_value: Mapped[str] = mapped_column(String(64), nullable=True)
    after_value: Mapped[str] = mapped_column(String(64), nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=True)
    actor: Mapped[str] = mapped_column(String(128))
    at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    actor: Mapped[str] = mapped_column(String(128))
    action: Mapped[str] = mapped_column(String(64))       # UPLOAD|MAP|VALIDATE|DQ|CORRECT|REVALIDATE|APPROVE|ACTIVATE|OVERRIDE|LOAD
    entity_type: Mapped[str] = mapped_column(String(64))
    entity_id: Mapped[str] = mapped_column(String(64), nullable=True)
    meta: Mapped[dict] = mapped_column(JSON, nullable=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=_now)
