"""Portfolio-level Data Quality overview — the trust command-center summary.

Headline readiness = MIN-BAND-GATES over ACTIVE datasets (worst active band wins). A
records-weighted DQ score is exposed as the SECONDARY supporting score: Σ(DQ × records)/Σ(records)
over datasets whose record count is available; otherwise an unweighted mean is shown with a caveat.
The gating_reason names the dataset that set the headline. Read-only; no DQ recomputation."""
from __future__ import annotations

from . import norm_band, gate, envelope, BAND_RANK


def _record_count(dqr):
    """Best-effort record count from persisted DQ components (business_rule_validation carries the
    row total). None when unavailable -> the dataset is excluded from the weighted mean (caveat)."""
    if not dqr or not dqr.components:
        return None
    for c in dqr.components:
        ev = c.get("evidence") or {}
        rows = ev.get("rows")
        if isinstance(rows, (int, float)):
            return int(rows)
    return None


def _score(dv, dqr):
    if dv.dq_score is not None:
        return float(dv.dq_score)
    if dqr and dqr.overall_score is not None:
        return float(dqr.overall_score)
    return None


def _decision_split(audits):
    out = {"map": 0, "ignore": 0, "alias": 0}
    for a in audits:
        if a.decision in out:
            out[a.decision] += 1
    return out


def dq_overview(ectx) -> dict:
    active = ectx.dataset_descriptors(status="ACTIVE")
    all_descs = ectx.dataset_descriptors()

    dataset_scores = []
    bands = []
    dist: dict = {}
    weighted_num, weighted_den = 0.0, 0
    unweighted = []
    for d in active:
        dv, dqr = d["dv"], d["dq"]
        band = norm_band(dv.readiness_status, bool(dv.restricted))
        score = _score(dv, dqr)
        rec = _record_count(dqr)
        bands.append(band)
        dist[band] = dist.get(band, 0) + 1
        if score is not None:
            unweighted.append(score)
            if rec:
                weighted_num += score * rec
                weighted_den += rec
        dataset_scores.append({
            "dataset_version_id": dv.id, "file_kind": d["file_kind"], "dq_score": score,
            "readiness": band, "restricted": bool(dv.restricted), "record_count": rec, "weight": rec,
        })

    headline = gate(bands)

    # gating explanation: which active dataset set the headline (worst band, lowest score)
    if not active:
        gating_reason = "No active datasets in scope."
    elif headline in BAND_RANK:
        gated = sorted([s for s in dataset_scores if s["readiness"] == headline],
                       key=lambda s: (s["dq_score"] if s["dq_score"] is not None else 999))
        if gated:
            g = gated[0]
            gating_reason = (f"Headline gated to '{headline}' by the {g['file_kind']} dataset "
                             f"(DQ {g['dq_score']}). Worst active band wins, so a healthy dataset "
                             f"cannot mask a weaker one.")
        else:
            gating_reason = f"Headline readiness '{headline}'."
    else:
        gating_reason = f"Headline readiness '{headline}'."

    if weighted_den:
        weighted_score, weight_basis = round(weighted_num / weighted_den, 2), "records"
    elif unweighted:
        weighted_score, weight_basis = round(sum(unweighted) / len(unweighted), 2), "unweighted_mean"
    else:
        weighted_score, weight_basis = None, "none"

    # issue + mapping summary for the KPI band / severity donut (drill detail lives on /issues)
    issues = ectx.issues()
    sev = {"critical": 0, "warning": 0, "info": 0}
    affected_rows, affected_fields = set(), set()
    for i in issues:
        if i.severity == "ERROR":
            sev["critical"] += 1
        elif i.severity == "WARNING":
            sev["warning"] += 1
        else:
            sev["info"] += 1
        if i.raw_row_index is not None:
            affected_rows.add((i.upload_batch_id, i.raw_row_index))
        if i.field:
            affected_fields.add(i.field)
    quarantined = len({(i.upload_batch_id, i.raw_row_index) for i in issues
                       if i.quarantined and i.raw_row_index is not None})

    audits = ectx.mapping_audits()
    confs = [float(a.confidence_before) for a in audits if a.confidence_before is not None]
    mapping = {
        "avg_confidence": round(sum(confs) / len(confs), 4) if confs else None,
        "manual_decisions": len(audits),
        "decisions": _decision_split(audits),
    }

    value = {
        "headline_readiness": headline,
        "weighted_dq_score": weighted_score,
        "weight_basis": weight_basis,
        "active_dataset_count": len(active),
        "uploads_total": len({d["batch"].id for d in all_descs if d["batch"]}),
        "dataset_version_count": len(all_descs),
        "dataset_scores": dataset_scores,
        "dataset_readiness": dist,
        "gating_reason": gating_reason,
        "issues": {**sev, "affected_records": len(affected_rows),
                   "affected_fields": len(affected_fields), "quarantined": quarantined,
                   "total": len(issues)},
        "mapping": mapping,
        "restricted_or_blocked": [
            {"dataset_version_id": s["dataset_version_id"], "file_kind": s["file_kind"],
             "reason": f"{s['file_kind']} dataset is Restricted (DQ {s['dq_score']})"}
            for s in dataset_scores if s["readiness"] == "Restricted"],
    }

    caveats = []
    no_rec = [s for s in dataset_scores if s["weight"] is None and s["dq_score"] is not None]
    if no_rec and weight_basis != "records":
        caveats.append("Record counts unavailable for some datasets; weighted DQ shown as an "
                       "unweighted mean.")
    if not active:
        caveats.append("No active datasets in scope. Complete Data Onboarding to build the trust view.")

    return envelope("data_quality", "overview", value, status=headline,
                    formula="headline = MIN-BAND-GATES over active datasets "
                            "(Restricted < Conditional < Analytics Ready) ; "
                            "weighted_dq_score = Sum(dataset DQ x records) / Sum(records)",
                    source_tables=["dataset_version", "dq_result", "upload_batch",
                                   "validation_issue", "mapping_audit"],
                    caveats=caveats)
