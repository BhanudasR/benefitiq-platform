from app.canonical.registry import (REGISTRY, Tier, mandatory_fields, critical_fields,
                                     all_synonyms, CLAIM_STATUS_MASTER)


def test_core_tables_present():
    for t in ("client_master", "policy_master", "member_master", "claims"):
        assert t in REGISTRY and len(REGISTRY[t]) > 0


def test_critical_fields_defined():
    assert "policy_number" in critical_fields("policy_master")
    assert "total_claim_paid" in critical_fields("claims")
    assert "claim_status" in critical_fields("claims")


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
