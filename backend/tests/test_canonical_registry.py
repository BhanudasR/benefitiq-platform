import ast
from pathlib import Path

from app.canonical.registry import (REGISTRY, Tier, mandatory_fields, critical_fields,
                                     all_synonyms, CLAIM_STATUS_MASTER)


CORE_F15_TABLE_COUNTS = {"claims": 175, "member_master": 55, "policy_master": 40}
CORE_F15_TAGGED_COUNTS = {"claims": 171, "member_master": 53, "policy_master": 35}
NON_F15_REGISTRY_FIELDS = {
    "claims": {"outstanding_amount", "incurred_amount", "proposer_policy_holder__detail_address", "financial_year"},
    "member_master": {"financial_year", "distribution_channel_code"},
    "policy_master": {"financial_year", "date_of_birth", "age_of_insured", "gender", "sum_insured"},
}
MODEL_CLASSES = {"claims": "Claim", "member_master": "MemberMaster", "policy_master": "PolicyMaster"}
PERSISTED_REGISTRY_COUNTS = {"claims": 17, "member_master": 10, "policy_master": 10}


def test_core_tables_present():
    for t in ("client_master", "policy_master", "member_master", "claims"):
        assert t in REGISTRY and len(REGISTRY[t]) > 0


def test_core_f15_registry_counts_are_explicit():
    """Lock current registry reality.

    The latest commit message says 268 fields, but the runtime registry contains
    270 policy/member/claims entries. Of those, 259 are F15-tagged and 11 are
    non-F15 helper/informational entries. This test deliberately protects the
    current non-blocking pilot registry until source-dictionary reconciliation is
    performed from a readable .xlsx/.csv export.
    """
    assert {t: len(REGISTRY[t]) for t in CORE_F15_TABLE_COUNTS} == CORE_F15_TABLE_COUNTS
    assert sum(CORE_F15_TABLE_COUNTS.values()) == 270
    assert {
        t: sum(1 for f in REGISTRY[t] if f.get("f15_ref"))
        for t in CORE_F15_TAGGED_COUNTS
    } == CORE_F15_TAGGED_COUNTS
    assert sum(CORE_F15_TAGGED_COUNTS.values()) == 259


def test_non_f15_registry_fields_are_intentional_and_visible():
    found = {
        t: {f["canonical"] for f in REGISTRY[t] if not f.get("f15_ref")}
        for t in NON_F15_REGISTRY_FIELDS
    }
    assert found == NON_F15_REGISTRY_FIELDS


def test_canonical_names_unique_per_table():
    for table, fields in REGISTRY.items():
        names = [f["canonical"] for f in fields]
        assert len(names) == len(set(names)), table


def test_persisted_vs_mapping_only_registry_fields_are_classified():
    model_columns = _canonical_model_columns()
    persisted = {
        table: {
            f["canonical"]
            for f in REGISTRY[table]
            if f["canonical"] in model_columns[MODEL_CLASSES[table]]
        }
        for table in MODEL_CLASSES
    }
    assert {table: len(fields) for table, fields in persisted.items()} == PERSISTED_REGISTRY_COUNTS
    for table, fields in persisted.items():
        assert fields
        assert len(REGISTRY[table]) > len(fields)


def test_critical_fields_defined():
    assert "policy_number" in critical_fields("policy_master")
    assert "total_claim_paid" in critical_fields("claims")
    assert "claim_status" in critical_fields("claims")
    assert "member_reference_key" in critical_fields("member_master")


def test_pilot_registry_has_no_mandatory_blocking_fields():
    assert {table: mandatory_fields(table) for table in REGISTRY} == {
        table: [] for table in REGISTRY
    }


def test_tiers_valid():
    for table, fields in REGISTRY.items():
        for f in fields:
            assert f["tier"] in (Tier.CRITICAL, Tier.IMPORTANT, Tier.OPTIONAL)


def test_synonyms_map_to_canonical():
    syn = all_synonyms("claims")
    assert syn["paid amount"] == "total_claim_paid"
    assert syn["claim id"] == "claim_number"


def test_claim_status_master():
    assert CLAIM_STATUS_MASTER["3"] == "Repudiated"


def _canonical_model_columns():
    model_path = Path(__file__).resolve().parents[1] / "app" / "models" / "canonical.py"
    tree = ast.parse(model_path.read_text(encoding="utf-8"))
    columns = {}
    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            columns[node.name] = {
                stmt.target.id
                for stmt in node.body
                if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name)
            }
    return columns
