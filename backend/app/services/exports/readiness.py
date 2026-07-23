"""Export readiness — per-section catalogue (is each section ready / caveated / restricted /
no-data for this client) plus an overall "OK to send to client?" verdict. Reuses the section
registry and the same governed statuses the builder produces. Read-only."""
from __future__ import annotations

from . import section as _mk, READINESS, pack_trust
from .context import ExportContext
from .sections import CLIENT_PACK_SECTIONS, resolve_ids
from . import builder as _b


def pack_sections_catalogue(ectx: ExportContext, requested_ids=None, pack_type=None) -> dict:
    """Catalogue of the content sections with per-section readiness for this client, plus the
    overall export-readiness verdict. Builds each section once (governed) to read its status."""
    content_ids = resolve_ids(requested_ids, pack_type)
    built = [_b._safe(sid, ectx) for sid in content_ids]

    items = []
    for s in built:
        items.append({
            "id": s["id"], "title": s["title"], "status": s["status"],
            "readiness": s["readiness"], "included": True,
            "caveats": s.get("caveats") or [],
        })

    pack_status, directional = pack_trust([s["status"] for s in built])
    ready_ct = sum(1 for s in built if s["status"] == "Analytics Ready")
    restricted_ct = sum(1 for s in built if s["status"] == "Restricted")
    na_ct = sum(1 for s in built if s["status"] == "No Data")

    if not built or na_ct == len(built):
        verdict = "not_ready"
        verdict_note = "No governed sections available for this client yet — complete Data Onboarding."
    elif restricted_ct:
        verdict = "ready_directional"
        verdict_note = "Exportable, but a Restricted dataset is in scope — the pack will be stamped directional."
    elif ready_ct == len(built):
        verdict = "ready"
        verdict_note = "All included sections are governed and client-ready."
    else:
        verdict = "ready_caveated"
        verdict_note = "Exportable with caveats — some sections carry data-quality caveats."

    value = {
        "client_id": ectx.client_id, "client_name": ectx.client_name(),
        "sections": items, "content_ids": content_ids,
        "pack_status": pack_status, "directional": directional,
        "verdict": verdict, "verdict_note": verdict_note,
        "counts": {"ready": ready_ct, "restricted": restricted_ct, "no_data": na_ct, "total": len(built)},
    }
    return {
        "module": "client_pack", "view": "sections", "value": value,
        "data_quality_status": pack_status, "restricted": pack_status == "Restricted",
        "advisory_blocked": pack_status == "Restricted",
        "caveats": [], "formula": "per-section governed status + min-band-gated export verdict",
        "source_tables": ["governed engines"],
    }
