"""Validation-issue breakdown — severity split (ERROR->critical / WARNING->warning / INFO->info),
grouping by rule and by field, affected-record and affected-field counts, and the quarantined
subset. Every field is tied to the analytics modules it touches via EVIDENCE_MODULE_MAP. Read-only."""
from __future__ import annotations

from . import norm_band, gate, envelope
from .readiness import modules_for_kinds

_SEVKEY = {"ERROR": "critical", "WARNING": "warning", "INFO": "info"}


def _status(sev, ectx) -> str:
    if not ectx.batch_ids():
        return "No Data"
    active = ectx.dataset_descriptors(status="ACTIVE")
    h = gate([norm_band(d["dv"].readiness_status, bool(d["dv"].restricted)) for d in active])
    if h == "No Data":
        return "Conditional" if (sev["critical"] or sev["warning"]) else "Analytics Ready"
    return h


def issue_breakdown(ectx, filters: dict | None = None) -> dict:
    filters = filters or {}
    batch_kind = {b.id: b.file_kind for b in
                  (ectx.batch(bid) for bid in ectx.batch_ids()) if b}

    issues = ectx.issues()
    fk = filters.get("file_kind")
    if fk:
        issues = [i for i in issues if batch_kind.get(i.upload_batch_id) == fk]
    sev_filter = filters.get("severity")
    if sev_filter:
        want = str(sev_filter).upper()
        issues = [i for i in issues if i.severity == want]

    sev = {"critical": 0, "warning": 0, "info": 0}
    by_rule: dict = {}
    fields: dict = {}
    affected_rows = set()
    quarantined_rows = []

    for i in issues:
        sev[_SEVKEY.get(i.severity, "info")] += 1
        rk = (i.rule, i.severity)
        r = by_rule.setdefault(rk, {"rule": i.rule, "severity": i.severity,
                                    "count": 0, "rows": set(), "fields": set()})
        r["count"] += 1
        if i.raw_row_index is not None:
            r["rows"].add((i.upload_batch_id, i.raw_row_index))
            affected_rows.add((i.upload_batch_id, i.raw_row_index))
        if i.field:
            r["fields"].add(i.field)
            f = fields.setdefault(i.field, {"field": i.field, "issue_count": 0, "kinds": set()})
            f["issue_count"] += 1
            f["kinds"].add(batch_kind.get(i.upload_batch_id))
        if i.quarantined and i.raw_row_index is not None:
            quarantined_rows.append({"batch_id": i.upload_batch_id, "row": i.raw_row_index,
                                     "rule": i.rule, "field": i.field, "severity": i.severity})

    by_rule_out = sorted(
        [{"rule": r["rule"], "severity": r["severity"], "count": r["count"],
          "affected_records": len(r["rows"]), "affected_fields": sorted(x for x in r["fields"] if x)}
         for r in by_rule.values()],
        key=lambda x: (-x["count"], x["rule"]))

    fields_out = sorted(
        [{"field": f["field"], "issue_count": f["issue_count"],
          "modules_impacted": modules_for_kinds([k for k in f["kinds"] if k])}
         for f in fields.values()],
        key=lambda x: -x["issue_count"])

    q_records = len({(q["batch_id"], q["row"]) for q in quarantined_rows})
    value = {
        "severity_split": sev,
        "by_rule": by_rule_out,
        "affected_fields": fields_out,
        "affected_records": len(affected_rows),
        "affected_field_count": len(fields),
        "quarantined": {"records": q_records, "rows": quarantined_rows[:50]},
        "total_issues": len(issues),
    }
    caveats = []
    if len(quarantined_rows) > 50:
        caveats.append(f"Showing the first 50 of {len(quarantined_rows)} quarantined row references.")

    return envelope("data_quality", "issues", value, status=_status(sev, ectx),
                    formula="severity ERROR->critical / WARNING->warning / INFO->info ; affected "
                            "records = distinct (batch,row) ; grouped by rule and by field",
                    source_tables=["validation_issue", "upload_batch"],
                    caveats=caveats)
