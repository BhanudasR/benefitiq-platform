"""Governed simulation engine base (Sprint 5).

Every simulation is a WHAT-IF over the SAME governed, activated canonical data the
metric engine uses (services.metrics.base.MetricContext): tenant-scoped, ACTIVE-only,
critical/quarantined rows already excluded, PolicyVersion/policy-year aware. Results
propagate Conditional caveats + Restricted status (Restricted => advisory blocked)
and return a reconciling evidence object. Operational ICR is always reported
unchanged alongside any revised/adjusted view. No raw access, no frontend math."""
from __future__ import annotations

from ..metrics.base import MetricContext, trust, incurred_of, _RELIABILITY
from ..metrics import icr as m_icr
from ..profiling import parse_number
from ...models.governance import SimulationConfig
from ...models.canonical import ClaimBillComponent, MemberMaster

# lever defaults (fractions; 0.01 = 1%). Not actuarial rates.
DEFAULTS = {"room_rent_pct": 0.01, "copay_pct": 0.10, "parent_copay_pct": 0.20,
            "disease_cap": None, "maternity_sublimit": 50000.0}


def get_sim_config(db, tenant: str, overrides: dict | None = None) -> dict:
    row = db.query(SimulationConfig).filter(SimulationConfig.tenant_id == tenant).first()
    cfg = dict(DEFAULTS)
    src = "default"
    if row is not None:
        src = "tenant_config"
        for k in cfg:
            v = getattr(row, k, None)
            if v is not None:
                cfg[k] = float(v) if k != "disease_cap" or v is not None else None
    for k, v in (overrides or {}).items():
        if v is not None and k in cfg:
            cfg[k] = float(v)
            src = "request_override"
    cfg["source"] = src
    return cfg


class SimContext:
    def __init__(self, db, tenant: str, filters: dict | None = None):
        self.db = db
        self.tenant = tenant
        self.mc = MetricContext(db, tenant, filters or {})

    def claims(self):
        return self.mc.claims()

    def bill_map(self, claim_numbers):
        rows = self.db.query(ClaimBillComponent).filter(
            ClaimBillComponent.tenant_id == self.tenant,
            ClaimBillComponent.dataset_version_id.in_(self.mc.active_version_ids()),
            ClaimBillComponent.claim_number.in_(list(claim_numbers) or ["__none__"])).all()
        m = {}
        for c in rows:
            m.setdefault(c.claim_number, []).append(c)
        return m

    def relation_map(self):
        m = {}
        for mem in self.db.query(MemberMaster).filter(
                MemberMaster.tenant_id == self.tenant,
                MemberMaster.dataset_version_id.in_(self.mc.active_version_ids())).all():
            from ..metrics.base import norm_relation
            m.setdefault(mem.member_reference_key, norm_relation(mem.relationship))
            m[(mem.member_reference_key, mem.policy_year)] = norm_relation(mem.relationship)
        return m

    def premium(self):
        return self.mc.premium()

    def operational_icr(self) -> dict:
        rows = self.claims()
        incurred = sum(incurred_of(c) for c in rows)
        paid = sum(parse_number(c.total_claim_paid) or 0.0 for c in rows)
        prem = self.premium()
        earned = prem["amount"]
        return {
            "operational_icr": round(incurred / earned * 100, 2) if earned else None,
            "incurred": incurred, "paid": paid, "premium": earned,
            "premium_basis": prem["basis"], "premium_caveats": prem["caveats"],
            "label": "Operational ICR (unchanged, from governed data)",
        }


def sim_result(*, simulation, formula, inputs, value, rows, source_fields, source_tables,
               included_claims, excluded_claims=0, excluded_reasons=None, assumptions=None,
               caveats=None, operational_icr=None, reliability_penalty=0.0, ctx=None):
    tr = trust(rows)
    cav = list(caveats or [])
    advisory_blocked = tr["restricted"]
    if advisory_blocked:
        cav.append("Dataset is RESTRICTED (DQ < 70, admin override). Advisory interpretation is "
                   "blocked; simulation figures are directional only.")
    # reliability downgraded by proxy usage / missing breakup
    base_rel = _RELIABILITY[tr["data_quality_status"]]
    order = ["none", "low", "medium", "high"]
    if reliability_penalty and base_rel in order:
        idx = max(0, order.index(base_rel) - int(round(reliability_penalty)))
        base_rel = order[idx]
    out = {
        "simulation": simulation, "formula": formula, "inputs": inputs, "value": value,
        "source_fields": source_fields, "source_tables": source_tables,
        "included_claims": included_claims, "excluded_claims": excluded_claims,
        "excluded_reasons": excluded_reasons or {},
        "assumptions": assumptions or [], "caveats": cav,
        "data_quality_status": tr["data_quality_status"],
        "restricted": tr["restricted"], "conditional": tr["conditional"],
        "advisory_blocked": advisory_blocked, "reliability": base_rel,
    }
    if operational_icr is not None:
        out["operational_icr"] = operational_icr
    if ctx is not None:
        out["policy_year"] = ctx.mc.f.get("policy_year")
        out["year_range"] = [ctx.mc.year_from, ctx.mc.year_to] if (ctx.mc.year_from or ctx.mc.year_to) else None
    return out


def eligible_claim_amount(claim) -> float:
    """Eligible claim amount for lever savings = incurred (paid + outstanding)."""
    return incurred_of(claim)


def is_package_claim(claim) -> bool:
    t = (claim.claim_type or "").strip().lower()
    return "package" in t or "fixed" in t
