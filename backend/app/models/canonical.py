"""Canonical tables (aligned to IRDAI F15 + BenefitIQ v2 data dictionaries).

Multi-year by design: DatasetVersion = upload/governance version; PolicyVersion =
business policy-year / renewal-cycle version. Every canonical Policy/Member/Claim/
BillComponent row preserves data lineage (upload_batch + raw_file + raw_row) AND,
where resolvable, links to a PolicyVersion (policy_version_id + policy_year). If the
policy year cannot be resolved the row still loads with linkage_status='unresolved'
(never silently assigned). `claim_bill_component` enables future room-rent maths."""
import uuid
from sqlalchemy import String, Integer, Date, Numeric, Boolean, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column
from ..db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class _Lineage:
    """Data-lineage + governance flags carried by every canonical row."""
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    dataset_version_id: Mapped[str] = mapped_column(String(36), index=True)
    upload_batch_id: Mapped[str] = mapped_column(String(36))
    raw_file_id: Mapped[str] = mapped_column(String(36))
    raw_row_index: Mapped[int] = mapped_column(Integer)
    # governance flags propagated from the dataset version at load time so every
    # downstream metric inherits the dataset's trust level (Gold Standard rule 14).
    data_quality_caveat: Mapped[bool] = mapped_column(Boolean, default=False)
    restricted: Mapped[bool] = mapped_column(Boolean, default=False)


class _YearLink:
    """Multi-year business linkage. policy_version_id/policy_year resolved where
    possible; linkage_status='resolved'|'unresolved' (unresolved => caveat surfaced
    in the LoadOutcome, never a silent year assignment)."""
    policy_version_id: Mapped[str] = mapped_column(String(36), index=True, nullable=True)
    policy_year: Mapped[int] = mapped_column(Integer, index=True, nullable=True)
    linkage_status: Mapped[str] = mapped_column(String(16), default="resolved")


class PolicyVersion(_Lineage, Base):
    """Business policy-year / renewal-cycle version. Multiple versions per
    client+policy_number across years; prior years are never overwritten."""
    __tablename__ = "policy_version"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    client_id: Mapped[str] = mapped_column(String(64), nullable=True, index=True)
    policy_number: Mapped[str] = mapped_column(String(100), index=True)
    policy_year: Mapped[int] = mapped_column(Integer, index=True, nullable=True)
    policy_start_date: Mapped["Date"] = mapped_column(Date, nullable=True)
    policy_end_date: Mapped["Date"] = mapped_column(Date, nullable=True)
    renewal_cycle: Mapped[int] = mapped_column(Integer, nullable=True)  # 1st, 2nd, 3rd year...
    status: Mapped[str] = mapped_column(String(16), default="active")   # expiring|renewal|active|expired|superseded
    insurer_code: Mapped[str] = mapped_column(String(20), nullable=True)
    tpa_code: Mapped[str] = mapped_column(String(20), nullable=True)
    premium: Mapped[float] = mapped_column(Numeric(18, 2), nullable=True)
    sum_insured_structure: Mapped[dict] = mapped_column(JSON, nullable=True)
    source_dataset_version_id: Mapped[str] = mapped_column(String(36), index=True)


class ClientMaster(_Lineage, Base):
    __tablename__ = "client_master"
    client_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    client_name: Mapped[str] = mapped_column(String(255))
    primary_industry: Mapped[str] = mapped_column(String(150), nullable=True)
    total_employee_count: Mapped[int] = mapped_column(Integer, nullable=True)


class PolicyMaster(_Lineage, _YearLink, Base):
    __tablename__ = "policy_master"
    policy_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    client_id: Mapped[str] = mapped_column(String(36), nullable=True)
    policy_number: Mapped[str] = mapped_column(String(100), index=True)
    master_policy_number: Mapped[str] = mapped_column(String(100), nullable=True)
    insurer_code: Mapped[str] = mapped_column(String(20), nullable=True)
    tpa_code: Mapped[str] = mapped_column(String(20), nullable=True)
    product_type: Mapped[str] = mapped_column(String(10), nullable=True)
    policy_type: Mapped[str] = mapped_column(String(10), nullable=True)
    policy_start_date: Mapped["Date"] = mapped_column(Date, nullable=True)
    policy_end_date: Mapped["Date"] = mapped_column(Date, nullable=True)
    policy_premium: Mapped[float] = mapped_column(Numeric(18, 2), nullable=True)
    corporate_floater_sum_insured: Mapped[float] = mapped_column(Numeric(18, 2), nullable=True)


class MemberMaster(_Lineage, _YearLink, Base):
    __tablename__ = "member_master"
    member_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    policy_number: Mapped[str] = mapped_column(String(100), index=True)
    member_reference_key: Mapped[str] = mapped_column(String(50), index=True)
    employee_id: Mapped[str] = mapped_column(String(20), nullable=True)
    family_id: Mapped[str] = mapped_column(String(40), nullable=True, index=True)
    date_of_birth: Mapped["Date"] = mapped_column(Date, nullable=True)
    age: Mapped[int] = mapped_column(Integer, nullable=True)
    gender: Mapped[str] = mapped_column(String(10), nullable=True)          # normalized
    sum_insured: Mapped[float] = mapped_column(Numeric(18, 2), nullable=True)
    relationship: Mapped[str] = mapped_column(String(30), nullable=True)    # normalized
    coverage_start: Mapped["Date"] = mapped_column(Date, nullable=True)
    coverage_end: Mapped["Date"] = mapped_column(Date, nullable=True)


