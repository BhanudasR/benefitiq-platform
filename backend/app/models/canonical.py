"""Canonical tables (aligned to IRDAI F15 + BenefitIQ v2 data dictionaries).
Every canonical row preserves lineage: upload_batch_id + raw_file_id + raw_row_index.
`claim_bill_component` enables claim-level room-rent proportionate-deduction maths."""
import uuid
from sqlalchemy import String, Integer, Date, Numeric, Boolean, ForeignKey, BigInteger
from sqlalchemy.orm import Mapped, mapped_column
from ..db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class _Lineage:
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    dataset_version_id: Mapped[str] = mapped_column(String(36), index=True)
    upload_batch_id: Mapped[str] = mapped_column(String(36))
    raw_file_id: Mapped[str] = mapped_column(String(36))
    raw_row_index: Mapped[int] = mapped_column(Integer)
    # governance flags propagated from the dataset version at load time so every
    # downstream metric inherits the dataset's trust level (Gold Standard rule 14).
    data_quality_caveat: Mapped[bool] = mapped_column(Boolean, default=False)
    restricted: Mapped[bool] = mapped_column(Boolean, default=False)


class ClientMaster(_Lineage, Base):
    __tablename__ = "client_master"
    client_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    client_name: Mapped[str] = mapped_column(String(255))
    primary_industry: Mapped[str] = mapped_column(String(150), nullable=True)
    total_employee_count: Mapped[int] = mapped_column(Integer, nullable=True)


class PolicyMaster(_Lineage, Base):
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
    policy_premium: Mapped[float] = mapped_column(Numeric(16, 2), nullable=True)
    corporate_floater_sum_insured: Mapped[float] = mapped_column(Numeric(16, 2), nullable=True)


class MemberMaster(_Lineage, Base):
    __tablename__ = "member_master"
    member_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    policy_number: Mapped[str] = mapped_column(String(100), index=True)
    member_reference_key: Mapped[str] = mapped_column(String(50), index=True)
    employee_id: Mapped[str] = mapped_column(String(20), nullable=True)
    date_of_birth: Mapped["Date"] = mapped_column(Date, nullable=True)
    age: Mapped[int] = mapped_column(Integer, nullable=True)
    gender: Mapped[str] = mapped_column(String(10), nullable=True)          # normalized
    sum_insured: Mapped[float] = mapped_column(Numeric(16, 2), nullable=True)
    relationship: Mapped[str] = mapped_column(String(30), nullable=True)    # normalized


class Claim(_Lineage, Base):
    __tablename__ = "claim"
    claim_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    policy_number: Mapped[str] = mapped_column(String(100), index=True)
    claim_number: Mapped[str] = mapped_column(String(30), index=True)
    member_reference_key: Mapped[str] = mapped_column(String(50), nullable=True)
    diagnosis_code_l1: Mapped[str] = mapped_column(String(20), nullable=True)
    hospital_name: Mapped[str] = mapped_column(String(120), nullable=True)
    date_of_admission: Mapped["Date"] = mapped_column(Date, nullable=True)
    date_of_discharge: Mapped["Date"] = mapped_column(Date, nullable=True)
    sum_insured: Mapped[float] = mapped_column(Numeric(16, 2), nullable=True)
    total_amount_claimed: Mapped[float] = mapped_column(Numeric(16, 2), nullable=True)
    total_claim_paid: Mapped[float] = mapped_column(Numeric(16, 2), nullable=True)
    claim_status: Mapped[str] = mapped_column(String(24), nullable=True)     # normalized
    hospital_is_network: Mapped[bool] = mapped_column(Boolean, nullable=True)
    copay_percentage: Mapped[float] = mapped_column(Numeric(5, 2), nullable=True)


class ClaimBillComponent(_Lineage, Base):
    """Bill breakup enabling room-rent proportionate deduction + cap maths."""
    __tablename__ = "claim_bill_component"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    claim_number: Mapped[str] = mapped_column(String(30), index=True)
    component: Mapped[str] = mapped_column(String(48))   # room|nursing|surgery|consultation|diagnostics|medicine|implant|misc
    amount_claimed: Mapped[float] = mapped_column(Numeric(16, 2), nullable=True)
    room_rent_linked: Mapped[bool] = mapped_column(Boolean, default=False)  # eligible for proportionate deduction
