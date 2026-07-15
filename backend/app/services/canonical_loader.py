"""Multi-year canonical loaders (Sprint 3).

Loads governed rows from an ACTIVE dataset version into canonical Policy, Member,
Claim and Bill-Component tables. Multi-year aware: every row links to a PolicyVersion
(policy_version_id + policy_year) where resolvable; unresolved rows still load with
linkage_status='unresolved' (never silently assigned) and are surfaced in LoadOutcome.

Governance enforced here (all loaders):
  * ACTIVE dataset versions only.
  * Critical/quarantined rows are NEVER written.
  * data_quality_caveat + restricted inherited from the version and propagated.
  * Idempotent (keyed by dataset_version + business key). Every load writes AuditLog.
No ICR/KPI/analytics/simulation is computed here.
"""
from __future__ import annotations

from ..models.canonical import (PolicyVersion, PolicyMaster, MemberMaster,
                                 MemberCoverage, Claim, ClaimBillComponent)
from ..models.governance import ReviewItem, RawFile
from ..canonical.registry import CLAIM_STATUS_MASTER
from ..services.profiling import parse_number, parse_date, is_blank
from ..services import audit, gate, policy_version as pv
from ..services.onboarding_service import materialize, _get_batch, _latest_version, GateError

_TRUE = {"y", "yes", "true", "1"}
_FALSE = {"n", "no", "false", "0"}
_BILL = [("room_charges_claimed", "room", True),
         ("nursing_charges_claimed", "nursing", False),
         ("surgery_charges_claimed", "surgery", False)]


def _to_date(v):
    d = parse_date(v)
    return d.date() if d else None


def _to_bool(v):
    if is_blank(v):
        return None
    s = str(v).strip().lower()
    return True if s in _TRUE else False if s in _FALSE else None


def _norm_status(v):
    return CLAIM_STATUS_MASTER.get(str(v).strip(), str(v).strip() or None)


def _year(v):
    n = parse_number(v)
    return int(n) if n is not None and float(n).is_integer() else None


def _s(row, f):
    return str(row.get(f, "")).strip() or None


def _new_outcome(kind, caveat, restricted, readiness):
    return {"file_kind": kind, "loaded": 0, "skipped_duplicate": 0,
            "rows_excluded_quarantined": 0, "warning_rows": 0, "unresolved_linkage_rows": 0,
            "caveat_rows": 0, "restricted_rows": 0, "lineage_count": 0, "idempotent": True,
            "data_quality_caveat": caveat, "restricted": restricted, "readiness_status": readiness,
            "policy_years_detected": [], "records_loaded_by_policy_year": {},
            "unresolved_policy_year_rows": 0, "duplicate_year_or_version_conflicts": 0,
            "bill_components_loaded": 0}


def _track_year(out, year):
    key = str(year) if year is not None else "unresolved"
    out["records_loaded_by_policy_year"][key] = out["records_loaded_by_policy_year"].get(key, 0) + 1
    if year is not None and year not in out["policy_years_detected"]:
        out["policy_years_detected"].append(year)


def _lineage(tenant, version, batch, raw, idx, caveat, restricted, yr):
    return dict(tenant_id=tenant, dataset_version_id=version.id, upload_batch_id=batch.id,
                raw_file_id=raw.id, raw_row_index=idx, data_quality_caveat=caveat,
                restricted=restricted, policy_version_id=yr["policy_version_id"],
                policy_year=yr["policy_year"], linkage_status=yr["linkage_status"])


# --------------------------------------------------------------------------- #
def _load_policy(db, tenant, version, batch, mapped, raw, quarantined, warn,
                 caveat, restricted, file_default_year):
    out = _new_outcome("policy", caveat, restricted, version.readiness_status)
    existing = {(p.policy_number, p.policy_year) for p in
                db.query(PolicyMaster).filter(PolicyMaster.dataset_version_id == version.id).all()}
    for row in mapped:
        idx = row.get("__raw_row_index")
        if idx in quarantined:
            out["rows_excluded_quarantined"] += 1
            continue
        pol_no = _s(row, "policy_number")
        if not pol_no:
            out["rows_excluded_quarantined"] += 1
            continue
        start, end = _to_date(row.get("policy_start_date")), _to_date(row.get("policy_end_date"))
        year = _year(row.get("policy_year")) or (start.year if start else None) or _year(file_default_year)
        if (pol_no, year) in existing:
            out["skipped_duplicate"] += 1
            continue
        si_struct = None
        cf = parse_number(row.get("corporate_floater_sum_insured"))
        if cf is not None:
            si_struct = {"corporate_floater_sum_insured": cf}
        version_row, created = pv.resolve_or_create_policy_version(
            db, tenant=tenant, client_id=None, policy_number=pol_no, policy_year=year,
            start_date=start, end_date=end, dataset_version_id=version.id, upload_batch_id=batch.id,
            raw_file_id=raw.id, raw_row_index=idx, insurer_code=_s(row, "insurer_code"),
            tpa_code=_s(row, "tpa_code"), premium=parse_number(row.get("policy_premium")),
            sum_insured_structure=si_struct, caveat=caveat, restricted=restricted)
        if not created and version_row.source_dataset_version_id != version.id:
            out["duplicate_year_or_version_conflicts"] += 1
        status = "resolved" if year is not None else "unresolved"
        yr = {"policy_version_id": version_row.id, "policy_year": year, "linkage_status": status}
        db.add(PolicyMaster(
            **_lineage(tenant, version, batch, raw, idx, caveat, restricted, yr),
            client_id=None, policy_number=pol_no,
            master_policy_number=_s(row, "master_policy_number"),
            insurer_code=_s(row, "insurer_code"), tpa_code=_s(row, "tpa_code"),
            product_type=_s(row, "product_type"), policy_type=_s(row, "policy_type"),
            policy_start_date=start, policy_end_date=end,
            policy_premium=parse_number(row.get("policy_premium")),
            corporate_floater_sum_insured=cf))
        existing.add((pol_no, year))
        out["loaded"] += 1
        out["lineage_count"] += 1
        if status == "unresolved":
            out["unresolved_linkage_rows"] += 1
            out["unresolved_policy_year_rows"] += 1
        if caveat:
            out["caveat_rows"] += 1
        if restricted:
            out["restricted_rows"] += 1
        if idx in warn:
            out["warning_rows"] += 1
        _track_year(out, year)
    return out


