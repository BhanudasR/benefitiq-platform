"""Quarantine / review-queue foundation.

Splits validated rows into an analytics-eligible set and a quarantine set at the
ROW level (never the whole file). Rows with an ERROR are quarantined and blocked
from KPIs; rows with only WARNINGs stay in analytics but are flagged for caveat.
Each quarantined row is packaged with its issues and a proposed action so a
reviewer can correct (as an overlay) and re-validate. Raw is never mutated."""
from __future__ import annotations

from collections import defaultdict


def _proposed_action(rules: set[str]) -> str:
    if "missing_mandatory" in rules:
        return "Provide missing mandatory value (correction overlay), then re-validate."
    if "paid_exceeds_claimed" in rules:
        return "Verify paid vs claimed amounts with the TPA; correct the wrong figure."
    if "invalid_type" in rules:
        return "Fix value format to match the canonical type, then re-validate."
    if "unknown_code" in rules:
        return "Map the source code to a governed master value."
    return "Review the flagged fields and correct via overlay."


def build_review_queue(validation_result: dict, mapped_rows: list[dict]) -> dict:
    """Produce the review queue from a validation result. Returns clean rows kept
    for analytics, the quarantined rows with their issues + proposed action, and
    counts. `mapped_rows` provides the row payload for reviewer context."""
    row_status = validation_result["row_status"]
    by_row = defaultdict(list)
    for i in validation_result["issues"]:
        by_row[i["raw_row_index"]].append(i)

    row_by_idx = {r.get("__raw_row_index"): r for r in mapped_rows}

    quarantine, analytics_eligible = [], []
    for idx, status in row_status.items():
        issues = by_row.get(idx, [])
        payload = {k: v for k, v in (row_by_idx.get(idx) or {}).items() if k != "__raw_row_index"}
        entry = {
            "raw_row_index": idx,
            "status": status,
            "issues": issues,
            "row": payload,
        }
        if status == "quarantine":
            rules = {i["rule"] for i in issues if i["severity"] == "ERROR"}
            entry["proposed_action"] = _proposed_action(rules)
            quarantine.append(entry)
        else:
            analytics_eligible.append(entry)

    quarantine.sort(key=lambda e: e["raw_row_index"] if e["raw_row_index"] is not None else 0)
    return {
        "table": validation_result["table"],
        "total_rows": validation_result["row_count"],
        "analytics_eligible_count": len(analytics_eligible),
        "quarantined_count": len(quarantine),
        "warn_count": validation_result["warn_rows"],
        "quarantine": quarantine,
        # analytics-eligible rows returned as indices + status to keep payload lean
        "analytics_eligible": [{"raw_row_index": e["raw_row_index"], "status": e["status"]}
                               for e in analytics_eligible],
        "note": "Quarantine is row-level. Correct via overlay (raw is never mutated) and re-validate.",
    }
