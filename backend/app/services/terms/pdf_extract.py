"""Deterministic PDF Stage-1 term extraction (Sprint 6).

NO AI / NO LLM. Extracts text (pypdf if available, else decode) and runs rules/regex
to produce term CANDIDATES only — each with source page, snippet, confidence and
method='pdf_regex'. Candidates are NEVER auto-applied: they must be human-confirmed
via the governed terms review workflow before any simulation may use them."""
from __future__ import annotations

import re


def extract_pages(data: bytes) -> list[str]:
    """Return page texts (1 page per element). Uses pypdf when the bytes are a real
    PDF; otherwise decodes as text and splits on form-feed as a page separator."""
    try:
        import pypdf, io
        reader = pypdf.PdfReader(io.BytesIO(data))
        return [(p.extract_text() or "") for p in reader.pages]
    except Exception:
        text = data.decode("utf-8", errors="replace")
        return text.split("\f") if "\f" in text else [text]


def _snippet(text, start, end, width=90):
    a = max(0, start - 15)
    b = min(len(text), end + 15)
    return re.sub(r"\s+", " ", text[a:b]).strip()[:width]


# (term_type, compiled pattern, value group, unit, base confidence)
_PCT_RULES = [
    ("room_rent", re.compile(r"room\s*rent[^.\n]{0,80}?(\d+(?:\.\d+)?)\s*%", re.I), 1),
    ("icu_rent", re.compile(r"\bicu\b[^.\n]{0,80}?(\d+(?:\.\d+)?)\s*%", re.I), 1),
    ("parent_copay", re.compile(r"parent[^.\n]{0,40}co-?pay[^.\n]{0,40}?(\d+(?:\.\d+)?)\s*%", re.I), 1),
    ("copay", re.compile(r"co-?pay(?:ment)?[^.\n]{0,80}?(\d+(?:\.\d+)?)\s*%", re.I), 1),
]
_AMT_RULES = [
    ("maternity_limit", re.compile(r"maternity[^.\n]{0,80}?(?:rs\.?|₹|inr)\s*([\d,]+)", re.I), 1),
    ("disease_cap", re.compile(r"(?:cataract|knee|hernia|procedure)[^.\n]{0,80}?(?:rs\.?|₹|inr)\s*([\d,]+)", re.I), 1),
]
_WAIT_RULE = ("waiting_period", re.compile(r"waiting\s*period[^.\n]{0,60}?(\d+)\s*(month|year|day)s?", re.I))
_TEXT_RULES = [
    ("exclusion", re.compile(r"(exclusion[s]?[^\n]{0,140})", re.I)),
    ("non_payable", re.compile(r"(non[- ]?payable[^\n]{0,140})", re.I)),
]


def detect_term_candidates(pages: list[str]) -> list[dict]:
    out = []
    for pi, text in enumerate(pages, start=1):
        for ttype, pat, g in _PCT_RULES:
            for m in pat.finditer(text):
                out.append({"term_type": ttype, "value": round(float(m.group(g)) / 100.0, 4),
                            "unit": "pct", "text_value": None, "confidence": 0.8,
                            "method": "pdf_regex", "source_page": pi,
                            "source_snippet": _snippet(text, m.start(), m.end())})
        for ttype, pat, g in _AMT_RULES:
            for m in pat.finditer(text):
                out.append({"term_type": ttype, "value": float(m.group(g).replace(",", "")),
                            "unit": "amount", "text_value": None, "confidence": 0.8,
                            "method": "pdf_regex", "source_page": pi,
                            "source_snippet": _snippet(text, m.start(), m.end())})
        for m in _WAIT_RULE[1].finditer(text):
            out.append({"term_type": "waiting_period", "value": float(m.group(1)),
                        "unit": m.group(2).lower() + "s", "text_value": None, "confidence": 0.7,
                        "method": "pdf_regex", "source_page": pi,
                        "source_snippet": _snippet(text, m.start(), m.end())})
        for ttype, pat in _TEXT_RULES:
            for m in pat.finditer(text):
                out.append({"term_type": ttype, "value": None, "unit": "text",
                            "text_value": m.group(1).strip(), "confidence": 0.5,
                            "method": "pdf_regex", "source_page": pi,
                            "source_snippet": _snippet(text, m.start(), m.end())})
    # de-dupe identical (type, value, page)
    seen, uniq = set(), []
    for c in out:
        k = (c["term_type"], c["value"], c["text_value"], c["source_page"])
        if k not in seen:
            seen.add(k); uniq.append(c)
    return uniq
