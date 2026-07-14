"""Tabular ingest helpers: decode raw CSV/TSV bytes, detect the header row, and
expose rows as list-of-dicts. Pure, dependency-free (stdlib csv only) so it runs
in unit tests without pandas/Postgres. Never mutates the raw bytes it is given."""
from __future__ import annotations

import csv
import io
from collections import Counter
from typing import Optional


def _decode(data: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _sniff_delimiter(sample: str) -> str:
    try:
        return csv.Sniffer().sniff(sample, delimiters=",\t;|").delimiter
    except csv.Error:
        first = sample.splitlines()[0] if sample.splitlines() else ""
        return max(",\t;|", key=lambda d: first.count(d)) if first else ","


def _is_num(x: str) -> bool:
    try:
        float(x.replace(",", ""))
        return True
    except ValueError:
        return False


def _header_score(cells: list[str]) -> float:
    """Heuristic 0..1 that a row is a header: non-empty, mostly non-numeric, unique."""
    nonempty = [c for c in cells if c.strip() != ""]
    if not nonempty:
        return 0.0
    non_numeric = sum(1 for c in nonempty if not _is_num(c))
    unique = len({c.strip().lower() for c in nonempty})
    fill = len(nonempty) / len(cells)
    return (non_numeric / len(nonempty)) * 0.6 + (unique / len(nonempty)) * 0.2 + fill * 0.2


def detect_header_row(rows: list[list[str]], scan: int = 10) -> int:
    """Index of the most likely header row within the first `scan` rows. A header
    should match the table's dominant column width (skips title/preamble rows that
    have a different number of columns) and read like labels, not data."""
    if not rows:
        return 0
    modal_width = Counter(len(r) for r in rows).most_common(1)[0][0]
    best_idx, best_score = None, -1.0
    for i, r in enumerate(rows[:scan]):
        score = _header_score(r)
        if len(r) == modal_width:
            score += 1.0  # strong preference for rows matching the data width
        if score > best_score:
            best_idx, best_score = i, score
    return best_idx or 0


def parse_table(data: bytes, max_preview: Optional[int] = None) -> dict:
    """Decode + parse. Returns header list, data rows (list[dict]), raw_row_index
    (0-based index into the ORIGINAL non-blank file rows, so lineage/quarantine can
    point back at the immutable raw), delimiter and header row index."""
    text = _decode(data)
    if not text.strip():
        return {"headers": [], "rows": [], "delimiter": ",", "header_row_index": 0, "total_rows": 0}
    delim = _sniff_delimiter(text[:4096])
    all_rows = list(csv.reader(io.StringIO(text), delimiter=delim))
    all_rows = [r for r in all_rows if any(c.strip() for c in r)]  # drop fully-blank lines
    if not all_rows:
        return {"headers": [], "rows": [], "delimiter": delim, "header_row_index": 0, "total_rows": 0}
    h_idx = detect_header_row(all_rows)
    headers = [c.strip() for c in all_rows[h_idx]]
    body = all_rows[h_idx + 1:]
    rows: list[dict] = []
    for offset, r in enumerate(body):
        cells = (r + [""] * len(headers))[: len(headers)]
        record = {headers[i]: cells[i].strip() for i in range(len(headers))}
        record["__raw_row_index"] = h_idx + 1 + offset  # 0-based into non-blank file rows
        rows.append(record)
        if max_preview is not None and len(rows) >= max_preview:
            break
    return {
        "headers": headers,
        "rows": rows,
        "delimiter": delim,
        "header_row_index": h_idx,
        "total_rows": len(body),
    }
