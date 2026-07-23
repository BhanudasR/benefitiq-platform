"""Evidence appendix — consolidates the governed Data Quality overview (Sprint 24) with a
per-section source / DQ / caveat / confidence summary, so the pack is self-auditing. No raw rows,
no PII — governance metadata and per-section provenance only. Read-only."""
from __future__ import annotations

from . import section
from ..evidence.context import EvidenceContext
from ..evidence import overview as ev_overview


def build_appendix(ectx, content_sections) -> dict:
    # governed DQ overview (reused, not recomputed)
    try:
        dq = ev_overview.dq_overview(EvidenceContext(ectx.db, ectx.tenant, ectx.filt()))
    except Exception:
        dq = {"data_quality_status": "No Data", "value": {}, "caveats": [], "formula": None,
              "source_tables": []}
    dv = dq.get("value") or {}
    status = dq.get("data_quality_status") or "No Data"

    # per-section provenance (source tables + DQ + confidence) — no numbers, no PII
    provenance = [{
        "section": s["title"], "status": s["status"], "readiness": s["readiness"],
        "source_tables": s.get("source_tables") or [], "confidence": s.get("confidence"),
        "caveats": s.get("caveats") or [],
    } for s in content_sections]

    sec = section("data_quality_appendix", "Data Quality / Source Evidence", status=status,
                  headline=("Trust appendix — headline readiness "
                            f"'{dv.get('headline_readiness') or status}' by min-band-gates."),
                  kpis=[], caveats=dq.get("caveats"),
                  source_tables=dq.get("source_tables") or ["dataset_version", "dq_result", "validation_issue"],
                  confidence=dq.get("reliability"),
                  evidence={"formula": dq.get("formula"), "source_tables": dq.get("source_tables")})
    # attach the appendix payload (governance metadata + provenance)
    sec["appendix"] = {
        "headline_readiness": dv.get("headline_readiness"),
        "weighted_dq_score": dv.get("weighted_dq_score"),
        "weight_basis": dv.get("weight_basis"),
        "active_dataset_count": dv.get("active_dataset_count"),
        "dataset_readiness": dv.get("dataset_readiness"),
        "issues": dv.get("issues"),
        "gating_reason": dv.get("gating_reason"),
        "provenance": provenance,
    }
    return sec
