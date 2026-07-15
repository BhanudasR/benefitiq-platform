import pytest
from app.core.security import Role
from app.services import onboarding_service as svc, canonical_loader, mapping as mp
from app.services.terms import service as terms
from app.services.terms.pdf_extract import detect_term_candidates
from app.services.simulation.base import SimContext
from app.services.simulation import room_rent, copay, caps
from app.models.governance import UploadBatch, TermsAudit
from app.models.canonical import BenefitTerm, PolicyVersion

POLICY_H = ("Txt_Policy_Number,Txt_Master_Policy_Number,Txt_Insurer_Code,Txt_TPA_Code,Section/Product,"
            "Txt_Type_of_Policy,Date_Policy_Start,Date_Policy_End,Total Premium,"
            "Num_Corporate_Floater_Sum_Insured,policy year")
POLICY = (POLICY_H + "\n"
          + "POL-1,MPOL-1,150,15001,GMC,3,01-Apr-2025,31-Mar-2026,1000000,5000000,2025\n"
          + "POL-1,MPOL-1,150,15001,GMC,3,01-Apr-2026,31-Mar-2027,1200000,5000000,2026\n").encode()

CLAIMS_H = ("Txt_Policy_Number,Txt_Claim_Number,Txt_Member_Reference_Key,Txt_Diagnosis_Code_Level_I,"
            "Txt_Name_of_the_Hospital,Date_of_Admission,Date_of_Discharge,Num_Sum_Insured,"
            "Num_Total_Amount_Claimed,Num_Total_Claim_Paid,Num_Outstanding_Amount,"
            "Num_Room_Charges_Claimed,Num_Nursing_Charges_claimed,Txt_Claim_Status")
CLAIMS = (CLAIMS_H + "\n"
          + "POL-1,CLM-1,MRK-1,I20,Apollo,10-Jun-2025,12-Jun-2025,500000,150000,100000,20000,40000,12000,1\n").encode()

TERMS_H = "policy_number,policy_year,term_type,value,unit,text_value,applies_to"
TERMS = (TERMS_H + "\n"
         + "POL-1,2025,room_rent,0.01,pct,,\n"
         + "POL-1,2025,copay,0.10,pct,,\n"
         + "POL-1,2025,disease_cap,500000,amount,,\n"
         + "POL-1,2025,exclusion,,,Cosmetic surgery excluded,\n"
         + "POL-1,2025,waiting_period,24,months,,\n"
         + "POL-1,2026,room_rent,0.02,pct,,\n").encode()

TERMS_CRIT = (TERMS_H + "\n"
              + "POL-1,2025,room_rent,0.01,pct,,\n"
              + ",2025,copay,0.10,pct,,\n").encode()   # 2nd row missing policy_number (critical) -> quarantine

PDF_TEXT = ("Room Rent limit is 1% of Sum Insured per day.\n"
            "Co-payment of 10% applies on all claims.\n"
            "Maternity is limited to Rs 50,000.\n"
            "Waiting period of 24 months for pre-existing diseases.\n"
            "Exclusion: cosmetic surgery is excluded.\n").encode()


def _seed(db, tenant, data, kind, override=False):
    b = svc.register_upload(db, tenant=tenant, actor="rev", file_kind=kind, file_name="f.csv", data=data)
    m = svc.materialize(db, db.get(UploadBatch, b.id))
    fm = {s["source_header"]: s["suggested_canonical"]
          for s in mp.suggest_mapping(m["parsed"]["headers"], m["table"])["suggestions"]
          if s["suggested_canonical"]}
    svc.set_mapping(db, tenant=tenant, actor="rev", batch_id=b.id, field_map=fm)
    svc.run_validation(db, tenant=tenant, actor="rev", batch_id=b.id)
    svc.run_dq(db, tenant=tenant, actor="rev", batch_id=b.id)
    if override:
        svc.admin_override(db, tenant=tenant, actor="admin", role=Role.ADMIN, batch_id=b.id, reason="pilot")
    else:
        svc.approve(db, tenant=tenant, actor="rev", role=Role.REVIEWER, batch_id=b.id)
        svc.activate(db, tenant=tenant, actor="rev", batch_id=b.id)
    canonical_loader.load_canonical(db, tenant=tenant, actor="rev", batch_id=b.id)
    return b


def _seed_terms(db, t, with_claims=True, terms_data=TERMS):
    _seed(db, t, POLICY, "policy")
    if with_claims:
        _seed(db, t, CLAIMS, "claims")
    _seed(db, t, terms_data, "terms")


def _pv_id(db, tenant, year):
    return db.query(PolicyVersion).filter(PolicyVersion.tenant_id == tenant,
                                          PolicyVersion.policy_year == year).first().id


def _ctx(db, t, **f):
    return SimContext(db, t, f)


