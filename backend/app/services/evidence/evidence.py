"""Evidence / explainability object for the Data Quality views. The DQ score RECONCILES to the
sum of its component weighted_points (the dq_score.py 8-component model), and the headline gating
rule is shown alongside the datasets used. Read-only; never recomputes DQ — it surfaces exactly
what the pipeline persisted so the number on screen can be audited."""
from __future__ import annotations

from . import norm_band, gate, envelope

KINDS = {"overview", "issues", "module-readiness", "lineage"}


def evidence(ectx, kind: str) -> dict:
    descs = ectx.dataset_descriptors(status="ACTIVE")

    datasets = []
    for d in descs:
        dqr = d["dq"]
        comps = list(dqr.components) if (dqr and dqr.components) else []
        summ = round(sum(float(c.get("weighted_points") or 0) for c in comps), 2)
        overall = float(dqr.overall_score) if (dqr and dqr.overall_score is not None) else None
        datasets.append({
            "dataset_version_id": d["dv"].id,
            "file_kind": d["file_kind"],
            "overall_score": overall,
            "sum_weighted_points": summ,
            "reconciles": (overall is not None and abs(summ - overall) < 0.01),
            "readiness": norm_band(d["dv"].readiness_status, bool(d["dv"].restricted)),
            "components": [{"name": c.get("name"), "weight": c.get("weight"),
                           "fraction": c.get("fraction"),
                           "weighted_points": c.get("weighted_points"),
                           "caveats": c.get("caveats")} for c in comps],
        })

    headline = gate([x["readiness"] for x in datasets])
    value = {
        "view": kind,
        "datasets": datasets,
        "gating": {"rule": "min-band-gates",
                   "description": "Worst active dataset band wins (Restricted < Conditional < "
                                  "Analytics Ready); a healthy dataset never masks a weaker one.",
                   "headline_readiness": headline},
        "reconciles_all": (all(x["reconciles"] for x in datasets) if datasets else True),
    }
    return envelope("data_quality", f"evidence:{kind}", value, status=headline,
                    formula="dataset DQ = Sum(component weighted_points) (dq_score.py 8-component "
                            "model) ; headline via min-band-gates over active datasets",
                    source_tables=["dq_result", "dataset_version"],
                    caveats=[])
