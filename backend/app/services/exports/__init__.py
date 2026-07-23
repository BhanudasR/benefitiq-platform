"""Governed Client Pack / Export composition (Sprint 25).

Assembles a boardroom-ready CLIENT PACK by COMPOSING the existing governed engines
(metrics, portfolio, renewal recommendation, benchmarking, simulation, placement, wellness,
data-quality) — no new decision logic, no metric recomputation, no raw-row export. Every section
carries its governed envelope (value + data_quality_status + caveats + source_tables + confidence).

v1 is a DEPENDENCY-FREE contract: the backend returns the pack model; the frontend renders a
print-ready board pack (browser Print -> PDF). No PPTX/PDF/XLSX binary is generated here — the
PPTX slide schema is defined as a foundation only. Pack-level trust is MIN-BAND-GATED across the
included sections (reusing the Sprint-24 gating), so one Restricted section stamps the whole pack
directional. Read-only except a single append-only AuditLog EXPORT event on `generate`.
"""
from __future__ import annotations

from ..evidence import norm_band, gate, BAND_RANK, RELIABILITY

# section-status -> export-readiness chip
READINESS = {"Analytics Ready": "ready", "Conditional": "caveated",
             "Restricted": "restricted", "No Data": "no_data"}


def kpi(label, value, fmt, *, status=None, source=None, confidence=None):
    """One governed KPI line. `value` is a scalar straight from an engine (never fabricated,
    never computed here); `fmt` is a display hint only. None -> the UI renders 'Not available'."""
    return {"label": label, "value": value, "format": fmt,
            "data_quality_status": status, "source": source, "confidence": confidence}


def section(sid, title, *, status, headline, kpis=None, caveats=None, source_tables=None,
            confidence=None, evidence=None):
    status = status or "No Data"
    return {
        "id": sid, "title": title, "status": status, "readiness": READINESS.get(status, "no_data"),
        "headline": headline, "kpis": kpis or [], "caveats": list(caveats or []),
        "source_tables": source_tables or [], "confidence": confidence,
        "evidence": evidence or {},
    }


def not_available(sid, title, reason="No governed data in scope for this section."):
    return section(sid, title, status="No Data", headline="Not available",
                   kpis=[], caveats=[reason], source_tables=[], confidence=None, evidence={})


def pack_trust(section_statuses):
    """Min-band-gated pack trust across the included content sections. Returns (band, directional)."""
    real = [s for s in section_statuses if s in BAND_RANK]
    band = gate(real) if real else "No Data"
    return band, band == "Restricted"
