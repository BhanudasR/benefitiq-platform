"""Structured terms loader — the PRIMARY governed path. Runs inside the canonical
loader dispatch for file_kind='terms': maps -> validates -> DQ -> activate -> load.
Loaded terms are status='confirmed' (governed via dataset activation), method=
'structured', linked to the correct PolicyVersion (year-wise, no cross-bleed)."""
from __future__ import annotations

from ..profiling import parse_number, is_blank
from ..metrics.base import incurred_of  # noqa: F401 (kept for parity; unused)
from .. import policy_version as pv
from .normalize import normalize_term_type
from ...models.canonical import BenefitTerm


def _s(row, f):
    v = row.get(f)
    return None if is_blank(v) else str(v).strip()


def load_terms(db, tenant, version, batch, mapped, raw, quarantined, warn,
               caveat, restricted, file_default_year):
    from ..canonical_loader import _new_outcome, _lineage, _track_year
    out = _new_outcome("terms", caveat, restricted, version.readiness_status)
    out["terms_loaded"] = 0
    existing = {(t.policy_version_id, t.policy_year, t.term_type) for t in
                db.query(BenefitTerm).filter(BenefitTerm.dataset_version_id == version.id).all()}
    for row in mapped:
        idx = row.get("__raw_row_index")
        if idx in quarantined:
            out["rows_excluded_quarantined"] += 1
            continue
        pol_no = _s(row, "policy_number")
        ttype = normalize_term_type(row.get("term_type"))
        if not pol_no or not ttype:
            out["rows_excluded_quarantined"] += 1
            continue
        periods = pv.get_policy_periods(db, tenant, pol_no)
        yr = pv.resolve_policy_year(row, periods, file_default_year=file_default_year,
                                    date_field="__none__")
        key = (yr["policy_version_id"], yr["policy_year"], ttype)
        if key in existing:
            out["skipped_duplicate"] += 1
            continue
        db.add(BenefitTerm(
            **_lineage(tenant, version, batch, raw, idx, caveat, restricted, yr),
            policy_number=pol_no, term_type=ttype,
            value=parse_number(row.get("value")), unit=_s(row, "unit"),
            text_value=_s(row, "text_value"),
            applies_to=({"scope": _s(row, "applies_to")} if _s(row, "applies_to") else None),
            status="confirmed", method="structured", confidence=1.0, confirmed_by="structured_load"))
        existing.add(key)
        out["loaded"] += 1
        out["terms_loaded"] += 1
        out["lineage_count"] += 1
        if yr["linkage_status"] == "unresolved":
            out["unresolved_linkage_rows"] += 1
            out["unresolved_policy_year_rows"] += 1
        if caveat:
            out["caveat_rows"] += 1
        if restricted:
            out["restricted_rows"] += 1
        _track_year(out, yr["policy_year"])
    return out
