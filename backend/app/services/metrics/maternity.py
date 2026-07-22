"""Maternity metrics (Sprint 22) — governed, conservative maternity identification from the
canonical diagnosis field (no maternity flag exists). Count / incurred / average, a normal-vs-
C-section split ONLY where clearly distinguishable, and maternity-limit / newborn-cover from
CONFIRMED benefit terms only. Governed + explainable, tenant-scoped.

Identification is deterministic and conservative: a claim is CONFIRMED maternity only on a clear
match to a governed keyword list or the ICD-10 chapter-O code prefix. Non-matching claims are
excluded (never inferred as maternity); claims without a diagnosis are counted as excluded. No
medical advice is given."""
from __future__ import annotations

import re

from .base import MetricContext, result, incurred_of
from ...models.canonical import BenefitTerm
from ..profiling import parse_number

# governed maternity keyword list (case-insensitive substring) + ICD-10 chapter-O prefix
MATERNITY_TOKENS = ("maternity", "delivery", "childbirth", "obstetric", "pregnan", "antenatal",
                    "caesarean", "caesarian", "c-section", "csection", "lscs", "normal delivery",
                    "labour", "labor")
_ICD_O = re.compile(r"^\s*o\d", re.IGNORECASE)     # ICD-10 chapter O: O00–O99
_CSECTION_TOKENS = ("caesarean", "caesarian", "c-section", "csection", "lscs")
_NORMAL_TOKENS = ("normal delivery",)

IDENTIFICATION_RULE = (
    "Confirmed maternity = diagnosis_code_l1 matches a governed maternity keyword "
    "(maternity/delivery/childbirth/obstetric/pregnan/antenatal/caesarean/c-section/LSCS/"
    "normal delivery/labour) OR the ICD-10 chapter-O prefix (O00–O99). Non-matching or missing "
    "diagnoses are excluded, never inferred as maternity.")


def _is_maternity(dx: str) -> bool:
    s = (dx or "").strip().lower()
    if not s:
        return False
    if _ICD_O.match(s):
        return True
    return any(tok in s for tok in MATERNITY_TOKENS)


def _confirmed_term_value(ctx, term_type):
    row = ctx.db.query(BenefitTerm).filter(
        BenefitTerm.tenant_id == ctx.tenant,
        BenefitTerm.dataset_version_id.in_(ctx.active_version_ids()),
        BenefitTerm.status == "confirmed", BenefitTerm.restricted == False,   # noqa: E712
        BenefitTerm.term_type == term_type).first()
    if row is None or row.value is None:
        return None
    return float(row.value)


def maternity_metrics(ctx: MetricContext) -> dict:
    rows = ctx.claims()
    excluded_no_diagnosis = sum(1 for c in rows if not (c.diagnosis_code_l1 or "").strip())
    maternity = [c for c in rows if _is_maternity(c.diagnosis_code_l1)]

    m_count = len(maternity)
    incurred = sum(incurred_of(c) for c in maternity)
    average_claim_size = round(incurred / m_count, 2) if m_count else None

    csection = sum(1 for c in maternity if any(t in (c.diagnosis_code_l1 or "").lower() for t in _CSECTION_TOKENS))
    normal = sum(1 for c in maternity if any(t in (c.diagnosis_code_l1 or "").lower() for t in _NORMAL_TOKENS))
    # split only reported when clearly distinguishable; else Not available
    split_available = (csection > 0 or normal > 0)
    csection_count = csection if split_available else None
    normal_count = normal if split_available else None

    maternity_limit = _confirmed_term_value(ctx, "maternity_limit")
    newborn_cover = _confirmed_term_value(ctx, "newborn_cover")

    caveats = [IDENTIFICATION_RULE]
    if excluded_no_diagnosis:
        caveats.append(f"{excluded_no_diagnosis} claim(s) have no diagnosis; excluded from maternity identification.")
    if not split_available and m_count:
        caveats.append("Normal vs C-section is not clearly distinguishable in the diagnosis data; shown as Not available.")
    if maternity_limit is None:
        caveats.append("Maternity limit is shown only from a confirmed benefit term; none available, so it is Not available.")
    if newborn_cover is None:
        caveats.append("Newborn cover is shown only from a confirmed benefit term; none available, so it is Not available.")
    if not rows:
        caveats.append("No claims in scope.")

    value = {
        "maternity_claim_count": m_count,
        "incurred": round(incurred, 2),
        "average_claim_size": average_claim_size,
        "normal_count": normal_count, "csection_count": csection_count,
        "split_available": split_available,
        "maternity_limit": maternity_limit,          # None => Not available in the UI
        "newborn_cover": newborn_cover,              # None => Not available in the UI
        "identification_rule": IDENTIFICATION_RULE,
        "excluded_no_diagnosis": excluded_no_diagnosis,
        "total_claims_in_scope": len(rows),
    }
    return result(
        metric="maternity", value=value, numerator=m_count, denominator=(len(rows) or None),
        formula="maternity identified by governed keyword/ICD-O match on diagnosis_code_l1 ; "
                "incurred = paid + outstanding of maternity claims ; limits from confirmed benefit terms only",
        source_tables=["claim", "benefit_term"], ctx=ctx, rows=rows,
        excluded_rows=excluded_no_diagnosis, caveats=caveats)
