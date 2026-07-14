"""Layered validation engine (raw_acceptance -> canonical_minimum -> analytics_readiness).

Operates on canonical-mapped rows. Each finding is an Issue with a severity derived
from the field's TIER and the rule violated:
  * CRITICAL field missing/invalid  -> ERROR   (row quarantined, blocked from KPIs)
  * IMPORTANT field missing/invalid -> WARNING (row kept, analytics-with-caveat)
  * OPTIONAL field missing/invalid  -> INFO    (no block)
Business rules add cross-field checks. Governed nuance: an Outstanding claim (status 4)
with no paid amount is EXPECTED, not an error. Quarantine is row-level, never file-level."""
from __future__ import annotations

from ..canonical.registry import (
    REGISTRY, Tier, CLAIM_STATUS_MASTER, RELATIONSHIP_MASTER, GENDER_MASTER,
)
from .profiling import is_blank, parse_number, parse_date

ERROR, WARNING, INFO = "ERROR", "WARNING", "INFO"

_CODE_MASTERS = {
    "claim_status": CLAIM_STATUS_MASTER,
    "relationship": RELATIONSHIP_MASTER,
    "gender": GENDER_MASTER,
}


def _tier_severity(tier: Tier) -> str:
    return {Tier.CRITICAL: ERROR, Tier.IMPORTANT: WARNING, Tier.OPTIONAL: INFO}[tier]


def _issue(row_idx, severity, field, rule, message):
    return {"raw_row_index": row_idx, "severity": severity, "field": field,
            "rule": rule, "message": message}


def _type_ok(dtype: str, value: str) -> bool:
    if is_blank(value):
        return True  # emptiness handled by the required check, not the type check
    if dtype in ("num", "int"):
        n = parse_number(value)
        return n is not None and (dtype != "int" or float(n).is_integer())
    if dtype == "date":
        return parse_date(value) is not None
    if dtype == "bool":
        return str(value).strip().lower() in {"y", "n", "yes", "no", "true", "false", "1", "0"}
    return True  # str/id/code presence checked elsewhere


def _validate_row(table: str, row: dict, specs: dict) -> list[dict]:
    idx = row.get("__raw_row_index")
    issues: list[dict] = []
    status_code = str(row.get("claim_status", "")).strip() if table == "claims" else ""
    is_outstanding = table == "claims" and status_code == "4"

    for canon, spec in specs.items():
        tier: Tier = spec["tier"]
        val = row.get(canon, "")
        sev = _tier_severity(tier)

        # ---- required (presence) ----
        if is_blank(val):
            if spec["mandatory"]:
                # governed exception: outstanding claim -> paid legitimately pending
                if is_outstanding and canon == "total_claim_paid":
                    issues.append(_issue(idx, INFO, canon, "outstanding_paid_pending",
                                         "Outstanding claim: paid amount pending; excluded from paid-based KPIs."))
                else:
                    issues.append(_issue(idx, sev, canon, "missing_mandatory",
                                         f"Mandatory {tier.value} field '{canon}' is empty."))
            continue

        # ---- type / format ----
        if not _type_ok(spec["dtype"], val):
            issues.append(_issue(idx, sev, canon, "invalid_type",
                                 f"'{val}' is not a valid {spec['dtype']} for '{canon}'."))
            continue

        # ---- code master membership ----
        if spec["dtype"] == "code" and canon in _CODE_MASTERS:
            if str(val).strip() not in _CODE_MASTERS[canon]:
                issues.append(_issue(idx, sev, canon, "unknown_code",
                                     f"Code '{val}' not in governed master for '{canon}'."))

        # ---- non-negative amounts ----
        if spec["dtype"] in ("num", "int"):
            n = parse_number(val)
            if n is not None and n < 0:
                issues.append(_issue(idx, WARNING, canon, "negative_amount",
                                     f"'{canon}' is negative ({val})."))

    if table == "claims":
        issues += _claims_business_rules(idx, row, is_outstanding)
    return issues


def _claims_business_rules(idx, row, is_outstanding) -> list[dict]:
    out = []
    paid = parse_number(row.get("total_claim_paid"))
    claimed = parse_number(row.get("total_amount_claimed"))
    adm = parse_date(row.get("date_of_admission"))
    dis = parse_date(row.get("date_of_discharge"))
    status = str(row.get("claim_status", "")).strip()

    if paid is not None and claimed is not None and paid > claimed:
        out.append(_issue(idx, ERROR, "total_claim_paid", "paid_exceeds_claimed",
                          f"Paid ({paid:g}) exceeds claimed ({claimed:g})."))
    if adm and dis and dis < adm:
        out.append(_issue(idx, WARNING, "date_of_discharge", "discharge_before_admission",
                          "Discharge date is before admission date."))
    if status in ("1", "2") and (paid is None or paid <= 0):
        out.append(_issue(idx, WARNING, "total_claim_paid", "settled_missing_paid",
                          "Settled claim has no positive paid amount."))
    return out


def validate(table: str, rows: list[dict]) -> dict:
    """Validate canonical-mapped rows. Returns issues, per-row status, and rollups.
    row_status: 'quarantine' if any ERROR, else 'warn' if any WARNING, else 'clean'."""
    if table not in REGISTRY:
        raise ValueError(f"unknown canonical table '{table}'")
    specs = {f["canonical"]: f for f in REGISTRY[table]}
    all_issues: list[dict] = []
    row_status: dict = {}
    for row in rows:
        idx = row.get("__raw_row_index")
        r_issues = _validate_row(table, row, specs)
        all_issues.extend(r_issues)
        sevs = {i["severity"] for i in r_issues}
        row_status[idx] = ("quarantine" if ERROR in sevs
                           else "warn" if WARNING in sevs else "clean")

    by_sev = {ERROR: 0, WARNING: 0, INFO: 0}
    for i in all_issues:
        by_sev[i["severity"]] += 1
    by_rule: dict = {}
    for i in all_issues:
        by_rule[i["rule"]] = by_rule.get(i["rule"], 0) + 1

    total = len(rows)
    quarantined = sum(1 for s in row_status.values() if s == "quarantine")
    return {
        "table": table,
        "row_count": total,
        "issues": all_issues,
        "row_status": row_status,
        "counts": by_sev,
        "by_rule": by_rule,
        "clean_rows": sum(1 for s in row_status.values() if s == "clean"),
        "warn_rows": sum(1 for s in row_status.values() if s == "warn"),
        "quarantined_rows": quarantined,
    }