class MemberCoverage(_Lineage, _YearLink, Base):
    """Year-wise coverage for a member under a policy version. Preserves history
    across years rather than overwriting the member record."""
    __tablename__ = "member_coverage"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    member_reference_key: Mapped[str] = mapped_column(String(50), index=True)
    policy_number: Mapped[str] = mapped_column(String(100), index=True)
    family_id: Mapped[str] = mapped_column(String(40), nullable=True)
    sum_insured: Mapped[float] = mapped_column(Numeric(18, 2), nullable=True)
    coverage_start: Mapped["Date"] = mapped_column(Date, nullable=True)
    coverage_end: Mapped["Date"] = mapped_column(Date, nullable=True)


class Claim(_Lineage, _YearLink, Base):
    __tablename__ = "claim"
    claim_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    policy_number: Mapped[str] = mapped_column(String(100), index=True)
    claim_number: Mapped[str] = mapped_column(String(30), index=True)
    member_reference_key: Mapped[str] = mapped_column(String(50), nullable=True)
    # resolved linkage (nullable; linkage_status conveys resolution)
    policy_id: Mapped[str] = mapped_column(String(36), nullable=True)
    member_id: Mapped[str] = mapped_column(String(36), nullable=True)
    diagnosis_code_l1: Mapped[str] = mapped_column(String(20), nullable=True)
    hospital_name: Mapped[str] = mapped_column(String(120), nullable=True)
    provider_code: Mapped[str] = mapped_column(String(40), nullable=True)
    date_of_admission: Mapped["Date"] = mapped_column(Date, nullable=True)
    date_of_discharge: Mapped["Date"] = mapped_column(Date, nullable=True)
    sum_insured: Mapped[float] = mapped_column(Numeric(18, 2), nullable=True)
    total_amount_claimed: Mapped[float] = mapped_column(Numeric(18, 2), nullable=True)
    total_claim_paid: Mapped[float] = mapped_column(Numeric(18, 2), nullable=True)
    outstanding_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=True)
    incurred_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=True)
    claim_type: Mapped[str] = mapped_column(String(24), nullable=True)
    claim_status: Mapped[str] = mapped_column(String(24), nullable=True)     # normalized
    hospital_is_network: Mapped[bool] = mapped_column(Boolean, nullable=True)
    copay_percentage: Mapped[float] = mapped_column(Numeric(5, 2), nullable=True)
    bill_breakup_available: Mapped[bool] = mapped_column(Boolean, default=False)  # future-simulation reliability


class ClaimBillComponent(_Lineage, _YearLink, Base):
    """Bill breakup enabling future room-rent proportionate deduction + cap maths.
    Sprint 3 loads components; NO simulation/ICR is computed here."""
    __tablename__ = "claim_bill_component"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    claim_number: Mapped[str] = mapped_column(String(30), index=True)
    component: Mapped[str] = mapped_column(String(48))
    # room|icu|nursing|doctor_fees|procedure|diagnostics|medicines|implants|consumables|package|deduction|misc
    amount_claimed: Mapped[float] = mapped_column(Numeric(18, 2), nullable=True)
    deduction_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=True)
    room_rent_linked: Mapped[bool] = mapped_column(Boolean, default=False)


class BenefitTerm(_Lineage, _YearLink, Base):
    """Governed policy benefit term, linked to a PolicyVersion (year-wise). Holds
    both PDF candidates (status='candidate') and governed terms (status='confirmed').
    Simulation may use ONLY status='confirmed'. Every term carries source evidence."""
    __tablename__ = "benefit_term"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    policy_number: Mapped[str] = mapped_column(String(100), index=True, nullable=True)
    term_type: Mapped[str] = mapped_column(String(40), index=True)
    # room_rent|icu_rent|copay|parent_copay|disease_cap|maternity_limit|newborn_cover|
    # corporate_buffer|exclusion|waiting_period|non_payable|daycare|endorsement
    value: Mapped[float] = mapped_column(Numeric(18, 4), nullable=True)   # pct as fraction OR amount
    unit: Mapped[str] = mapped_column(String(16), nullable=True)          # pct|amount|months|text
    text_value: Mapped[str] = mapped_column(Text, nullable=True)          # for exclusions / free text
    applies_to: Mapped[dict] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="candidate")  # candidate|confirmed|rejected|ignored
    method: Mapped[str] = mapped_column(String(16))                       # structured|pdf_regex|manual
    confidence: Mapped[float] = mapped_column(Numeric(5, 3), nullable=True)
    source_page: Mapped[int] = mapped_column(Integer, nullable=True)
    source_snippet: Mapped[str] = mapped_column(Text, nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=True)              # reject/ignore reason
    confirmed_by: Mapped[str] = mapped_column(String(128), nullable=True)
