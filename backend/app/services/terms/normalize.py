"""Governed term-type vocabulary + value normalisation for policy benefit terms."""
from __future__ import annotations
import re

TERM_TYPES = {"room_rent", "icu_rent", "copay", "parent_copay", "disease_cap",
              "maternity_limit", "newborn_cover", "corporate_buffer", "exclusion",
              "waiting_period", "non_payable", "daycare", "endorsement"}

_ALIASES = {
    "room rent": "room_rent", "roomrent": "room_rent", "room": "room_rent",
    "icu": "icu_rent", "icu rent": "icu_rent",
    "co-pay": "copay", "co pay": "copay", "copayment": "copay",
    "parent co-pay": "parent_copay", "parent copay": "parent_copay", "parental copay": "parent_copay",
    "disease cap": "disease_cap", "procedure cap": "disease_cap", "cap": "disease_cap",
    "maternity": "maternity_limit", "maternity limit": "maternity_limit",
    "newborn": "newborn_cover", "new born": "newborn_cover",
    "corporate buffer": "corporate_buffer", "buffer": "corporate_buffer", "corporate floater": "corporate_buffer",
    "exclusion": "exclusion", "excluded": "exclusion",
    "waiting period": "waiting_period",
    "non-payable": "non_payable", "non payable": "non_payable", "nonpayable": "non_payable",
    "daycare": "daycare", "day care": "daycare", "modern treatment": "daycare",
    "endorsement": "endorsement",
}


def normalize_term_type(v: str):
    if v is None:
        return None
    s = re.sub(r"[^a-z0-9 ]+", " ", str(v).strip().lower()).strip()
    s = re.sub(r"\s+", " ", s)
    if s.replace(" ", "_") in TERM_TYPES:
        return s.replace(" ", "_")
    return _ALIASES.get(s)
