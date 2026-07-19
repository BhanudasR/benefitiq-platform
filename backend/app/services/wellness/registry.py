"""Governed, DETERMINISTIC diagnosis -> wellness-category registry (Sprint 12).

Maps a claim's `diagnosis_code_l1` to a wellness category using (1) ICD-10 chapter/prefix
rules and (2) keyword fallback (for datasets where the field carries a description rather
than a clean code). No AI, no free-text LLM classification — every rule is explicit and
documented, so a mapping is auditable and reproducible. Interventions are cohort-level
wellness PROGRAMS, never clinical or diagnostic advice. Unmapped codes fall to 'other'
and are surfaced with a caveat (never silently misclassified)."""
from __future__ import annotations

import re

# an ICD-10 code looks like a letter followed by a digit (e.g. E11, I20, C50). Descriptive
# free-text ("Chest pain") must NOT trigger the chapter rule — it falls to keyword matching.
_ICD_PATTERN = re.compile(r"^[A-Z]\d")

# category_id -> governed metadata. `preventable` = lifestyle-influenceable (framing only,
# not a clinical claim). `careful` categories require sensitive, non-diagnostic wording.
CATEGORIES: dict[str, dict] = {
    "metabolic": {
        "label": "Metabolic health (diabetes / endocrine)",
        "intervention": "Metabolic health program: diabetes-risk screening camps, nutrition and lifestyle coaching, HbA1c awareness drives.",
        "preventable": True, "careful": False,
    },
    "cardiovascular": {
        "label": "Cardiovascular health (hypertension / cardiac)",
        "intervention": "Cardiovascular wellness: blood-pressure and cholesterol screening camps, heart-health awareness, activity challenges.",
        "preventable": True, "careful": False,
    },
    "maternity": {
        "label": "Maternity support",
        "intervention": "Maternity support: prenatal wellness guidance, maternity-benefit navigation, and new-parent support resources.",
        "preventable": False, "careful": False,
    },
    "musculoskeletal": {
        "label": "Musculoskeletal (ergonomics / physiotherapy)",
        "intervention": "Ergonomics and physiotherapy: workstation ergonomics assessments, posture and stretching programs, physiotherapy tie-ups.",
        "preventable": True, "careful": False,
    },
    "mental_wellbeing": {
        "label": "Mental wellbeing",
        "intervention": "Mental wellbeing: confidential EAP counselling, stress-management workshops, and manager sensitisation (cohort-level, confidential).",
        "preventable": True, "careful": True,
    },
    "respiratory": {
        "label": "Respiratory health",
        "intervention": "Respiratory wellness: air-quality awareness, smoking-cessation support, and seasonal-illness prevention drives.",
        "preventable": True, "careful": False,
    },
    "oncology": {
        "label": "Oncology awareness & screening",
        "intervention": "Oncology awareness and screening support: voluntary preventive-screening camps and awareness sessions (awareness only, no diagnosis advice).",
        "preventable": False, "careful": True,
    },
    "other": {
        "label": "Other / unmapped",
        "intervention": "No specific wellness program mapped; review these claims before defining an intervention.",
        "preventable": False, "careful": False,
    },
}

# ICD-10 first-letter chapter rules (governed, standard chapters).
_CHAPTER = {
    "E": "metabolic",        # E00-E90 endocrine, nutritional, metabolic
    "I": "cardiovascular",   # I00-I99 circulatory
    "O": "maternity",        # O00-O99 pregnancy/childbirth
    "M": "musculoskeletal",  # M00-M99 musculoskeletal
    "F": "mental_wellbeing", # F00-F99 mental & behavioural
    "J": "respiratory",      # J00-J99 respiratory
    "C": "oncology",         # C00-C97 malignant neoplasms
}

# keyword fallback (when the field is descriptive text, not a clean ICD code)
_KEYWORDS = [
    ("maternity", ("matern", "pregnan", "delivery", "cesarean", "caesarean", "obstetric", "antenatal")),
    ("metabolic", ("diabet", "endocrin", "thyroid", "obesit", "metabolic")),
    ("cardiovascular", ("hypertens", "cardiac", "coronary", "angina", "infarction", "cardio")),
    ("musculoskeletal", ("arthr", "spine", "back pain", "joint", "muscul", "ortho", "physio")),
    ("mental_wellbeing", ("depress", "anxiety", "stress", "mental", "psych", "wellbeing")),
    ("respiratory", ("asthma", "respirat", "copd", "pneumon", "bronch")),
    ("oncology", ("cancer", "carcinom", "tumor", "tumour", "neoplasm", "oncolog", "malignan")),
]

# maternity Z-codes (supervision of pregnancy / postpartum) handled explicitly
_MATERNITY_Z = ("Z34", "Z3A", "Z39")


def classify(diagnosis_code_l1) -> str:
    """Return a wellness category_id for a diagnosis code. Deterministic; 'other' when
    no governed rule matches."""
    if diagnosis_code_l1 is None:
        return "other"
    raw = str(diagnosis_code_l1).strip()
    if not raw:
        return "other"
    up = raw.upper()
    for z in _MATERNITY_Z:
        if up.startswith(z):
            return "maternity"
    # ICD chapter rule ONLY for actual codes (letter+digit), never free-text descriptions
    if _ICD_PATTERN.match(up) and up[0] in _CHAPTER:
        return _CHAPTER[up[0]]
    low = raw.lower()
    for cat, kws in _KEYWORDS:
        if any(k in low for k in kws):
            return cat
    return "other"


def meta(category_id: str) -> dict:
    return CATEGORIES.get(category_id, CATEGORIES["other"])
