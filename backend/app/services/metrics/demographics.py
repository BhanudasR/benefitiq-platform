"""Demographics metrics (Sprint 21) — age bands, gender, relationship, employee/dependent
split, senior population (age >= 60) and average age. Governed + explainable, tenant-scoped.

Uses `member.age` DIRECTLY — no DOB inference in Sprint 21. Missing age/gender are counted
and caveated, never fabricated. All aggregation is backend-computed."""
from __future__ import annotations

from .base import MetricContext, result, norm_relation, norm_gender

# governed age bands (documented constants; not per-tenant config in Sprint 21)
AGE_BANDS = [("0-17", 0, 17), ("18-25", 18, 25), ("26-35", 26, 35), ("36-45", 36, 45),
             ("46-55", 46, 55), ("56-59", 56, 59), ("60+", 60, 200)]
SENIOR_AGE = 60                       # approved senior definition
_EMPLOYEE_RELATIONS = {"Self", "Employee"}


def _band_for(age: int):
    for label, lo, hi in AGE_BANDS:
        if lo <= age <= hi:
            return label
    return None


def _dist(counter: dict, total: int):
    return [{"key": k, "count": v, "share": round(v / total, 4) if total else None}
            for k, v in sorted(counter.items(), key=lambda kv: kv[1], reverse=True)]


def demographics_metrics(ctx: MetricContext) -> dict:
    members = ctx.members()
    n = len(members)
    ages = [int(m.age) for m in members if m.age is not None]
    missing_age = sum(1 for m in members if m.age is None)
    missing_gender = sum(1 for m in members if not (m.gender or "").strip())

    band_counts = {label: 0 for label, _, _ in AGE_BANDS}
    for a in ages:
        b = _band_for(a)
        if b:
            band_counts[b] += 1
    age_bands = [{"band": label, "count": band_counts[label],
                  "share": round(band_counts[label] / len(ages), 4) if ages else None}
                 for label, _, _ in AGE_BANDS]

    gender_counter: dict = {}
    for m in members:
        g = norm_gender(m.gender)
        if g:
            gender_counter[g] = gender_counter.get(g, 0) + 1
    gender_total = sum(gender_counter.values())
    gender_distribution = _dist(gender_counter, gender_total) if gender_counter else None

    rel_counter: dict = {}
    for m in members:
        r = norm_relation(m.relationship) or "Unknown"
        rel_counter[r] = rel_counter.get(r, 0) + 1
    relationship_distribution = _dist(rel_counter, n)

    employee_count = sum(1 for m in members if norm_relation(m.relationship) in _EMPLOYEE_RELATIONS)
    dependent_count = n - employee_count
    dependent_ratio = round(dependent_count / employee_count, 4) if employee_count else None

    senior_count = sum(1 for a in ages if a >= SENIOR_AGE)
    senior_share = round(senior_count / len(ages), 4) if ages else None
    average_age = round(sum(ages) / len(ages), 1) if ages else None

    caveats = []
    if missing_age:
        caveats.append(f"{missing_age} member(s) have no age; excluded from age-band, senior and "
                       f"average-age analysis (member.age only — no DOB inference in this view).")
    if missing_gender:
        caveats.append(f"{missing_gender} member(s) have no gender; excluded from the gender distribution.")
    if not members:
        caveats.append("No members in scope.")

    value = {
        "member_count": n,
        "age_bands": age_bands,
        "gender_distribution": gender_distribution,          # None => "Not available" in the UI
        "relationship_distribution": relationship_distribution,
        "employee_count": employee_count, "dependent_count": dependent_count,
        "dependent_ratio": dependent_ratio,
        "senior_count": senior_count, "senior_share": senior_share,
        "average_age": average_age,
        "missing_age": missing_age, "missing_gender": missing_gender,
        "senior_definition_age": SENIOR_AGE,
    }
    return result(
        metric="demographics", value=value, numerator=n, denominator=None,
        formula="age bands from member.age ; senior = age >= 60 ; average_age = mean(member.age) ; "
                "shares = band count / members-with-that-field",
        source_tables=["member_master"], ctx=ctx, rows=members,
        excluded_rows=missing_age, caveats=caveats)
