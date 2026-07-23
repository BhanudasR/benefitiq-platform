"""Module readiness registry (Sprint 24 — locked decision 2). ONE centralized map from source
file kind -> the analytics modules that depend on it. Module readiness is ADVISORY readiness
derived from the readiness/DQ status of the source dataset(s); it never silently blocks the app
unless the underlying dataset is Restricted / advisory-blocked. Do not scatter this logic."""
from __future__ import annotations

from . import norm_band, gate, envelope, BAND_RANK

# file_kind -> analytics modules that consume that dataset (advisory linkage, single source).
EVIDENCE_MODULE_MAP = {
    "claims": ["Claims", "ICR", "Ailment", "Hospital", "Settlement", "Maternity",
               "Rejection", "Large Claims"],
    "member": ["Demographics", "Employee & Family", "Relation", "SI Utilization"],
    "policy": ["Broker Portfolio", "Client Portfolio", "Renewal Intelligence",
               "Placement Intelligence"],
    "terms": ["Benefits & Benchmarking", "Savings Sandbox", "Balanced Benefit Design"],
    "wellness": ["Wellness Intelligence"],
}
# Wellness may be fed by a dedicated wellness dataset OR derived from claims when no wellness
# file is present (advisory fallback, documented + centralized — never scattered).
_WELLNESS_FALLBACK_KIND = "claims"


def modules_for_kinds(kinds) -> list:
    """Union of analytics modules impacted by a set of source file kinds (used to explain which
    modules an affected field / issue touches)."""
    out = []
    for k in kinds:
        for m in EVIDENCE_MODULE_MAP.get(k, []):
            if m not in out:
                out.append(m)
    return out


def _worst_by_kind(descs):
    """Worst (min-band) ACTIVE dataset per file kind — a weak dataset of a kind gates its modules."""
    out = {}
    for d in descs:
        fk = d["file_kind"]
        band = norm_band(d["dv"].readiness_status, bool(d["dv"].restricted))
        prev = out.get(fk)
        if prev is None or (band in BAND_RANK and BAND_RANK[band] < BAND_RANK.get(prev["band"], 99)):
            out[fk] = {"band": band, "dv": d["dv"], "dq": d["dq"]}
    return out


def _blocking_caveats(dqr):
    if not dqr or not dqr.components:
        return []
    out = []
    for c in dqr.components:
        for cav in (c.get("caveats") or []):
            if cav not in out:
                out.append(cav)
    return out[:5]


def _score(dv, dqr):
    if dv.dq_score is not None:
        return float(dv.dq_score)
    if dqr and dqr.overall_score is not None:
        return float(dqr.overall_score)
    return None


def module_readiness(ectx) -> dict:
    descs = ectx.dataset_descriptors(status="ACTIVE")
    worst = _worst_by_kind(descs)

    modules = []
    dist: dict = {}
    for kind, mod_names in EVIDENCE_MODULE_MAP.items():
        src_kind = kind
        fallback = False
        info = worst.get(kind)
        if info is None and kind == "wellness":
            info = worst.get(_WELLNESS_FALLBACK_KIND)
            if info is not None:
                src_kind, fallback = _WELLNESS_FALLBACK_KIND, True

        if info is None:
            band, dv_id, restricted, blocking = "No Data", None, False, []
            why = f"No active {kind} dataset in scope — {kind}-driven analytics are not available yet."
        else:
            dv = info["dv"]
            band = info["band"]
            dv_id = dv.id
            restricted = bool(dv.restricted) or band == "Restricted"
            sc = _score(dv, info["dq"])
            why = f"{src_kind} dataset is {band}" + (f" (DQ {sc})" if sc is not None else "")
            if fallback:
                why += " — wellness derived from claims (no dedicated wellness dataset)."
            blocking = _blocking_caveats(info["dq"]) if band in ("Restricted", "Conditional") else []

        for m in mod_names:
            dist[band] = dist.get(band, 0) + 1
            modules.append({
                "module": m, "readiness": band, "source_file_kind": src_kind,
                "dataset_version_id": dv_id, "restricted": restricted,
                "advisory_fallback": fallback, "blocking_caveats": blocking, "why": why,
            })

    headline = gate([m["readiness"] for m in modules])
    missing = [k for k in EVIDENCE_MODULE_MAP
               if k not in worst and not (k == "wellness" and _WELLNESS_FALLBACK_KIND in worst)]
    caveats = []
    if missing:
        caveats.append("No active dataset for: " + ", ".join(missing)
                       + ". Their modules show as Not available until onboarded.")

    value = {
        "modules": modules,
        "readiness_distribution": dist,
        "module_count": len(modules),
        "note": "Advisory readiness based on the available source dataset(s) and their DQ status. "
                "A module is only blocked when its source dataset is Restricted / advisory-blocked.",
        "map_basis": "EVIDENCE_MODULE_MAP",
    }
    return envelope("data_quality", "module_readiness", value, status=headline,
                    formula="module readiness = readiness of its source dataset via "
                            "EVIDENCE_MODULE_MAP (worst active dataset per file kind) ; advisory, "
                            "non-blocking unless the source dataset is Restricted",
                    source_tables=["dataset_version", "upload_batch", "dq_result"],
                    caveats=caveats)
