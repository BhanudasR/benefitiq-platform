"""Column profiling: for each source column, infer an observed dtype, null rate,
distinct count, sample values and simple anomalies. Feeds the mapping engine
(suggestions), the validation engine (type checks) and the DQ score. Pure/stdlib."""
from __future__ import annotations

import re
from datetime import datetime

_DATE_FORMATS = ("%d-%b-%Y", "%d-%b-%y", "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y")
_NUM_RE = re.compile(r"^-?\d{1,3}(,\d{2,3})*(\.\d+)?$|^-?\d+(\.\d+)?$")


def is_blank(v) -> bool:
    return v is None or str(v).strip() == ""


def parse_number(v):
    if is_blank(v):
        return None
    try:
        return float(str(v).replace(",", "").strip())
    except ValueError:
        return None


def parse_date(v):
    if is_blank(v):
        return None
    s = str(v).strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def _infer_dtype(values: list[str]) -> str:
    vals = [v for v in values if not is_blank(v)]
    if not vals:
        return "empty"
    n = len(vals)
    num = sum(1 for v in vals if parse_number(v) is not None)
    dat = sum(1 for v in vals if parse_date(v) is not None)
    if dat / n >= 0.8:
        return "date"
    if num / n >= 0.8:
        # integer vs decimal
        as_num = [parse_number(v) for v in vals if parse_number(v) is not None]
        if all(float(x).is_integer() for x in as_num):
            return "int"
        return "num"
    lowered = {str(v).strip().lower() for v in vals}
    if lowered <= {"y", "n", "yes", "no", "true", "false", "1", "0"} and len(lowered) <= 4:
        return "bool"
    return "str"


def profile_column(name: str, values: list[str]) -> dict:
    n = len(values)
    nulls = sum(1 for v in values if is_blank(v))
    nonnull = [v for v in values if not is_blank(v)]
    distinct = len({str(v).strip() for v in nonnull})
    dtype = _infer_dtype(values)
    samples = []
    for v in nonnull:
        if v not in samples:
            samples.append(v)
        if len(samples) >= 5:
            break
    prof = {
        "column": name,
        "inferred_dtype": dtype,
        "count": n,
        "null_count": nulls,
        "null_rate": round(nulls / n, 4) if n else 0.0,
        "distinct_count": distinct,
        "is_constant": distinct <= 1 and nonnull != [],
        "is_unique": distinct == len(nonnull) and nonnull != [],
        "samples": samples,
    }
    if dtype in ("int", "num"):
        nums = [parse_number(v) for v in nonnull if parse_number(v) is not None]
        if nums:
            prof["min"] = min(nums)
            prof["max"] = max(nums)
            prof["negatives"] = sum(1 for x in nums if x < 0)
    return prof


def profile_table(parsed: dict) -> dict:
    """parsed = output of tabular.parse_table. Returns a table-level profile plus a
    small preview (first rows) suitable for a review screen."""
    headers = parsed["headers"]
    rows = parsed["rows"]
    columns = []
    for h in headers:
        values = [r.get(h, "") for r in rows]
        columns.append(profile_column(h, values))
    preview = []
    for r in rows[:10]:
        preview.append({h: r.get(h, "") for h in headers})
    return {
        "row_count": parsed.get("total_rows", len(rows)),
        "column_count": len(headers),
        "header_row_index": parsed.get("header_row_index", 0),
        "delimiter": parsed.get("delimiter", ","),
        "columns": columns,
        "preview": preview,
    }
