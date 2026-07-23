"""Ask BenefitIQ — a DETERMINISTIC, governed advisory copilot (Sprint 26).

Principle: AI explains, governed engines calculate, evidence APIs prove, audit records. There is
NO LLM and NO external call anywhere in this package. A controlled intent registry (rule/keyword
matcher) routes a question to an APPROVED governed engine; the composer only TEMPLATES the answer
from the governed envelope's own values + caveats + confidence. It can never invent a number:
- a matched intent with governed data -> an evidence-grounded answer,
- a matched intent with no data -> a governed "Not available",
- an unmatched question or a blocked topic (medical/legal/PII/predict/ignore-DQ/external) ->
  a governed "unsupported" response that redirects to the nearest supported intents.

Answers are non-persisted; each /ask/query writes exactly one append-only AuditLog ASK event.
No new table, no migration, no new dependency."""
from __future__ import annotations

CONFIDENCE_FALLBACK = {"Analytics Ready": "high", "Conditional": "medium",
                       "Restricted": "low", "No Data": "none"}
