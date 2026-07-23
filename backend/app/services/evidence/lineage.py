"""Source-file lineage — the file -> upload_batch -> dataset_version chain that produced the
analytics. Raw files are content-addressed (sha256) and immutable, so users can see exactly which
uploads feed which active dataset. Read-only; no DQ recomputation."""
from __future__ import annotations

from . import norm_band, gate, envelope


def lineage(ectx) -> dict:
    descs = ectx.dataset_descriptors()  # all statuses, ordered by created_at

    files = []
    for d in descs:
        dv, b, rf, dqr = d["dv"], d["batch"], d["raw"], d["dq"]
        score = float(dv.dq_score) if dv.dq_score is not None else (
            float(dqr.overall_score) if dqr and dqr.overall_score is not None else None)
        files.append({
            "file_name": rf.file_name if rf else None,
            "file_kind": d["file_kind"],
            "sha256_short": (rf.sha256[:12] if rf and rf.sha256 else None),
            "size_bytes": rf.size_bytes if rf else None,
            "uploaded_by": rf.uploaded_by if rf else None,
            "uploaded_at": rf.uploaded_at.isoformat() if rf and rf.uploaded_at else None,
            "immutable": bool(rf.immutable) if rf else None,
            "batch_id": b.id if b else None,
            "batch_status": b.status if b else None,
            "dataset_version_id": dv.id,
            "version_no": dv.version_no,
            "status": dv.status,
            "active": dv.status == "ACTIVE",
            "approved_by": dv.approved_by,
            "activated_at": dv.activated_at.isoformat() if dv.activated_at else None,
            "dq_score": score,
            "readiness": norm_band(dv.readiness_status, bool(dv.restricted)),
        })
    files.sort(key=lambda f: (f["uploaded_at"] or "", f["version_no"] or 0))

    active_ct = sum(1 for f in files if f["active"])
    value = {
        "files": files,
        "file_count": len(files),
        "active_count": active_ct,
        "immutable_raw": (all(f["immutable"] for f in files) if files else None),
        "kinds": sorted({f["file_kind"] for f in files if f["file_kind"]}),
    }
    if not files:
        status = "No Data"
    elif active_ct:
        status = gate([f["readiness"] for f in files if f["active"]])
    else:
        status = "Conditional"

    return envelope("data_quality", "lineage", value, status=status,
                    formula="file -> upload_batch -> dataset_version chain ; raw files are "
                            "content-addressed (sha256) and immutable",
                    source_tables=["raw_file", "upload_batch", "dataset_version"],
                    caveats=[])
