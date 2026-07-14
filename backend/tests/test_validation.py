from app.services import tabular, mapping as mp, validation as vd
from tests._fixtures import read_bytes, CLAIMS


def _mapped_claims():
    parsed = tabular.parse_table(read_bytes(CLAIMS))
    sug = mp.suggest_mapping(parsed["headers"], "claims")
    fm = {s["source_header"]: s["suggested_canonical"]
          for s in sug["suggestions"] if s["suggested_canonical"]}
    return mp.remap_rows(parsed["rows"], fm)


def test_outstanding_claim_not_quarantined():
    """Governed nuance: status 4 (Outstanding) with no paid amount is EXPECTED,
    emitted as INFO, and the row is NOT quarantined (no false ERROR)."""
    res = vd.validate("claims", _mapped_claims())
    idx = 3  # CLM-500003 is the 3rd data row -> raw_row_index 3
    row_issues = [i for i in res["issues"] if i["raw_row_index"] == idx]
    rules = {i["rule"] for i in row_issues}
    assert "outstanding_paid_pending" in rules
    assert res["row_status"][idx] != "quarantine"
    # no ERROR fabricated for the pending paid amount
    assert not any(i["severity"] == "ERROR" and i["field"] == "total_claim_paid"
                   for i in row_issues)


def test_clean_fixture_has_no_errors():
    res = vd.validate("claims", _mapped_claims())
    assert res["counts"]["ERROR"] == 0
    assert res["quarantined_rows"] == 0


def test_paid_exceeds_claimed_is_error_and_quarantines():
    rows = [{"policy_number": "P1", "claim_number": "C1", "sum_insured": "500000",
             "total_amount_claimed": "100", "total_claim_paid": "999",
             "claim_status": "1", "__raw_row_index": 1}]
    res = vd.validate("claims", rows)
    assert res["counts"]["ERROR"] >= 1
    assert res["row_status"][1] == "quarantine"
    assert any(i["rule"] == "paid_exceeds_claimed" for i in res["issues"])


def test_missing_critical_field_quarantines():
    rows = [{"policy_number": "", "claim_number": "C2", "sum_insured": "500000",
             "total_claim_paid": "100", "claim_status": "1", "__raw_row_index": 2}]
    res = vd.validate("claims", rows)
    assert res["row_status"][2] == "quarantine"
    assert any(i["field"] == "policy_number" and i["severity"] == "ERROR"
               for i in res["issues"])


def test_unknown_claim_status_code_flagged():
    rows = [{"policy_number": "P1", "claim_number": "C3", "sum_insured": "500000",
             "total_claim_paid": "100", "total_amount_claimed": "200",
             "claim_status": "9", "__raw_row_index": 3}]
    res = vd.validate("claims", rows)
    assert any(i["rule"] == "unknown_code" and i["field"] == "claim_status"
               for i in res["issues"])


def test_important_field_missing_is_warning_not_quarantine():
    # member_reference_key is IMPORTANT (not critical) on claims -> WARNING
    rows = [{"policy_number": "P1", "claim_number": "C4", "sum_insured": "500000",
             "total_claim_paid": "100", "total_amount_claimed": "200",
             "member_reference_key": "", "claim_status": "1", "__raw_row_index": 4}]
    res = vd.validate("claims", rows)
    assert res["row_status"][4] == "warn"
    assert res["counts"]["WARNING"] >= 1
