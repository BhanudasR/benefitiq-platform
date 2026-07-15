"""Governed metric engine base (Sprint 4).

Every metric is computed ONLY from activated canonical data (rows whose
dataset_version is ACTIVE), is tenant-scoped and PolicyVersion/policy-year aware,
excludes anything not loaded (critical/quarantined rows never reached canonical),
propagates Conditional caveats and Restricted status, and returns a full evidence
object that reconciles to the metric value. No raw access, no KPI in frontend."""
from __future__ import annotations

from ..profiling import parse_number
from ...models.governance import DatasetVersion, MetricConfig
from ...models.canonical import PolicyVersion, PolicyMaster, MemberMaster, Claim
from ...canonical.registry import RELATIONSHIP_MASTER, GENDER_MASTER

DEFAULT_LARGE_CLAIM = 1000000.0  # Rs 10 lakh (tenant-configurable)


def get_config(db, tenant: str) -> dict:
    c = db.query(MetricConfig).filter(MetricConfig.tenant_id == tenant).first()
    if c is None:
        return {"large_claim_threshold": DEFAULT_LARGE_CLAIM, "currency": "INR", "source": "default"}
    return {"large_claim_threshold": float(c.large_claim_threshold),
            "currency": c.currency, "source": "tenant_config"}


def norm_relation(v):
    if v is None:
        return None
    s = str(v).strip()
    return RELATIONSHIP_MASTER.get(s, s) or None


def norm_gender(v):
    if v is None:
        return None
    s = str(v).strip()
    return GENDER_MASTER.get(s, s) or None


def parse_year_range(f: dict):
    """Return (year_from, year_to) or (None, None). Accepts policy_year, year_from/
    year_to, or year_range='2024-2026'."""
    if f.get("policy_year") is not None:
        y = int(f["policy_year"])
        return y, y
    if f.get("year_range"):
        parts = str(f["year_range"]).replace("to", "-").split("-")
        try:
            return int(parts[0]), int(parts[-1])
        except (ValueError, IndexError):
            return None, None
    yf = f.get("year_from")
    yt = f.get("year_to")
    return (int(yf) if yf is not None else None, int(yt) if yt is not None else None)


