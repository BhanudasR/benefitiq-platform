"""BenefitIQ canonical field registry (aligned to IRDAI F15 + BenefitIQ v2 DD).

Single source of truth for: canonical table/field names, field tier
(critical/important/optional), whether mandatory, dtype, and mapping synonyms.
Consumed by mapping, validation and the Data Quality Score engine (next sprint).
Tiers drive missing-data behaviour: critical blocks row/KPI, important allows
analytics-with-caveat, optional never blocks.
"""
from enum import Enum


class Tier(str, Enum):
    CRITICAL = "critical"
    IMPORTANT = "important"
    OPTIONAL = "optional"


def _f(name, tier, dtype, mandatory=True, synonyms=None, f15=None):
    return {"canonical": name, "tier": tier, "dtype": dtype, "mandatory": mandatory,
            "synonyms": synonyms or [], "f15_ref": f15}


REGISTRY = {
    "client_master": [
        _f("client_id", Tier.CRITICAL, "id", synonyms=["client id"]),
        _f("client_name", Tier.CRITICAL, "str", synonyms=["client name", "name of the client", "insured name"]),
        _f("primary_industry", Tier.OPTIONAL, "str", mandatory=False, synonyms=["primary industry", "industry"]),
        _f("total_employee_count", Tier.OPTIONAL, "int", mandatory=False, synonyms=["total employees"]),
    ],
    "policy_master": [
        _f("policy_number", Tier.CRITICAL, "str", synonyms=["policy number", "txt_policy_number"], f15="150004"),
        _f("master_policy_number", Tier.IMPORTANT, "str", synonyms=["txt_master_policy_number"], f15="150004"),
        _f("insurer_code", Tier.IMPORTANT, "int", synonyms=["txt_insurer_code", "insurer name"], f15="150002"),
        _f("tpa_code", Tier.IMPORTANT, "int", synonyms=["txt_tpa_code", "tpa name"], f15="150001"),
        _f("product_type", Tier.IMPORTANT, "code", synonyms=["txt_product_type", "section/product"], f15="150011"),
        _f("policy_type", Tier.IMPORTANT, "code", synonyms=["txt_type_of_policy"], f15="150012"),
        _f("policy_start_date", Tier.CRITICAL, "date", synonyms=["date_policy_start", "policy start date"], f15="150009"),
        _f("policy_end_date", Tier.CRITICAL, "date", synonyms=["date_policy_end", "policy end date"], f15="150010"),
        _f("policy_premium", Tier.CRITICAL, "num", synonyms=["num_policy_premium", "total premium", "premium"], f15="150036"),
        _f("corporate_floater_sum_insured", Tier.IMPORTANT, "num", mandatory=False, synonyms=["num_corporate_floater_sum_insured", "corporate buffer"], f15="150013"),
    ],
    "member_master": [
        _f("policy_number", Tier.CRITICAL, "str", synonyms=["txt_policy_number"], f15="150004"),
        _f("member_reference_key", Tier.CRITICAL, "str", synonyms=["txt_member_reference_key", "mrk", "member id"], f15="150005"),
        _f("employee_id", Tier.IMPORTANT, "str", mandatory=False, synonyms=["employee_id", "emp id"], f15="150006"),
        _f("date_of_birth", Tier.IMPORTANT, "date", synonyms=["date_of_birth", "dob"], f15="150007"),
        _f("age", Tier.IMPORTANT, "int", synonyms=["num_age_of_insured", "age"], f15="150008"),
        _f("gender", Tier.IMPORTANT, "code", synonyms=["txt_gender", "gender"], f15="150032"),
        _f("sum_insured", Tier.CRITICAL, "num", synonyms=["num_sum_insured", "sum insured", "si"], f15="150033"),
        _f("relationship", Tier.IMPORTANT, "code", synonyms=["txt_relationship_of_insured", "relation"], f15="150034"),
    ],
    "claims": [
        _f("policy_number", Tier.CRITICAL, "str", synonyms=["txt_policy_number"], f15="150004"),
        _f("claim_number", Tier.CRITICAL, "str", synonyms=["txt_claim_number", "claim id", "claim no"], f15="C21"),
        _f("member_reference_key", Tier.IMPORTANT, "str", synonyms=["txt_member_reference_key", "member id"], f15="150005"),
        _f("diagnosis_code_l1", Tier.IMPORTANT, "str", mandatory=False, synonyms=["txt_diagnosis_code_level_i", "icd", "ailment"]),
        _f("hospital_name", Tier.IMPORTANT, "str", mandatory=False, synonyms=["txt_name_of_the_hospital", "hospital"]),
        _f("date_of_admission", Tier.IMPORTANT, "date", mandatory=False, synonyms=["date_of_admission", "admission date"]),
        _f("date_of_discharge", Tier.IMPORTANT, "date", mandatory=False, synonyms=["date_of_discharge", "discharge date"]),
        _f("sum_insured", Tier.CRITICAL, "num", synonyms=["num_sum_insured", "sum insured"], f15="150033"),
        _f("total_amount_claimed", Tier.IMPORTANT, "num", synonyms=["num_total_amount_claimed", "claimed amount"]),
        _f("total_claim_paid", Tier.CRITICAL, "num", synonyms=["num_total_claim_paid", "paid amount", "paid"]),
        _f("room_charges_claimed", Tier.IMPORTANT, "num", mandatory=False, synonyms=["num_room_charges_claimed", "room rent"]),
        _f("nursing_charges_claimed", Tier.OPTIONAL, "num", mandatory=False, synonyms=["num_nursing_charges_claimed"]),
        _f("surgery_charges_claimed", Tier.OPTIONAL, "num", mandatory=False, synonyms=["num_surgery_charges_claimed"]),
        _f("copay_percentage", Tier.OPTIONAL, "num", mandatory=False, synonyms=["num_percentage_of_copayment", "co-pay %"]),
        _f("claim_status", Tier.CRITICAL, "code", synonyms=["txt_claim_status", "claim status", "status"], f15="150-status"),
        _f("hospital_is_network", Tier.OPTIONAL, "bool", mandatory=False, synonyms=["boo_hospital_is_network_provider", "cashless"]),
    ],
}

# Governed value normalization (per BenefitIQ TPA Data Strategy).
CLAIM_STATUS_MASTER = {"1": "Settled Fully", "2": "Settled Partially", "3": "Repudiated", "4": "Outstanding"}
RELATIONSHIP_MASTER = {"1": "Self", "2": "Spouse", "3": "Father", "4": "Mother", "5": "Son", "6": "Daughter", "99": "Others"}
GENDER_MASTER = {"1": "Male", "2": "Female", "3": "Other"}


def mandatory_fields(table: str):
    return [f["canonical"] for f in REGISTRY[table] if f["mandatory"]]


def critical_fields(table: str):
    return [f["canonical"] for f in REGISTRY[table] if f["tier"] == Tier.CRITICAL]


def all_synonyms(table: str):
    m = {}
    for f in REGISTRY[table]:
        for s in [f["canonical"]] + f["synonyms"]:
            m[s.lower()] = f["canonical"]
    return m
