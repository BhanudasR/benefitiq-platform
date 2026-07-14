"""Data Onboarding pipeline API (Sprint 1): profile -> suggest mapping -> confirm ->
validate -> DQ score + review queue. Endpoints run the governed engines on an
uploaded file. Stateless over the raw bytes (raw immutability owned by /uploads);
a lightweight in-process MappingProfile store demonstrates confirm + reuse until
the DB session is wired. No dashboards, no analytics KPIs here."""
from __future__ import annotations

import json
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException

from ..api.deps import require_role
from ..core.security import Role
from ..services import tabular, profiling, mapping as mp, validation as vd, dq_score, quarantine
from ..services.hashing import sha256_bytes
from ..canonical.registry import REGISTRY

router = APIRouter(prefix="/onboarding", tags=["onboarding"])

FILE_KIND_TABLE = {
    "policy": "policy_master", "member": "member_master",
    "claims": "claims", "client": "client_master",
}

# In-process profile store: {(tenant, file_kind, signature): profile}. Replaced by
# the MappingProfile table once the DB session is wired.
_PROFILES: dict[tuple, dict] = {}


def _table_for(file_kind: str) -> str:
    if file_kind not in FILE_KIND_TABLE:
        raise HTTPException(400, f"unknown file_kind '{file_kind}' (expected {list(FILE_KIND_TABLE)})")
    return FILE_KIND_TABLE[file_kind]


def _load_field_map(field_map_json: str | None) -> dict | None:
    if not field_map_json:
        return None
    try:
        fm = json.loads(field_map_json)
        if not isinstance(fm, dict):
            raise ValueError
        return fm
    except (json.JSONDecodeError, ValueError):
        raise HTTPException(400, "field_map must be a JSON object {source_header: canonical}")


async def _parse(file: UploadFile) -> dict:
    data = await file.read()
    return tabular.parse_table(data)


def _effective_map(parsed: dict, table: str, field_map: dict | None) -> dict:
    """Use the reviewer's confirmed map if provided, else auto-derive from
    high-confidence suggestions (analysis proceeds but DQ reflects the uncertainty)."""
    if field_map:
        return field_map
    sug = mp.suggest_mapping(parsed["headers"], table)
    return {s["source_header"]: s["suggested_canonical"]
            for s in sug["suggestions"] if s["suggested_canonical"]}


@router.post("/profile")
async def profile(file: UploadFile = File(...), file_kind: str = Form(...),
                  principal: dict = Depends(require_role(Role.ANALYST))):
    table = _table_for(file_kind)
    parsed = await _parse(file)
    prof = profiling.profile_table(parsed)
    return {"file_kind": file_kind, "table": table, "profile": prof}


@router.post("/mapping/suggest")
async def mapping_suggest(file: UploadFile = File(...), file_kind: str = Form(...),
                          principal: dict = Depends(require_role(Role.ANALYST))):
    table = _table_for(file_kind)
    parsed = await _parse(file)
    result = mp.suggest_mapping(parsed["headers"], table)
    # auto-suggest a saved profile if the layout matches one we've seen
    sig = mp.layout_signature(parsed["headers"])
    key = (principal["tenant_id"], file_kind, sig)
    result["saved_profile_available"] = key in _PROFILES
    result["layout_signature"] = sig
    return result


@router.post("/mapping/confirm")
async def mapping_confirm(
    file_kind: str = Form(...),
    headers: str = Form(...),                 # JSON array of source headers
    field_map: str = Form(...),               # JSON object {source_header: canonical}
    save_as_profile: bool = Form(default=False),
    profile_name: str = Form(default="default"),
    principal: dict = Depends(require_role(Role.REVIEWER)),   # confirmation needs REVIEWER+
):
    table = _table_for(file_kind)
    try:
        hdrs = json.loads(headers)
    except json.JSONDecodeError:
        raise HTTPException(400, "headers must be a JSON array")
    fm = _load_field_map(field_map)
    result = mp.confirm_mapping(hdrs, table, fm)
    if save_as_profile and result["confirmed"]:
        key = (principal["tenant_id"], file_kind, result["signature"])
        _PROFILES[key] = {"name": profile_name, "field_map": result["field_map"],
                          "signature": result["signature"], "file_kind": file_kind,
                          "created_by": principal["sub"]}
        result["profile_saved"] = True
    return result


@router.post("/mapping/reuse")
async def mapping_reuse(file: UploadFile = File(...), file_kind: str = Form(...),
                        principal: dict = Depends(require_role(Role.ANALYST))):
    table = _table_for(file_kind)
    parsed = await _parse(file)
    sig = mp.layout_signature(parsed["headers"])
    key = (principal["tenant_id"], file_kind, sig)
    prof = _PROFILES.get(key)
    if not prof:
        raise HTTPException(404, "no saved mapping profile matches this layout")
    applied = mp.apply_profile(prof["field_map"], parsed["headers"])
    return {"table": table, "profile_name": prof["name"], "layout_signature": sig, **applied}


@router.post("/validate")
async def validate_ep(file: UploadFile = File(...), file_kind: str = Form(...),
                      field_map: str = Form(default=""),
                      principal: dict = Depends(require_role(Role.ANALYST))):
    table = _table_for(file_kind)
    parsed = await _parse(file)
    fm = _effective_map(parsed, table, _load_field_map(field_map or None))
    mapped = mp.remap_rows(parsed["rows"], fm)
    result = vd.validate(table, mapped)
    return result


@router.post("/dq-score")
async def dq_ep(file: UploadFile = File(...), file_kind: str = Form(...),
                field_map: str = Form(default=""),
                principal: dict = Depends(require_role(Role.ANALYST))):
    """Full governed pipeline: parse -> map -> validate -> DQ score -> review queue."""
    table = _table_for(file_kind)
    data = await file.read()
    parsed = tabular.parse_table(data)
    sug = mp.suggest_mapping(parsed["headers"], table)
    fm = _load_field_map(field_map or None) or {
        s["source_header"]: s["suggested_canonical"]
        for s in sug["suggestions"] if s["suggested_canonical"]}
    mapped = mp.remap_rows(parsed["rows"], fm)
    validation = vd.validate(table, mapped)
    lineage = {"sha256": sha256_bytes(data), "version_no": 1, "is_active_version": True}
    dq = dq_score.compute_dq(table, mapped, sug, validation, lineage)
    review = quarantine.build_review_queue(validation, mapped)
    return {
        "file_kind": file_kind, "table": table,
        "mapping": {"overall_confidence": sug["overall_confidence"],
                    "unmapped_mandatory": sug["unmapped_mandatory"]},
        "dq_score": dq,
        "validation_counts": validation["counts"],
        "review_queue": {"quarantined_count": review["quarantined_count"],
                         "analytics_eligible_count": review["analytics_eligible_count"],
                         "quarantine": review["quarantine"]},
    }