def _load_member(db, tenant, version, batch, mapped, raw, quarantined, warn,
                 caveat, restricted, file_default_year):
    out = _new_outcome("member", caveat, restricted, version.readiness_status)
    existing = {(m.member_reference_key, m.policy_number, m.policy_year) for m in
                db.query(MemberMaster).filter(MemberMaster.dataset_version_id == version.id).all()}
    for row in mapped:
        idx = row.get("__raw_row_index")
        if idx in quarantined:
            out["rows_excluded_quarantined"] += 1
            continue
        mrk, pol_no = _s(row, "member_reference_key"), _s(row, "policy_number")
        if not mrk or not pol_no:
            out["rows_excluded_quarantined"] += 1
            continue
        periods = pv.get_policy_periods(db, tenant, pol_no)
        yr = pv.resolve_policy_year(row, periods, file_default_year=file_default_year,
                                    date_field="coverage_start")
        key = (mrk, pol_no, yr["policy_year"])
        if key in existing:
            out["skipped_duplicate"] += 1
            continue
        lin = _lineage(tenant, version, batch, raw, idx, caveat, restricted, yr)
        cstart, cend = _to_date(row.get("coverage_start")), _to_date(row.get("coverage_end"))
        db.add(MemberMaster(
            **lin, policy_number=pol_no, member_reference_key=mrk,
            employee_id=_s(row, "employee_id"), family_id=_s(row, "family_id"),
            date_of_birth=_to_date(row.get("date_of_birth")), age=_year(row.get("age")),
            gender=_s(row, "gender"), sum_insured=parse_number(row.get("sum_insured")),
            relationship=_s(row, "relationship"), coverage_start=cstart, coverage_end=cend))
        db.add(MemberCoverage(
            **lin, member_reference_key=mrk, policy_number=pol_no, family_id=_s(row, "family_id"),
            sum_insured=parse_number(row.get("sum_insured")), coverage_start=cstart, coverage_end=cend))
        existing.add(key)
        out["loaded"] += 1
        out["lineage_count"] += 1
        if yr["linkage_status"] == "unresolved":
            out["unresolved_linkage_rows"] += 1
            out["unresolved_policy_year_rows"] += 1
        if caveat:
            out["caveat_rows"] += 1
        if restricted:
            out["restricted_rows"] += 1
        if idx in warn:
            out["warning_rows"] += 1
        _track_year(out, yr["policy_year"])
    return out


def _bill_components_for(db, tenant, version, batch, raw, row, idx, yr, caveat, restricted):
    n = 0
    for src, comp, rr_linked in _BILL:
        amt = parse_number(row.get(src))
        if amt is not None and amt > 0:
            db.add(ClaimBillComponent(
                **_lineage(tenant, version, batch, raw, idx, caveat, restricted, yr),
                claim_number=_s(row, "claim_number"), component=comp,
                amount_claimed=amt, deduction_amount=None, room_rent_linked=rr_linked))
            n += 1
    return n


