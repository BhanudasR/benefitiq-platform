"""Client-pack section registry — the ONE source of truth for pack composition (order, titles,
the source dataset each content section needs, and the PPTX slide-template mapping used as a
FOUNDATION for a later binary generator). Cover + Data Quality appendix are always included;
the content sections are user-selectable."""
from __future__ import annotations

# PPTX slide-template foundation (schema only — no binary generation in Sprint 25).
PPTX_SLIDE_TEMPLATES = {
    "cover": "Title + client + period + trust verdict",
    "kpi_headline": "Headline KPI band + decision sentence",
    "kpi_grid": "KPI grid (client-360)",
    "decision": "Decision + rationale + confidence",
    "drivers": "Ranked driver list + supporting figures",
    "gaps": "Gap table (design/T&C, advisory)",
    "levers": "Lever summary + adjusted baseline",
    "opportunity": "Opportunity summary + posture",
    "appendix": "Evidence appendix — sources, DQ, caveats",
}

# order matters; `content` sections are selectable, cover/appendix are always present.
CLIENT_PACK_SECTIONS = [
    {"id": "cover", "title": "Cover", "order": 0, "slide": "cover", "content": False},
    {"id": "executive_summary", "title": "Executive Summary", "order": 1, "slide": "kpi_headline",
     "content": True, "needs": ["policy", "claims"]},
    {"id": "client_portfolio", "title": "Client Portfolio", "order": 2, "slide": "kpi_grid",
     "content": True, "needs": ["policy"]},
    {"id": "renewal_intelligence", "title": "Renewal Intelligence", "order": 3, "slide": "decision",
     "content": True, "needs": ["claims"]},
    {"id": "claims_drivers", "title": "Claims Drivers", "order": 4, "slide": "drivers",
     "content": True, "needs": ["claims"]},
    {"id": "benchmark_gaps", "title": "Benefit / Benchmark Gaps", "order": 5, "slide": "gaps",
     "content": True, "needs": ["terms"]},
    {"id": "savings_sandbox", "title": "Savings Sandbox", "order": 6, "slide": "levers",
     "content": True, "needs": ["claims"]},
    {"id": "placement_recommendation", "title": "Placement Recommendation", "order": 7, "slide": "decision",
     "content": True, "needs": ["claims", "terms"]},
    {"id": "wellness_opportunity", "title": "Wellness Opportunity", "order": 8, "slide": "opportunity",
     "content": True, "needs": ["claims"]},
    {"id": "data_quality_appendix", "title": "Data Quality / Source Evidence", "order": 9,
     "slide": "appendix", "content": False},
]

_BY_ID = {s["id"]: s for s in CLIENT_PACK_SECTIONS}
CONTENT_IDS = [s["id"] for s in CLIENT_PACK_SECTIONS if s["content"]]
ALWAYS_IDS = [s["id"] for s in CLIENT_PACK_SECTIONS if not s["content"]]

# named presets over the registry (pack types)
PACK_TYPES = {
    "full_board_pack": CONTENT_IDS,
    "renewal_pack": ["executive_summary", "renewal_intelligence", "claims_drivers",
                     "savings_sandbox", "benchmark_gaps"],
    "placement_pack": ["executive_summary", "claims_drivers", "benchmark_gaps",
                       "placement_recommendation"],
}


def get_section(sid):
    return _BY_ID.get(sid)


def resolve_ids(requested, pack_type=None):
    """Resolve the ordered list of content section ids to build. `requested` (explicit selection)
    wins; else the pack_type preset; else the full pack. Unknown ids are dropped."""
    if requested:
        chosen = [i for i in requested if i in _BY_ID and _BY_ID[i]["content"]]
    elif pack_type and pack_type in PACK_TYPES:
        chosen = list(PACK_TYPES[pack_type])
    else:
        chosen = list(CONTENT_IDS)
    # keep registry order, dedupe
    seen = set()
    return [i for i in sorted(chosen, key=lambda x: _BY_ID[x]["order"]) if not (i in seen or seen.add(i))]


def ordered_full(content_ids):
    """Cover + selected content (in registry order) + appendix — the full pack section order."""
    ids = ["cover"] + [i for i in sorted(content_ids, key=lambda x: _BY_ID[x]["order"])] + ["data_quality_appendix"]
    return ids
