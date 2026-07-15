"""PolicyVersion resolver + multi-year policy-year resolution.

PolicyVersion = business policy-year / renewal cycle (distinct from DatasetVersion,
which is the upload/governance version). Prior years are NEVER overwritten: a version
is keyed by tenant + client + policy_number + policy_year.

Claim/member policy-year precedence (Gold Standard, no silent assignment):
  1. explicit mapped policy_year on the row
  2. claim/admission date falling within a known policy period
  3. file-level default year (if the user supplied one)
  4. else -> unresolved (+ caveat surfaced in LoadOutcome)
"""
from __future__ import annotations

from ..models.canonical import PolicyVersion
from .profiling import parse_number, parse_date, is_blank


def _year(v):
    n = parse_number(v)
    return int(n) if n is not None and float(n).is_integer() else None


def get_policy_periods(db, tenant: str, policy_number: str) -> list[dict]:
    """Known policy periods for a policy_number in this tenant (from PolicyVersions)."""
    rows = (db.query(PolicyVersion)
            .filter(PolicyVersion.tenant_id == tenant,
                    PolicyVersion.policy_number == policy_number).all())
    out = []
    for r in rows:
        out.append({"id": r.id, "policy_year": r.policy_year,
                    "start": r.policy_start_date, "end": r.policy_end_date})
    return out


def resolve_or_create_policy_version(db, *, tenant, client_id, policy_number, policy_year,
                                     start_date, end_date, dataset_version_id, upload_batch_id,
                                     raw_file_id, raw_row_index, insurer_code=None, tpa_code=None,
                                     premium=None, sum_insured_structure=None, renewal_cycle=None,
                                     status="active", caveat=False, restricted=False):
    """Find-or-create by (tenant, client, policy_number, policy_year). Never overwrites
    an existing year. Returns (PolicyVersion, created: bool)."""
    q = (db.query(PolicyVersion)
         .filter(PolicyVersion.tenant_id == tenant,
                 PolicyVersion.policy_number == policy_number,
                 PolicyVersion.policy_year == policy_year))
    if client_id is not None:
        q = q.filter(PolicyVersion.client_id == client_id)
    existing = q.first()
    if existing:
        return existing, False
    pv = PolicyVersion(
        tenant_id=tenant, client_id=client_id, policy_number=policy_number,
        policy_year=policy_year, policy_start_date=start_date, policy_end_date=end_date,
        renewal_cycle=renewal_cycle, status=status, insurer_code=insurer_code,
        tpa_code=tpa_code, premium=premium, sum_insured_structure=sum_insured_structure,
        source_dataset_version_id=dataset_version_id,
        dataset_version_id=dataset_version_id, upload_batch_id=upload_batch_id,
        raw_file_id=raw_file_id, raw_row_index=raw_row_index,
        data_quality_caveat=caveat, restricted=restricted)
    db.add(pv); db.flush()
    return pv, True


def resolve_policy_year(row: dict, periods: list[dict], *, file_default_year=None,
                        date_field="date_of_admission") -> dict:
    """Apply the precedence rules. Returns
    {policy_year, policy_version_id, linkage_status, method}."""
    # 1. explicit mapped policy year
    y = _year(row.get("policy_year"))
    if y is not None:
        pv = next((p for p in periods if p["policy_year"] == y), None)
        return {"policy_year": y, "policy_version_id": pv["id"] if pv else None,
                "linkage_status": "resolved", "method": "mapped_year"}
    # 2. claim/admission date within a known policy period
    d = parse_date(row.get(date_field))
    if d is not None:
        dd = d.date()
        for p in periods:
            if p["start"] and p["end"] and p["start"] <= dd <= p["end"]:
                return {"policy_year": p["policy_year"], "policy_version_id": p["id"],
                        "linkage_status": "resolved", "method": "date_in_period"}
    # 3. file-level default year
    if file_default_year is not None:
        yy = _year(file_default_year)
        pv = next((p for p in periods if p["policy_year"] == yy), None)
        return {"policy_year": yy, "policy_version_id": pv["id"] if pv else None,
                "linkage_status": "resolved", "method": "file_default"}
    # 4. unresolved — never silently assigned
    return {"policy_year": None, "policy_version_id": None,
            "linkage_status": "unresolved", "method": "unresolved"}