# 1 structured load creates confirmed benefit_term with lineage ---------------
def test_structured_terms_loaded_confirmed_with_lineage(db):
    _seed_terms(db, "u6_1")
    rows = db.query(BenefitTerm).filter(BenefitTerm.tenant_id == "u6_1",
                                        BenefitTerm.status == "confirmed").all()
    assert len(rows) == 6 and all(r.method == "structured" for r in rows)
    rr = next(r for r in rows if r.term_type == "room_rent" and r.policy_year == 2025)
    assert rr.dataset_version_id and rr.upload_batch_id and rr.raw_file_id and rr.raw_row_index is not None


# 2 linked to correct policy_version -----------------------------------------
def test_terms_linked_to_policy_version(db):
    _seed_terms(db, "u6_2")
    rr = db.query(BenefitTerm).filter(BenefitTerm.tenant_id == "u6_2", BenefitTerm.term_type == "room_rent",
                                      BenefitTerm.policy_year == 2025).one()
    assert rr.policy_version_id == _pv_id(db, "u6_2", 2025) and rr.linkage_status == "resolved"


# 3 multi-year no cross-bleed ------------------------------------------------
def test_multi_year_terms_no_cross_bleed(db):
    _seed_terms(db, "u6_3", with_claims=False)
    y25 = terms.list_terms(db, "u6_3", policy_year=2025, term_type="room_rent")
    y26 = terms.list_terms(db, "u6_3", policy_year=2026, term_type="room_rent")
    assert y25[0]["value"] == 0.01 and y26[0]["value"] == 0.02


# 4,5,6,7 PDF candidates only ------------------------------------------------
def test_pdf_extraction_candidates_only(db):
    _seed(db, "u6_4", POLICY, "policy")
    pvid = _pv_id(db, "u6_4", 2025)
    b = svc.register_upload(db, tenant="u6_4", actor="rev", file_kind="terms_pdf",
                            file_name="wording.pdf", data=PDF_TEXT)
    out = terms.extract_pdf_candidates(db, tenant="u6_4", actor="rev", batch_id=b.id, policy_version_id=pvid)
    assert out["candidate_count"] >= 4
    for c in out["candidates"]:
        assert c["auto_applied"] is False
        assert c["source_page"] and c["source_snippet"] and c["confidence"] and c["method"] == "pdf_regex"
    # all stored as candidates, NOT confirmed
    assert db.query(BenefitTerm).filter(BenefitTerm.tenant_id == "u6_4",
                                        BenefitTerm.status == "candidate").count() >= 4
    assert db.query(BenefitTerm).filter(BenefitTerm.tenant_id == "u6_4",
                                        BenefitTerm.status == "confirmed").count() == 0
    # low-confidence (exclusion 0.5) requires review
    excl = next(c for c in out["candidates"] if c["term_type"] == "exclusion")
    assert excl["review_required"] is True


def test_pdf_detect_is_deterministic():
    c1 = detect_term_candidates([PDF_TEXT.decode()])
    types = {c["term_type"] for c in c1}
    assert {"room_rent", "copay", "maternity_limit", "waiting_period", "exclusion"} <= types
    rr = next(c for c in c1 if c["term_type"] == "room_rent")
    assert rr["value"] == 0.01 and rr["source_page"] == 1


# 8,9 confirm audit + reject reason ------------------------------------------
def test_confirm_and_reject_audit(db):
    _seed(db, "u6_5", POLICY, "policy")
    pvid = _pv_id(db, "u6_5", 2025)
    b = svc.register_upload(db, tenant="u6_5", actor="rev", file_kind="terms_pdf", file_name="w.pdf", data=PDF_TEXT)
    out = terms.extract_pdf_candidates(db, tenant="u6_5", actor="rev", batch_id=b.id, policy_version_id=pvid)
    rr = next(c for c in out["candidates"] if c["term_type"] == "room_rent")
    terms.confirm_term(db, tenant="u6_5", actor="alice", term_id=rr["term_id"])
    a = db.query(TermsAudit).filter(TermsAudit.benefit_term_id == rr["term_id"]).one()
    assert a.action == "confirm" and a.before_status == "candidate" and a.after_status == "confirmed"
    # reject needs a reason
    excl = next(c for c in out["candidates"] if c["term_type"] == "exclusion")
    with pytest.raises(ValueError):
        terms.reject_term(db, tenant="u6_5", actor="alice", term_id=excl["term_id"], reason="  ")
    r = terms.reject_term(db, tenant="u6_5", actor="alice", term_id=excl["term_id"], reason="not applicable")
    assert r["status"] == "rejected" and r["reason"] == "not applicable"


# 10 confirmed room-rent term used by simulation -----------------------------
def test_confirmed_room_rent_used_by_sim(db):
    _seed_terms(db, "u6_6")
    r = room_rent.room_rent_simulation(_ctx(db, "u6_6"))    # no request pct -> should use confirmed term 0.01
    assert r["value"]["proposed_room_rent_pct"] == 0.01
    assert r["value"]["term_basis"] == "confirmed_policy_term"
    assert r["value"]["portfolio_saving"] == 35000        # 40000 x 0.875