class MetricContext:
    """Resolves the governed row-set for a tenant + filters."""
    SOURCE_TABLES = {"claim": "claim", "policy": "policy_version/policy_master", "member": "member_master"}

    def __init__(self, db, tenant: str, filters: dict | None = None):
        self.db = db
        self.tenant = tenant
        self.f = filters or {}
        self.year_from, self.year_to = parse_year_range(self.f)

    def active_version_ids(self) -> list[str]:
        return [v.id for v in self.db.query(DatasetVersion).filter(
            DatasetVersion.tenant_id == self.tenant, DatasetVersion.status == "ACTIVE").all()]

    # -- policy scope (insurer/tpa/client/policy resolve to policy_version ids) --
    def scoped_policy_versions(self):
        q = self.db.query(PolicyVersion).filter(
            PolicyVersion.tenant_id == self.tenant,
            PolicyVersion.dataset_version_id.in_(self.active_version_ids()))
        f = self.f
        if f.get("policy_version_id"):
            q = q.filter(PolicyVersion.id == f["policy_version_id"])
        if f.get("insurer"):
            q = q.filter(PolicyVersion.insurer_code == str(f["insurer"]))
        if f.get("tpa"):
            q = q.filter(PolicyVersion.tpa_code == str(f["tpa"]))
        if f.get("client_id"):
            q = q.filter(PolicyVersion.client_id == f["client_id"])
        if self.year_from is not None:
            q = q.filter(PolicyVersion.policy_year >= self.year_from)
        if self.year_to is not None:
            q = q.filter(PolicyVersion.policy_year <= self.year_to)
        return q.all()

    def _policy_scope_ids(self):
        """policy_version ids matching insurer/tpa/client/policy_version_id filters,
        or None when no such filter is set (=> no restriction)."""
        f = self.f
        if not any(f.get(k) for k in ("insurer", "tpa", "client_id", "policy_version_id")):
            return None
        return {p.id for p in self.scoped_policy_versions()}

    def _relation_member_keys(self, relation):
        want = norm_relation(relation)
        keys = set()
        for m in self.db.query(MemberMaster).filter(
                MemberMaster.tenant_id == self.tenant,
                MemberMaster.dataset_version_id.in_(self.active_version_ids())).all():
            if norm_relation(m.relationship) == want:
                keys.add(m.member_reference_key)
        return keys

    def claims(self):
        f = self.f
        q = self.db.query(Claim).filter(
            Claim.tenant_id == self.tenant,
            Claim.dataset_version_id.in_(self.active_version_ids()))
        if self.year_from is not None:
            q = q.filter(Claim.policy_year >= self.year_from)
        if self.year_to is not None:
            q = q.filter(Claim.policy_year <= self.year_to)
        if f.get("policy_id"):
            q = q.filter(Claim.policy_id == f["policy_id"])
        if f.get("ailment"):
            q = q.filter(Claim.diagnosis_code_l1 == f["ailment"])
        if f.get("hospital"):
            q = q.filter(Claim.hospital_name == f["hospital"])
        scope = self._policy_scope_ids()
        if scope is not None:
            q = q.filter(Claim.policy_version_id.in_(scope or ["__none__"]))
        if f.get("relation"):
            q = q.filter(Claim.member_reference_key.in_(self._relation_member_keys(f["relation"]) or ["__none__"]))
        return q.all()

    def members(self):
        q = self.db.query(MemberMaster).filter(
            MemberMaster.tenant_id == self.tenant,
            MemberMaster.dataset_version_id.in_(self.active_version_ids()))
        if self.year_from is not None:
            q = q.filter(MemberMaster.policy_year >= self.year_from)
        if self.year_to is not None:
            q = q.filter(MemberMaster.policy_year <= self.year_to)
        return q.all()

    # -- premium (earned where available; else written + caveat) --
    def premium(self):
        pvs = self.scoped_policy_versions()
        total = sum(float(p.premium) for p in pvs if p.premium is not None)
        # canonical has no earned-premium field yet -> written basis with caveat
        basis = "written"
        caveats = [] if not pvs else [
            "Earned premium unavailable in canonical data; written/booked premium used as denominator (basis='written')."]
        restricted = any(bool(p.restricted) for p in pvs)
        conditional = any(bool(p.data_quality_caveat) for p in pvs)
        return {"amount": total, "basis": basis, "caveats": caveats, "count": len(pvs),
                "restricted": restricted, "conditional": conditional}


def trust(rows) -> dict:
    rows = list(rows)
    restricted = any(bool(getattr(r, "restricted", False)) for r in rows)
    conditional = any(bool(getattr(r, "data_quality_caveat", False)) for r in rows)
    if not rows:
        status = "No Data"
    elif restricted:
        status = "Restricted"
    elif conditional:
        status = "Conditional"
    else:
        status = "Analytics Ready"
    return {"data_quality_status": status, "restricted": restricted, "conditional": conditional}


_RELIABILITY = {"Analytics Ready": "high", "Conditional": "medium",
                "Restricted": "low", "No Data": "none"}


def result(*, metric, formula, value, numerator, denominator, source_tables, ctx,
           rows, excluded_rows=0, caveats=None, premium_basis=None, extra=None):
    tr = trust(rows)
    cav = list(caveats or [])
    advisory_blocked = tr["restricted"]
    if advisory_blocked:
        cav.append("Dataset is RESTRICTED (DQ < 70, admin override). Advisory interpretation is "
                   "blocked; figures are directional only.")
    out = {
        "metric": metric, "formula": formula, "value": value,
        "numerator": numerator, "denominator": denominator,
        "source_tables": source_tables,
        "policy_year": ctx.f.get("policy_year"),
        "policy_version_id": ctx.f.get("policy_version_id"),
        "year_range": [ctx.year_from, ctx.year_to] if (ctx.year_from or ctx.year_to) else None,
        "included_rows": len(list(rows)), "excluded_rows": excluded_rows,
        "caveats": cav,
        "data_quality_status": tr["data_quality_status"],
        "restricted": tr["restricted"], "conditional": tr["conditional"],
        "advisory_blocked": advisory_blocked,
        "premium_basis": premium_basis,
        "reliability": _RELIABILITY[tr["data_quality_status"]],
    }
    if extra:
        out.update(extra)
    return out


def incurred_of(claim) -> float:
    paid = parse_number(claim.total_claim_paid) or 0.0
    outstanding = parse_number(claim.outstanding_amount)
    return paid + (outstanding or 0.0)
