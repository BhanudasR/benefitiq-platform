"""Governed, code-defined Benefit Benchmark Feature Registry (Sprint 15).

The 24 benchmark features, each mapped to its source (a confirmed BenefitTerm `term_type`,
a policy field, or 'not yet captured'), a value type, a comparison `direction` (which way is
more generous — for interpretation only; classification is by value position vs the peer
benchmark), a comparability mode and a category (design vs policy terms & conditions).
Features whose structured source is not yet captured return 'Not Available / Not Comparable'
with an explicit reason — never a fabricated value. This registry is DESIGN/T&C only; it
references no claims concept."""
from __future__ import annotations

# comparability: numeric | categorical | text_presence | not_captured
# value_type:    percent | amount | months | boolean | text | policy
# direction:     higher_generous | lower_generous | neutral
# category:      design | terms
def _f(feature_id, label, term_type, value_type, direction, comparability, category, discussion):
    return {"feature_id": feature_id, "label": label, "term_type": term_type,
            "value_type": value_type, "direction": direction, "comparability": comparability,
            "category": category, "discussion": discussion}


FEATURES: list[dict] = [
    _f("sum_insured", "Sum Insured", None, "policy", "higher_generous", "not_captured", "design",
       "Sum Insured is {classification} vs peers; review adequacy of cover level."),
    _f("family_definition", "Family Definition", None, "categorical", "neutral", "not_captured", "design",
       "Family definition is {classification} vs peers; review eligibility breadth."),
    _f("covered_relationships", "Covered Relationships", None, "categorical", "higher_generous", "not_captured", "design",
       "Covered relationships are {classification} vs peers; review dependant coverage."),
    _f("room_rent", "Room Rent", "room_rent", "percent", "higher_generous", "numeric", "design",
       "Room rent eligibility is {classification} vs the peer benchmark ({benchmark}); align to reduce member out-of-pocket."),
    _f("icu_limit", "ICU Limit", "icu_rent", "percent", "higher_generous", "numeric", "design",
       "ICU limit is {classification} vs peers ({benchmark}); review ICU eligibility."),
    _f("copay", "Co-pay", "copay", "percent", "lower_generous", "numeric", "design",
       "Co-pay is {classification} vs peers ({benchmark}); a higher co-pay increases member cost-share."),
    _f("parent_copay", "Parent Co-pay", "parent_copay", "percent", "lower_generous", "numeric", "design",
       "Parent co-pay is {classification} vs peers ({benchmark}); review parental cost-share."),
    _f("disease_capping", "Disease-wise Capping", "disease_cap", "amount", "higher_generous", "numeric", "design",
       "Disease-wise capping is {classification} vs peers ({benchmark}); review sub-limit adequacy."),
    _f("procedure_capping", "Procedure-wise Capping", None, "amount", "higher_generous", "not_captured", "design",
       "Procedure-wise capping is {classification} vs peers; review procedure sub-limits."),
    _f("maternity_limit", "Maternity Limit", "maternity_limit", "amount", "higher_generous", "numeric", "design",
       "Maternity limit is {classification} vs peers ({benchmark}); review maternity cover."),
    _f("newborn_cover", "Newborn Cover", "newborn_cover", "amount", "higher_generous", "numeric", "design",
       "Newborn cover is {classification} vs peers ({benchmark})."),
    _f("ped_waiting", "PED / Waiting Period", "waiting_period", "months", "lower_generous", "numeric", "terms",
       "PED / waiting period is {classification} vs peers ({benchmark}); a longer wait is less generous."),
    _f("daycare", "Daycare", "daycare", "amount", "higher_generous", "numeric", "design",
       "Daycare cover is {classification} vs peers ({benchmark})."),
    _f("ambulance", "Ambulance", None, "amount", "higher_generous", "not_captured", "design",
       "Ambulance cover is {classification} vs peers."),
    _f("pre_post_hospitalization", "Pre / Post Hospitalization", None, "text", "higher_generous", "not_captured", "terms",
       "Pre / post hospitalization terms are {classification} vs peers."),
    _f("corporate_buffer", "Corporate Buffer", "corporate_buffer", "amount", "higher_generous", "numeric", "design",
       "Corporate buffer is {classification} vs peers ({benchmark})."),
    _f("opd", "OPD", None, "amount", "higher_generous", "not_captured", "design",
       "OPD benefit is {classification} vs peers."),
    _f("wellness_preventive", "Wellness / Preventive Benefit", None, "boolean", "higher_generous", "not_captured", "design",
       "Wellness / preventive benefit is {classification} vs peers."),
    _f("mental_health", "Mental Health Cover", None, "boolean", "higher_generous", "not_captured", "design",
       "Mental health cover is {classification} vs peers."),
    _f("modern_treatment", "Modern Treatment", None, "boolean", "higher_generous", "not_captured", "terms",
       "Modern treatment cover is {classification} vs peers."),
    _f("network_cashless", "Network / Cashless Terms", None, "categorical", "higher_generous", "not_captured", "terms",
       "Network / cashless terms are {classification} vs peers."),
    _f("non_payables_exclusions", "Non-payables / Exclusions", "exclusion", "text", "lower_generous", "text_presence", "terms",
       "Non-payables / exclusions are {classification} vs peers; review restrictive exclusions."),
    _f("domiciliary", "Domiciliary", None, "boolean", "higher_generous", "not_captured", "terms",
       "Domiciliary cover is {classification} vs peers."),
    _f("lasik_robotic_advanced", "Lasik / Robotic / Advanced Treatments", None, "boolean", "higher_generous", "not_captured", "design",
       "Lasik / robotic / advanced treatment cover is {classification} vs peers."),
]

FEATURE_IDS = [f["feature_id"] for f in FEATURES]
BY_ID = {f["feature_id"]: f for f in FEATURES}
TERM_FEATURES = [f for f in FEATURES if f["term_type"] is not None]     # features with a live source