# 11 fallback when no term ----------------------------------------------------
def test_fallback_when_no_term(db):
    _seed(db, "u6_7", POLICY, "policy"); _seed(db, "u6_7", CLAIMS, "claims")   # no terms
    r = room_rent.room_rent_simulation(_ctx(db, "u6_7"))
    assert r["value"]["term_basis"] == "config_default"
    assert any("config default" in c.lower() for c in r["caveats"])


# 12 confirmed co-pay used ---------------------------------------------------
def test_confirmed_copay_used(db):
    _seed_terms(db, "u6_8")
    r = copay.copay_simulation(_ctx(db, "u6_8"))
    assert r["value"]["proposed_copay_pct"] == 0.10 and r["value"]["term_basis"] == "confirmed_policy_term"


# 13 confirmed disease cap used ----------------------------------------------
def test_confirmed_disease_cap_used(db):
    _seed_terms(db, "u6_9")
    r = caps.cap_simulation(_ctx(db, "u6_9"))               # no proposed_cap -> confirmed term 500000
    assert r["value"]["proposed_cap"] == 500000 and r["value"]["term_basis"] == "confirmed_policy_term"


# 14 exclusion / waiting period queryable ------------------------------------
def test_exclusion_waiting_queryable(db):
    _seed_terms(db, "u6_10", with_claims=False)
    excl = terms.list_terms(db, "u6_10", term_type="exclusion", status="confirmed")
    wait = terms.list_terms(db, "u6_10", term_type="waiting_period", status="confirmed")
    assert excl and excl[0]["value"] == "Cosmetic surgery excluded"
    assert wait and wait[0]["value"] == 24.0 and wait[0]["unit"] == "months"


# 15 restricted terms excluded from lookup -----------------------------------
def test_restricted_terms_excluded(db):
    _seed_terms(db, "u6_11", with_claims=False)
    pvid = _pv_id(db, "u6_11", 2025)
    assert terms.terms_lookup(db, "u6_11", [pvid], "room_rent") is not None   # usable before restriction
    # mark the term restricted (as a Restricted dataset would) -> excluded from advisory use
    rr = db.query(BenefitTerm).filter(BenefitTerm.tenant_id == "u6_11", BenefitTerm.term_type == "room_rent",
                                      BenefitTerm.policy_year == 2025).one()
    rr.restricted = True; db.commit()
    assert terms.terms_lookup(db, "u6_11", [pvid], "room_rent") is None       # restricted -> not usable


# 16 conditional caveat propagation ------------------------------------------
def test_conditional_terms_caveat(db):
    _seed_terms(db, "u6_12")
    # mark the confirmed term as carrying a data-quality caveat (Conditional dataset)
    rr = db.query(BenefitTerm).filter(BenefitTerm.tenant_id == "u6_12", BenefitTerm.term_type == "room_rent",
                                      BenefitTerm.policy_year == 2025).one()
    rr.data_quality_caveat = True; db.commit()
    r = room_rent.room_rent_simulation(_ctx(db, "u6_12"))
    assert r["value"]["term_basis"] == "confirmed_policy_term"
    assert any("conditional" in c.lower() for c in r["caveats"])


# 17 tenant isolation --------------------------------------------------------
def test_tenant_isolation(db):
    _seed_terms(db, "u6_13", with_claims=False)
    assert terms.list_terms(db, "other") == []
    pvid = _pv_id(db, "u6_13", 2025)
    assert terms.terms_lookup(db, "other", [pvid], "room_rent") is None


# 18 critical/quarantined term rows excluded ---------------------------------
def test_critical_term_rows_excluded(db):
    _seed(db, "u6_14", POLICY, "policy")
    _seed(db, "u6_14", TERMS_CRIT, "terms")
    # only the row with policy_number loads; the missing-policy copay row is quarantined
    rows = db.query(BenefitTerm).filter(BenefitTerm.tenant_id == "u6_14").all()
    assert len(rows) == 1 and rows[0].term_type == "room_rent"


# 19 evidence + reconciliation -----------------------------------------------
def test_term_evidence(db):
    _seed_terms(db, "u6_15", with_claims=False)
    t = terms.list_terms(db, "u6_15", term_type="room_rent", policy_year=2025)[0]
    ev = terms._term_dict(db.get(BenefitTerm, t["term_id"]))
    assert ev["method"] == "structured" and ev["status"] == "confirmed" and ev["value"] == 0.01


# 20 backward compatible: explicit request still works -----------------------
def test_backward_compatible_request_input(db):
    _seed(db, "u6_16", POLICY, "policy"); _seed(db, "u6_16", CLAIMS, "claims")   # no terms
    r = room_rent.room_rent_simulation(_ctx(db, "u6_16"), room_rent_pct=0.01)
    assert r["value"]["term_basis"] == "request_input" and r["value"]["portfolio_saving"] == 35000
