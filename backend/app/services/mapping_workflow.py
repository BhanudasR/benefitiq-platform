"""Governed manual-mapping workflow (Sprint 3).

System suggests -> user reviews -> user corrects -> system learns a reusable alias
profile -> everything audited. No mapping is silently auto-approved: Low-confidence
and Unmapped columns block confirmation until the user maps them or ignores them
with a reason. User-confirmed aliases are stored (higher priority) and reused on the
next upload — including across TPAs/insurers/clients and across policy years."""
from __future__ import annotations

from ..models.governance import MappingProfile, MappingAudit
from ..canonical.registry import REGISTRY
from ..services import mapping as mp, audit
from ..services.onboarding_service import _get_batch, materialize, FILE_KIND_TABLE

ALIAS_PROFILE = "__aliases__"


def _alias_map(db, tenant: str, file_kind: str) -> dict:
    """User-confirmed aliases for this tenant+file_kind, highest priority first."""
    profs = (db.query(MappingProfile)
             .filter(MappingProfile.tenant_id == tenant,
                     MappingProfile.file_kind == file_kind,
                     MappingProfile.name == ALIAS_PROFILE)
             .order_by(MappingProfile.priority.desc()).all())
    merged = {}
    for p in profs:
        merged.update(p.field_map or {})
    return merged


def _ignored(db, tenant, batch_id) -> set:
    return {a.raw_column for a in db.query(MappingAudit).filter(
        MappingAudit.tenant_id == tenant, MappingAudit.upload_batch_id == batch_id,
        MappingAudit.decision == "ignore").all()}


def review(db, *, tenant, batch_id) -> dict:
    """Suggestions with confidence tiers + what still blocks confirmation."""
    batch = _get_batch(db, tenant, batch_id)
    table = FILE_KIND_TABLE[batch.file_kind]
    m = materialize(db, batch)
    aliases = _alias_map(db, tenant, batch.file_kind)
    sug = mp.suggest_mapping(m["parsed"]["headers"], table, aliases=aliases)
    confirmed = set((batch.field_map or {}).keys())
    ignored = _ignored(db, tenant, batch.id)

    def resolved(h):
        return h in confirmed or h in ignored

    tiers = {"high": [], "medium": [], "low": [], "unmapped": []}
    for s in sug["suggestions"]:
        s["resolved"] = resolved(s["source_header"])
        tiers[s["confidence_tier"]].append(s["source_header"])

    blocking = [s["source_header"] for s in sug["suggestions"]
                if s["confidence_tier"] in ("low", "unmapped") and not resolved(s["source_header"])]
    return {
        "batch_id": batch.id, "table": table,
        "suggestions": sug["suggestions"],
        "tiers": tiers,
        "review_required": tiers["medium"],
        "manual_required": [h for h in tiers["low"] + tiers["unmapped"]],
        "unmapped": tiers["unmapped"],
        "blocking": blocking,
        "can_proceed": not blocking,
        "aliases_applied": len(aliases),
    }


def _single_suggestion(headers_table_header, table):
    r = mp.suggest_mapping([headers_table_header], table)
    return r["suggestions"][0]


def manual_decision(db, *, tenant, actor, batch_id, raw_column, decision,
                    canonical=None, reason=None, save_alias=False, profile_name="default") -> dict:
    """decision: 'map' (set canonical) | 'ignore' (needs reason) | 'alias' (map + learn).
    Records a MappingAudit for every decision."""
    batch = _get_batch(db, tenant, batch_id)
    table = FILE_KIND_TABLE[batch.file_kind]
    valid = {f["canonical"] for f in REGISTRY[table]}
    prior = _single_suggestion(raw_column, table)  # for before/after audit
    conf_before = prior["confidence"]
    prev_sugg = prior["suggested_canonical"]

    if decision in ("map", "alias"):
        if canonical not in valid:
            raise ValueError(f"'{canonical}' is not a canonical field of {table}")
        fm = dict(batch.field_map or {})
        fm[raw_column] = canonical
        batch.field_map = fm
    elif decision == "ignore":
        if not reason or not reason.strip():
            raise ValueError("a reason is mandatory to ignore a column")
        fm = dict(batch.field_map or {})
        fm.pop(raw_column, None)
        batch.field_map = fm
    else:
        raise ValueError("decision must be 'map', 'ignore' or 'alias'")

    profile_version = None
    if decision == "alias":
        prof = (db.query(MappingProfile)
                .filter(MappingProfile.tenant_id == tenant, MappingProfile.file_kind == batch.file_kind,
                        MappingProfile.name == ALIAS_PROFILE).first())
        if prof is None:
            prof = MappingProfile(tenant_id=tenant, file_kind=batch.file_kind, name=ALIAS_PROFILE,
                                  signature="", field_map={}, created_by=actor, priority=100, version=0)
            db.add(prof); db.flush()
        fmap = dict(prof.field_map or {})
        fmap[raw_column] = canonical
        prof.field_map = fmap
        prof.version = (prof.version or 0) + 1
        profile_version = prof.version

    db.add(MappingAudit(
        tenant_id=tenant, upload_batch_id=batch.id, mapping_profile_version=profile_version,
        raw_column=raw_column, selected_canonical=(canonical if decision != "ignore" else None),
        previous_suggestion=prev_sugg, confidence_before=conf_before, decision=decision,
        reason=(reason.strip() if reason else None), actor=actor))
    audit.record(db, tenant_id=tenant, actor=actor, action="MAP_MANUAL",
                 entity_type="upload_batch", entity_id=batch.id,
                 meta={"column": raw_column, "decision": decision, "canonical": canonical})
    db.commit()
    return review(db, tenant=tenant, batch_id=batch.id)
