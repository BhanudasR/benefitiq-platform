"""Mapping engine: suggest canonical fields for messy TPA source headers, score
mapping confidence, let a reviewer confirm, and reuse a saved mapping profile for
the next file with the same layout. Governed by canonical.registry (single source
of truth). Never guesses silently — every suggestion carries a confidence + method
so a human confirms low-confidence mappings before analytics runs."""
from __future__ import annotations

import hashlib
import re
from difflib import SequenceMatcher

from ..canonical.registry import REGISTRY, Tier

_WS = re.compile(r"[^a-z0-9]+")

# confidence tiers for the governed manual-mapping workflow
CONF_HIGH = 0.85
CONF_MEDIUM = 0.60


def confidence_tier(confidence: float, has_canonical: bool) -> str:
    """high = suggested/confirmable · medium = review required ·
    low = manual required · unmapped = user must map or ignore."""
    if not has_canonical:
        return "unmapped"
    if confidence >= CONF_HIGH:
        return "high"
    if confidence >= CONF_MEDIUM:
        return "medium"
    return "low"


def normalize(h: str) -> str:
    """Lowercase, strip prefixes/punctuation so 'Num_Total_Claim_Paid' and
    'Total Claim Paid' collapse to the same token."""
    s = (h or "").strip().lower()
    s = re.sub(r"^(txt|num|date|boo|bool|amt|cd)[_\s]+", "", s)
    return _WS.sub(" ", s).strip()


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def _field_index(table: str):
    """canonical field -> its registry spec, plus a normalized-synonym lookup."""
    specs = {f["canonical"]: f for f in REGISTRY[table]}
    syn = {}
    for f in REGISTRY[table]:
        for token in [f["canonical"]] + f["synonyms"]:
            syn.setdefault(normalize(token), f["canonical"])
    return specs, syn


def suggest_mapping(headers: list[str], table: str, aliases: dict | None = None) -> dict:
    """Return per-source-header suggestions and an overall (mandatory-weighted)
    mapping confidence. method: 'alias' (user-confirmed) | 'exact' (synonym hit) |
    'fuzzy' | 'none'. `aliases` = normalized-alias -> canonical (user-confirmed
    mappings take highest priority so the platform learns across TPAs and years)."""
    if table not in REGISTRY:
        raise ValueError(f"unknown canonical table '{table}'")
    specs, syn = _field_index(table)
    alias_map = {normalize(k): v for k, v in (aliases or {}).items() if v in specs}
    used_canonical: dict[str, tuple[str, float]] = {}  # canonical -> (source, conf)
    suggestions = []

    for h in headers:
        nh = normalize(h)
        canonical, conf, method, alts = None, 0.0, "none", []
        if nh in alias_map:
            canonical, conf, method = alias_map[nh], 1.0, "alias"
        elif nh in syn:
            canonical, conf, method = syn[nh], 1.0, "exact"
        else:
            scored = sorted(
                ((c, max(_similarity(nh, normalize(s)) for s in [c] + specs[c]["synonyms"]))
                 for c in specs),
                key=lambda x: x[1], reverse=True,
            )
            if scored and scored[0][1] >= 0.6:
                canonical, conf, method = scored[0][0], round(scored[0][1], 3), "fuzzy"
            alts = [{"canonical": c, "score": round(s, 3)} for c, s in scored[1:4] if s >= 0.45]

        tier = specs[canonical]["tier"].value if canonical else None
        suggestions.append({
            "source_header": h, "suggested_canonical": canonical, "confidence": conf,
            "method": method, "tier": tier, "alternatives": alts,
            "confidence_tier": confidence_tier(conf, canonical is not None),
        })
        if canonical:
            # keep the highest-confidence source for a canonical field (dedupe collisions)
            if canonical not in used_canonical or conf > used_canonical[canonical][1]:
                used_canonical[canonical] = (h, conf)

    mandatory = [f["canonical"] for f in REGISTRY[table] if f["mandatory"]]
    mapped_mand = [c for c in mandatory if c in used_canonical]
    unmapped_mandatory = [c for c in mandatory if c not in used_canonical]
    # overall confidence: mean confidence over mandatory fields (missing = 0)
    if mandatory:
        overall = round(sum(used_canonical.get(c, ("", 0.0))[1] for c in mandatory) / len(mandatory), 3)
    else:
        overall = 0.0

    low_conf = [s for s in suggestions if s["suggested_canonical"] and s["confidence"] < 0.85]
    return {
        "table": table,
        "suggestions": suggestions,
        "overall_confidence": overall,
        "mapped_mandatory": mapped_mand,
        "unmapped_mandatory": unmapped_mandatory,
        "needs_review": bool(unmapped_mandatory) or bool(low_conf),
        "low_confidence_fields": [s["source_header"] for s in low_conf],
    }


def confirm_mapping(headers: list[str], table: str, field_map: dict[str, str]) -> dict:
    """Validate a reviewer-confirmed mapping (source_header -> canonical). Rejects
    unknown canonicals and reports any still-missing mandatory fields."""
    valid_canon = {f["canonical"] for f in REGISTRY[table]}
    cleaned, unknown = {}, []
    for src, canon in field_map.items():
        if canon in valid_canon:
            cleaned[src] = canon
        elif canon:  # non-empty but unknown
            unknown.append(canon)
    mapped_canon = set(cleaned.values())
    mandatory = [f["canonical"] for f in REGISTRY[table] if f["mandatory"]]
    missing = [c for c in mandatory if c not in mapped_canon]
    return {
        "table": table,
        "field_map": cleaned,
        "unknown_targets": unknown,
        "missing_mandatory": missing,
        "confirmed": not missing and not unknown,
        "signature": layout_signature(headers),
    }


def layout_signature(headers: list[str]) -> str:
    """Stable signature of a source layout (order-independent, normalized) so a saved
    mapping profile can be auto-suggested for the next file with the same columns."""
    norm = sorted(normalize(h) for h in headers if h and h != "__raw_row_index")
    return hashlib.sha256("|".join(norm).encode()).hexdigest()[:16]


def apply_profile(profile_field_map: dict[str, str], headers: list[str]) -> dict:
    """Reuse a saved profile against new headers. Applies mappings for headers that
    still exist; reports headers in the profile that are gone and new unmapped ones."""
    applied = {h: profile_field_map[h] for h in headers if h in profile_field_map}
    missing_from_file = [h for h in profile_field_map if h not in headers]
    new_unmapped = [h for h in headers if h not in profile_field_map and h != "__raw_row_index"]
    return {
        "field_map": applied,
        "reused": len(applied),
        "missing_from_file": missing_from_file,
        "new_unmapped": new_unmapped,
        "full_match": not missing_from_file and not new_unmapped,
    }


def remap_rows(rows: list[dict], field_map: dict[str, str]) -> list[dict]:
    """Project source rows onto canonical field names, preserving __raw_row_index."""
    out = []
    for r in rows:
        rec = {canon: r.get(src, "") for src, canon in field_map.items()}
        rec["__raw_row_index"] = r.get("__raw_row_index")
        out.append(rec)
    return out
