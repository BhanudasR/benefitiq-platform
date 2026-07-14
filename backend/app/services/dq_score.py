"""Data Quality Score engine (8 weighted components) + explainability object.

Weights (sum = 1.0):
  mandatory_completeness   0.25   mapping_confidence      0.15
  type_validity            0.15   business_rule_validation 0.15
  linkage_quality          0.10   financial_reconciliation 0.10
  duplicate_anomaly        0.05   source_version_integrity 0.05

Each component yields a fraction in [0,1]; weighted_points = fraction * weight * 100.
overall_score = sum(weighted_points) -> reconciles exactly to the component table.
Bands: >=85 Analytics Ready | 70-84 Conditional | <70 Not Reliable.

Principle: a low score never blocks RAW UPLOAD; it blocks *blind* analytics and
surfaces exactly which rows/fields to fix. This is the Data Readiness Score."""
from __future__ import annotations

from ..canonical.registry import REGISTRY, mandatory_fields
from .profiling import is_blank, parse_number

WEIGHTS = {
    "mandatory_completeness": 0.25,
    "mapping_confidence": 0.15,
    "type_validity": 0.15,
    "business_rule_validation": 0.15,
    "linkage_quality": 0.10,
    "financial_reconciliation": 0.10,
    "duplicate_anomaly": 0.05,
    "source_version_integrity": 0.05,
}

_KEY_FIELD = {"claims": "claim_number", "member_master": "member_reference_key",
              "policy_master": "policy_number", "client_master": "client_id"}

_BUSINESS_RULES = {"paid_exceeds_claimed", "discharge_before_admission", "settled_missing_paid"}


def _frac(numer, denom, default=1.0):
    return default if denom == 0 else numer / denom


def _band(score: float) -> str:
    if score >= 85:
        return "Analytics Ready"
    if score >= 70:
        return "Conditional"
    return "Not Reliable"


def compute_dq(table: str, mapped_rows: list[dict], mapping_result: dict,
               validation_result: dict, lineage: dict | None = None) -> dict:
    if table not in REGISTRY:
        raise ValueError(f"unknown canonical table '{table}'")
    lineage = lineage or {}
    rows = mapped_rows
    total = len(rows)
    mand = mandatory_fields(table)
    comps: list[dict] = []

    # 1. mandatory completeness -------------------------------------------------
    cells = total * len(mand)
    filled = sum(1 for r in rows for f in mand if not is_blank(r.get(f)))
    f1 = _frac(filled, cells)
    comps.append(_c("mandatory_completeness", f1,
                    {"mandatory_fields": len(mand), "cells": cells, "filled": filled},
                    _cav(f1, f"{cells - filled} mandatory cell(s) empty")))

    # 2. mapping confidence -----------------------------------------------------
    f2 = float(mapping_result.get("overall_confidence", 0.0)) if mapping_result else 0.0
    comps.append(_c("mapping_confidence", f2,
                    {"overall_confidence": f2,
                     "unmapped_mandatory": mapping_result.get("unmapped_mandatory", []) if mapping_result else []},
                    _cav(f2, "some mandatory fields unmapped or low-confidence")))

    # 3. type validity ----------------------------------------------------------
    type_issues = sum(1 for i in validation_result["issues"] if i["rule"] == "invalid_type")
    nonblank_cells = sum(1 for r in rows for f in mand if not is_blank(r.get(f)))
    f3 = _frac(nonblank_cells - type_issues, nonblank_cells)
    comps.append(_c("type_validity", f3,
                    {"checked_cells": nonblank_cells, "invalid": type_issues},
                    _cav(f3, f"{type_issues} cell(s) failed type/format")))

    # 4. business rule validation ----------------------------------------------
    br_rows = {i["raw_row_index"] for i in validation_result["issues"] if i["rule"] in _BUSINESS_RULES}
    f4 = _frac(total - len(br_rows), total)
    comps.append(_c("business_rule_validation", f4,
                    {"rows": total, "rows_failing_rules": len(br_rows)},
                    _cav(f4, f"{len(br_rows)} row(s) violate business rules")))

    # 5. linkage quality --------------------------------------------------------
    known_members = set(lineage.get("known_member_keys") or [])
    known_policies = set(lineage.get("known_policy_numbers") or [])
    f5, ev5, cav5 = _linkage(table, rows, known_members, known_policies)
    comps.append(_c("linkage_quality", f5, ev5, cav5))

    # 6. financial reconciliation ----------------------------------------------
    f6, ev6, cav6 = _financial(table, rows)
    comps.append(_c("financial_reconciliation", f6, ev6, cav6))

    # 7. duplicate / anomaly ----------------------------------------------------
    key = _KEY_FIELD.get(table)
    keys = [str(r.get(key, "")).strip() for r in rows if not is_blank(r.get(key))] if key else []
    dupes = len(keys) - len(set(keys))
    f7 = _frac(len(keys) - dupes, len(keys)) if keys else 1.0
    comps.append(_c("duplicate_anomaly", f7,
                    {"key_field": key, "keyed_rows": len(keys), "duplicates": dupes},
                    _cav(f7, f"{dupes} duplicate key(s) on '{key}'")))

    # 8. source / version integrity --------------------------------------------
    has_hash = bool(lineage.get("sha256"))
    single_version = lineage.get("version_no", 1) == 1 or lineage.get("is_active_version", True)
    f8 = (0.5 if has_hash else 0.0) + (0.5 if single_version else 0.0)
    comps.append(_c("source_version_integrity", f8,
                    {"sha256_present": has_hash, "single_active_version": single_version},
                    [] if f8 == 1.0 else ["raw hash or version lineage incomplete"]))

    overall = round(sum(c["weighted_points"] for c in comps), 2)
    band = _band(overall)
    # biggest opportunities = largest gap between potential and earned points
    gaps = sorted(comps, key=lambda c: (c["potential_points"] - c["weighted_points"]), reverse=True)
    top_gaps = [{"component": c["name"], "lost_points": round(c["potential_points"] - c["weighted_points"], 2),
                 "caveats": c["caveats"]} for c in gaps if c["potential_points"] - c["weighted_points"] > 0.01][:3]

    return {
        "table": table,
        "overall_score": overall,
        "readiness": band,
        "headline": _headline(band, overall, validation_result),
        "components": comps,
        "top_gaps": top_gaps,
        "reconciles": abs(overall - round(sum(c["weighted_points"] for c in comps), 2)) < 0.01,
        "row_summary": {
            "total": total,
            "clean": validation_result["clean_rows"],
            "warn": validation_result["warn_rows"],
            "quarantined": validation_result["quarantined_rows"],
        },
    }


