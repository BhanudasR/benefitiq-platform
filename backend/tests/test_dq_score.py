from app.services import tabular, mapping as mp, validation as vd, dq_score
from app.services.dq_score import WEIGHTS
from tests._fixtures import read_bytes, CLAIMS


def _pipeline(data: bytes, table="claims", lineage=None):
    parsed = tabular.parse_table(data)
    sug = mp.suggest_mapping(parsed["headers"], table)
    fm = {s["source_header"]: s["suggested_canonical"]
          for s in sug["suggestions"] if s["suggested_canonical"]}
    mapped = mp.remap_rows(parsed["rows"], fm)
    val = vd.validate(table, mapped)
    dq = dq_score.compute_dq(table, mapped, sug, val,
                             lineage or {"sha256": "x" * 64, "version_no": 1})
    return dq, mapped, sug, val


def test_weights_sum_to_one():
    assert abs(sum(WEIGHTS.values()) - 1.0) < 1e-9


def test_overall_reconciles_to_components():
    dq, *_ = _pipeline(read_bytes(CLAIMS))
    total = round(sum(c["weighted_points"] for c in dq["components"]), 2)
    assert abs(total - dq["overall_score"]) < 0.01
    assert dq["reconciles"] is True
    assert len(dq["components"]) == 8


def test_masked_claims_is_analytics_ready_but_dinged_for_missing_paid():
    dq, *_ = _pipeline(read_bytes(CLAIMS))
    assert dq["readiness"] == "Analytics Ready"
    assert dq["overall_score"] >= 85
    comp = {c["name"]: c for c in dq["components"]}
    # one missing mandatory cell (outstanding claim's paid) -> < full marks
    assert comp["mandatory_completeness"]["fraction"] < 1.0
    assert dq["top_gaps"][0]["component"] == "mandatory_completeness"


def test_bad_data_is_not_reliable():
    bad = (b"Txt_Policy_Number,Txt_Claim_Number,Txt_Member_Reference_Key,Num_Sum_Insured,"
           b"Num_Total_Amount_Claimed,Num_Total_Claim_Paid,Txt_Claim_Status\n"
           b",,,,,999,9\n"          # missing criticals, unknown status
           b",C2,,500000,100,999,1\n")  # paid>claimed, missing policy+member
    dq, _, _, val = _pipeline(bad)
    assert dq["readiness"] == "Not Reliable"
    assert dq["overall_score"] < 70
    assert val["quarantined_rows"] >= 1


def test_missing_hash_lowers_source_integrity():
    dq, *_ = _pipeline(read_bytes(CLAIMS), lineage={"version_no": 1})  # no sha256
    comp = {c["name"]: c for c in dq["components"]}
    assert comp["source_version_integrity"]["fraction"] < 1.0