def _load_claims(db, tenant, version, batch, mapped, raw, quarantined, warn,
                 caveat, restricted, file_default_year):
    out = _new_outcome("claims", caveat, restricted, version.readiness_status)
    existing = {c.claim_number for c in
                db.query(Claim).filter(Claim.dataset_version_id == version.id).all()}
    for row in mapped:
        idx = row.get("__raw_row_index")
        if idx in quarantined:
            out["rows_excluded_quarantined"] += 1
            continue
        claim_no, pol_no = _s(row, "claim_number"), _s(row, "policy_number")
        if not claim_no:
            out["rows_excluded_quarantined"] += 1
            continue
        if claim_no in existing:
            out["skipped_duplicate"] += 1
            continue
        periods = pv.get_policy_periods(db, tenant, pol_no) if pol_no else []
        yr = pv.resolve_policy_year(row, periods, file_default_year=file_default_year,
                                    date_field="date_of_admission")
        # best-effort member/policy resolution within the resolved year (never mixes years)
        member_id = policy_id = None
        mrk = _s(row, "member_reference_key")
        if mrk:
            mq = db.query(MemberMaster).filter(MemberMaster.tenant_id == tenant,
                                               MemberMaster.member_reference_key == mrk)
            if yr["policy_year"] is not None:
                mq = mq.filter(MemberMaster.policy_year == yr["policy_year"])
            mm = mq.first()
            member_id = mm.member_id if mm else None
        if pol_no:
            pq = db.query(PolicyMaster).filter(PolicyMaster.tenant_id == tenant,
                                               PolicyMaster.policy_number == pol_no)
            if yr["policy_year"] is not None:
                pq = pq.filter(PolicyMaster.policy_year == yr["policy_year"])
            pm = pq.first()
            policy_id = pm.policy_id if pm else None
        bill_available = any(parse_number(row.get(s)) not in (None,) and (parse_number(row.get(s)) or 0) > 0
                             for s, _, _ in _BILL)
        db.add(Claim(
            **_lineage(tenant, version, batch, raw, idx, caveat, restricted, yr),
            policy_number=pol_no, claim_number=claim_no, member_reference_key=mrk,
            policy_id=policy_id, member_id=member_id,
            diagnosis_code_l1=_s(row, "diagnosis_code_l1"), hospital_name=_s(row, "hospital_name"),
            provider_code=_s(row, "provider_code"),
            date_of_admission=_to_date(row.get("date_of_admission")),
            date_of_discharge=_to_date(row.get("date_of_discharge")),
            sum_insured=parse_number(row.get("sum_insured")),
            total_amount_claimed=parse_number(row.get("total_amount_claimed")),
            total_claim_paid=parse_number(row.get("total_claim_paid")),
            outstanding_amount=parse_number(row.get("outstanding_amount")),
            incurred_amount=parse_number(row.get("incurred_amount")),
            claim_type=_s(row, "claim_type"), claim_status=_norm_status(row.get("claim_status")),
            hospital_is_network=_to_bool(row.get("hospital_is_network")),
            copay_percentage=parse_number(row.get("copay_percentage")),
            bill_breakup_available=bill_available))
        existing.add(claim_no)
        out["loaded"] += 1
        out["lineage_count"] += 1
        out["bill_components_loaded"] += _bill_components_for(
            db, tenant, version, batch, raw, row, idx, yr, caveat, restricted)
        if yr["linkage_status"] == "unresolved":
            out["unresolved_linkage_rows"] += 1
            out["unresolved_policy_year_rows"] += 1
        if caveat:
            out["caveat_rows"] += 1
        if restricted:
            out["restricted_rows"] += 1
        if idx in warn:
            out["warning_rows"] += 1
        _track_year(out, yr["policy_year"])
    return out


from .terms.loader import load_terms as _load_terms
_LOADERS = {"policy": _load_policy, "member": _load_member, "claims": _load_claims,
            "terms": _load_terms}


def load_canonical(db, *, tenant, actor, batch_id, file_default_year=None) -> dict:
    batch = _get_batch(db, tenant, batch_id)
    version = _latest_version(db, batch.id)
    if version is None or version.status != "ACTIVE":
        raise GateError("dataset version must be ACTIVE before canonical load")
    loader = _LOADERS.get(batch.file_kind)
    if loader is None:
        raise GateError(f"canonical loader for '{batch.file_kind}' is not available")
    m = materialize(db, batch)
    caveat = gate.carries_caveat(version.readiness_status)
    restricted = bool(version.restricted)
    quarantined = {r.raw_row_index for r in db.query(ReviewItem).filter(
        ReviewItem.upload_batch_id == batch.id, ReviewItem.status == "quarantine").all()}
    warn = {r.raw_row_index for r in db.query(ReviewItem).filter(
        ReviewItem.upload_batch_id == batch.id, ReviewItem.status == "warn").all()}
    out = loader(db, tenant, version, batch, m["mapped"], m["raw"], quarantined, warn,
                 caveat, restricted, file_default_year)
    out["policy_years_detected"] = sorted(out["policy_years_detected"])
    batch.status = "LOADED"
    audit_meta = {k: out[k] for k in ("file_kind", "loaded", "skipped_duplicate",
                  "rows_excluded_quarantined", "unresolved_policy_year_rows",
                  "policy_years_detected", "restricted", "data_quality_caveat")}
    audit.record(db, tenant_id=tenant, actor=actor, action="LOAD",
                 entity_type="dataset_version", entity_id=version.id, meta=audit_meta)
    db.commit()
    return out
