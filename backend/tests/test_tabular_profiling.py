from app.services import tabular, profiling
from tests._fixtures import read_bytes, CLAIMS, MEMBER


def test_parse_claims_headers_and_rows():
    parsed = tabular.parse_table(read_bytes(CLAIMS))
    assert len(parsed["headers"]) == 15
    assert parsed["total_rows"] == 4
    assert parsed["header_row_index"] == 0
    # lineage index points back at the immutable raw row
    assert parsed["rows"][0]["__raw_row_index"] == 1
    assert parsed["rows"][-1]["__raw_row_index"] == 4


def test_header_detection_skips_title_rows():
    data = b"BenefitIQ Export - Confidential\n\nName,Amount\nA,10\nB,20\n"
    parsed = tabular.parse_table(data)
    assert parsed["headers"] == ["Name", "Amount"]
    assert parsed["header_row_index"] == 1  # blank line dropped, title at 0


def test_delimiter_sniff_tab():
    parsed = tabular.parse_table(b"a\tb\tc\n1\t2\t3\n")
    assert parsed["delimiter"] == "\t"
    assert parsed["headers"] == ["a", "b", "c"]


def test_profile_detects_null_and_dtype():
    parsed = tabular.parse_table(read_bytes(CLAIMS))
    prof = profiling.profile_table(parsed)
    cols = {c["column"]: c for c in prof["columns"]}
    # paid column has one blank (outstanding claim) -> null_rate > 0
    assert cols["Num_Total_Claim_Paid"]["null_count"] == 1
    assert cols["Num_Total_Claim_Paid"]["inferred_dtype"] in ("num", "int")
    # claim number is unique
    assert cols["Txt_Claim_Number"]["is_unique"] is True
    # dates parse as date dtype
    assert cols["Date_of_Admission"]["inferred_dtype"] == "date"


def test_profile_member_gender_code():
    parsed = tabular.parse_table(read_bytes(MEMBER))
    prof = profiling.profile_table(parsed)
    cols = {c["column"]: c for c in prof["columns"]}
    assert cols["Txt_Gender"]["inferred_dtype"] in ("int", "str")
    assert prof["row_count"] == 4
