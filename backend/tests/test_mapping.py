from app.services import tabular, mapping as mp
from tests._fixtures import read_bytes, CLAIMS, MEMBER


def _headers(name):
    return tabular.parse_table(read_bytes(name))["headers"]


def test_exact_synonym_mapping_claims():
    res = mp.suggest_mapping(_headers(CLAIMS), "claims")
    by_src = {s["source_header"]: s for s in res["suggestions"]}
    assert by_src["Num_Total_Claim_Paid"]["suggested_canonical"] == "total_claim_paid"
    assert by_src["Num_Total_Claim_Paid"]["method"] == "exact"
    assert by_src["Txt_Claim_Status"]["suggested_canonical"] == "claim_status"
    # all mandatory claim fields mapped -> no unmapped mandatory, high confidence
    assert res["unmapped_mandatory"] == []
    assert res["overall_confidence"] >= 0.99


def test_fuzzy_mapping_when_header_differs():
    res = mp.suggest_mapping(["Policy No", "Claim ID", "Paid Amount", "Claim Status",
                              "Sum Insured"], "claims")
    by_src = {s["source_header"]: s for s in res["suggestions"]}
    assert by_src["Paid Amount"]["suggested_canonical"] == "total_claim_paid"
    assert by_src["Claim ID"]["suggested_canonical"] == "claim_number"
    # these are synonyms -> exact; confidence 1.0
    assert by_src["Paid Amount"]["confidence"] == 1.0


def test_unmapped_mandatory_flagged():
    res = mp.suggest_mapping(["Something", "Random Column"], "claims")
    assert res["needs_review"] is True
    assert "policy_number" in res["unmapped_mandatory"]


def test_confirm_rejects_unknown_and_reports_missing():
    hdrs = ["Policy No", "Paid Amount"]
    res = mp.confirm_mapping(hdrs, "claims",
                             {"Policy No": "policy_number", "Paid Amount": "not_a_field"})
    assert "not_a_field" in res["unknown_targets"]
    assert res["confirmed"] is False
    assert "claim_number" in res["missing_mandatory"]


def test_profile_signature_stable_and_reuse():
    h1 = ["Policy No", "Claim ID", "Paid"]
    h2 = ["Claim ID", "Paid", "Policy No"]  # reordered -> same signature
    assert mp.layout_signature(h1) == mp.layout_signature(h2)
    field_map = {"Policy No": "policy_number", "Claim ID": "claim_number"}
    applied = mp.apply_profile(field_map, ["Policy No", "Claim ID", "Extra"])
    assert applied["reused"] == 2
    assert "Extra" in applied["new_unmapped"]


def test_remap_rows_preserves_lineage():
    parsed = tabular.parse_table(read_bytes(CLAIMS))
    sug = mp.suggest_mapping(parsed["headers"], "claims")
    fm = {s["source_header"]: s["suggested_canonical"]
          for s in sug["suggestions"] if s["suggested_canonical"]}
    mapped = mp.remap_rows(parsed["rows"], fm)
    assert mapped[0]["__raw_row_index"] == 1
    assert mapped[0]["total_claim_paid"] == "220000"
