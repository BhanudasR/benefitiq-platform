import csv, pathlib

FIX = pathlib.Path(__file__).resolve().parents[2] / "fixtures"


def _rows(name):
    with open(FIX / name, newline="") as f:
        return list(csv.DictReader(f))


def test_fixtures_exist_and_parse():
    for n in ("policy_sample_masked.csv", "member_sample_masked.csv", "claims_sample_masked.csv"):
        rows = _rows(n)
        assert len(rows) >= 2


def test_claims_headers_present():
    rows = _rows("claims_sample_masked.csv")
    for col in ("Txt_Claim_Number", "Num_Total_Claim_Paid", "Num_Room_Charges_Claimed", "Txt_Claim_Status"):
        assert col in rows[0]


def test_missing_critical_row_exists_for_dq():
    # Row deliberately missing paid amount, to exercise DQ/quarantine next sprint
    rows = _rows("claims_sample_masked.csv")
    assert any(r["Num_Total_Claim_Paid"].strip() == "" for r in rows)