def _c(name, fraction, evidence, caveats):
    fraction = max(0.0, min(1.0, float(fraction)))
    weight = WEIGHTS[name]
    return {
        "name": name,
        "weight": weight,
        "fraction": round(fraction, 4),
        "score_0_100": round(fraction * 100, 2),
        "potential_points": round(weight * 100, 2),
        "weighted_points": round(fraction * weight * 100, 2),
        "evidence": evidence,
        "caveats": caveats,
    }


def _cav(fraction, msg):
    return [] if fraction >= 0.999 else [msg]


def _linkage(table, rows, known_members, known_policies):
    if table != "claims":
        return 1.0, {"applicable": False}, ["linkage n/a for this table"]
    total = len(rows)
    if known_members or known_policies:
        ok = 0
        for r in rows:
            mk = str(r.get("member_reference_key", "")).strip()
            pk = str(r.get("policy_number", "")).strip()
            m_ok = (not known_members) or mk in known_members
            p_ok = (not known_policies) or pk in known_policies
            ok += 1 if (m_ok and p_ok) else 0
        f = _frac(ok, total)
        return f, {"mode": "reference_sets", "linked": ok, "rows": total}, _cav(f, f"{total - ok} claim(s) unlinked to member/policy")
    # proxy: presence of both linkage keys
    present = sum(1 for r in rows if not is_blank(r.get("member_reference_key")) and not is_blank(r.get("policy_number")))
    f = _frac(present, total)
    return f, {"mode": "presence_proxy", "both_keys_present": present, "rows": total}, \
        ["linkage estimated from key presence (no member/policy reference set loaded yet)"] if f < 0.999 else ["linkage estimated from key presence"]


def _financial(table, rows):
    if table != "claims":
        return 1.0, {"applicable": False}, ["financial reconciliation n/a for this table"]
    settled = [r for r in rows if str(r.get("claim_status", "")).strip() in ("1", "2")]
    if not settled:
        return 1.0, {"settled_rows": 0}, ["no settled claims to reconcile"]
    ok = 0
    for r in settled:
        paid = parse_number(r.get("total_claim_paid"))
        claimed = parse_number(r.get("total_amount_claimed"))
        if paid is not None and paid > 0 and (claimed is None or paid <= claimed):
            ok += 1
    f = _frac(ok, len(settled))
    return f, {"settled_rows": len(settled), "reconciled": ok}, _cav(f, f"{len(settled) - ok} settled claim(s) fail paid<=claimed")


def _headline(band, score, vr):
    q = vr["quarantined_rows"]
    if band == "Analytics Ready":
        return f"Data Readiness {score}/100 — Analytics Ready. {q} row(s) quarantined for review."
    if band == "Conditional":
        return f"Data Readiness {score}/100 — Conditional. Analytics allowed with caveats; {q} row(s) quarantined."
    return f"Data Readiness {score}/100 — Not Reliable. Fix flagged rows/fields before analytics; {q} row(s) quarantined."
