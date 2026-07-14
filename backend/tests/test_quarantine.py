from app.services import validation as vd, quarantine


def test_review_queue_splits_rows_not_file():
    rows = [
        {"policy_number": "P1", "claim_number": "C1", "sum_insured": "500000",
         "total_amount_claimed": "200", "total_claim_paid": "100",
         "member_reference_key": "M1", "claim_status": "1", "__raw_row_index": 1},   # clean
        {"policy_number": "", "claim_number": "C2", "sum_insured": "500000",
         "total_claim_paid": "100", "claim_status": "1", "__raw_row_index": 2},        # error -> quarantine
        {"policy_number": "P1", "claim_number": "C3", "sum_insured": "500000",
         "total_amount_claimed": "200", "total_claim_paid": "100",
         "member_reference_key": "", "claim_status": "1", "__raw_row_index": 3},       # warn
    ]
    val = vd.validate("claims", rows)
    q = quarantine.build_review_queue(val, rows)
    assert q["total_rows"] == 3
    assert q["quarantined_count"] == 1
    assert q["analytics_eligible_count"] == 2      # clean + warn stay in analytics
    # quarantined row carries its issues + a proposed action + the row payload
    entry = q["quarantine"][0]
    assert entry["raw_row_index"] == 2
    assert entry["proposed_action"]
    assert entry["issues"]
    assert "claim_number" in entry["row"]
    assert "__raw_row_index" not in entry["row"]


def test_empty_when_all_clean():
    rows = [{"policy_number": "P1", "claim_number": "C1", "sum_insured": "500000",
             "total_amount_claimed": "200", "total_claim_paid": "100",
             "member_reference_key": "M1", "claim_status": "1", "__raw_row_index": 1}]
    q = quarantine.build_review_queue(vd.validate("claims", rows), rows)
    assert q["quarantined_count"] == 0
    assert q["analytics_eligible_count"] == 1
