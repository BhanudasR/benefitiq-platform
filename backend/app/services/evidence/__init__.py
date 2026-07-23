"""Read-only Source Evidence / Data Quality composition (Sprint 24).

Summarizes the EXISTING governance tables (DatasetVersion, DQResult, ValidationIssue,
MappingProfile/MappingAudit, RawFile, UploadBatch, OverrideRecord, ReviewItem,
CorrectionOverlay, AuditLog) into governed trust views. No DQ recomputation, no writes,
no migration — this layer only READS what the onboarding/DQ pipeline already persisted.

Headline readiness uses MIN-BAND-GATES over ACTIVE datasets: the worst active dataset band
wins (Restricted < Conditional < Analytics Ready), so a healthy policy/member dataset can
never mask a Restricted claims dataset. A records-weighted DQ score is exposed as a SECONDARY
supporting score. The evidence view explains the gating logic and the datasets used.
"""
from __future__ import annotations

RELIABILITY = {"Analytics Ready": "high", "Conditional": "medium",
               "Restricted": "low", "No Data": "none"}

# lower rank = worse; used only for min-band gating over real (non-"No Data") bands.
BAND_RANK = {"Restricted": 0, "Conditional": 1, "Analytics Ready": 2}


def norm_band(readiness_status, restricted_flag: bool = False) -> str:
    """Normalise a dataset's readiness to one of Analytics Ready | Conditional | Restricted | No Data.
    DQResult uses 'Not Reliable' for DQ < 70; a restricted/override dataset is always Restricted."""
    if restricted_flag:
        return "Restricted"
    r = (readiness_status or "").strip()
    if r in ("Not Reliable", "Restricted"):
        return "Restricted"
    if r in ("Analytics Ready", "Conditional"):
        return r
    return "No Data"


def gate(bands) -> str:
    """Min-band-gates headline: the worst real band among `bands`. 'No Data' when none are real."""
    real = [b for b in bands if b in BAND_RANK]
    if not real:
        return "No Data"
    return min(real, key=lambda b: BAND_RANK[b])


def envelope(module: str, view: str, value: dict, *, status: str, formula: str,
             source_tables: list, caveats=None, extra=None) -> dict:
    """Governed response envelope, matching the metric/portfolio contract. When the headline is
    Restricted, advisory interpretation is blocked and the caveat is appended (read-only view)."""
    advisory_blocked = status == "Restricted"
    cav = list(caveats or [])
    if advisory_blocked:
        cav.append("Headline dataset is RESTRICTED (DQ < 70 / admin override). Advisory "
                   "interpretation is blocked; analytics built on it are directional only.")
    out = {
        "module": module, "view": view, "value": value,
        "data_quality_status": status, "restricted": status == "Restricted",
        "advisory_blocked": advisory_blocked, "reliability": RELIABILITY.get(status, "none"),
        "caveats": cav, "formula": formula, "source_tables": source_tables,
    }
    if extra:
        out.update(extra)
    return out
