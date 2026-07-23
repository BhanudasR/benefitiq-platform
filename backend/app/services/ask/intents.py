"""Controlled intent registry — the ONE source of truth for what Ask BenefitIQ can answer.

Each intent binds a governed category to (a) trigger keywords for the deterministic matcher,
(b) the governed engine label it routes to (the callable lives in router.py), (c) its scope
(client vs portfolio) and whether a client_id is required. BLOCKED_TOPICS are refused deterministically
BEFORE any routing so the copilot never gives medical/legal advice, exposes PII, predicts without
evidence, ignores data quality, fabricates, or reaches outside governed sources."""
from __future__ import annotations

# id, category, title, examples, triggers (lowercase substrings), engine label, scope, needs_client_id
INTENT_REGISTRY = [
    {"id": "portfolio_summary", "category": "Portfolio", "title": "Portfolio summary / high-risk clients",
     "examples": ["Which clients are high risk?", "Give me a portfolio summary"],
     "triggers": ["portfolio", "book", "all clients", "which clients", "high risk", "across clients", "high-risk"],
     "engine": "portfolio.broker_overview", "scope": "portfolio", "needs_client_id": False},
    {"id": "client_health", "category": "Client", "title": "Client health / 360",
     "examples": ["How is this client doing?", "Client 360 summary"],
     "triggers": ["client health", "how is this client", "client 360", "client overview", "health of the client"],
     "engine": "portfolio.client_overview", "scope": "client", "needs_client_id": True},
    {"id": "icr_explanation", "category": "Claims", "title": "ICR explanation",
     "examples": ["Why is this client's ICR high?", "Explain the loss ratio"],
     "triggers": ["icr", "loss ratio", "claims ratio", "incurred ratio", "why is icr", "icr high"],
     "engine": "metrics.icr", "scope": "client", "needs_client_id": True},
    {"id": "claims_drivers", "category": "Claims", "title": "Claims drivers",
     "examples": ["What are the top claim drivers?", "What is driving claims?"],
     "triggers": ["claim driver", "top claim", "driving claims", "cost driver", "biggest claim", "claims driving"],
     "engine": "metrics.claims", "scope": "client", "needs_client_id": True},
    {"id": "ailment_drivers", "category": "Claims", "title": "Ailment drivers",
     "examples": ["Which ailments drive cost?", "Top diagnosis groups"],
     "triggers": ["ailment", "disease", "diagnosis", "condition driving", "top ailment"],
     "engine": "metrics.ailment", "scope": "client", "needs_client_id": True},
    {"id": "hospital_drivers", "category": "Claims", "title": "Hospital drivers",
     "examples": ["Which hospitals drive cost?", "Top providers"],
     "triggers": ["hospital", "provider", "network cost", "top hospital"],
     "engine": "metrics.hospital", "scope": "client", "needs_client_id": True},
    {"id": "renewal_recommendation", "category": "Renewal", "title": "Renewal recommendation",
     "examples": ["What is the renewal stance?", "Should we renew this client?"],
     "triggers": ["renewal", "renew", "renewal stance", "renewal strategy"],
     "engine": "recommendations.renewal", "scope": "client", "needs_client_id": True},
    {"id": "benchmark_gaps", "category": "Benchmarking", "title": "Benefit / benchmark gaps",
     "examples": ["What benchmark gaps should we discuss?", "Which benefits need review?"],
     "triggers": ["benchmark", "gap", "peer", "benefit gap", "design gap", "benefits need review", "need review"],
     "engine": "benchmarking.overview", "scope": "client", "needs_client_id": True},
    {"id": "savings_sandbox", "category": "Renewal", "title": "Savings levers",
     "examples": ["What savings levers are available?", "How can we reduce cost?"],
     "triggers": ["saving", "lever", "reduce cost", "sandbox", "cost saving", "adjusted icr"],
     "engine": "simulation.adjusted_icr", "scope": "client", "needs_client_id": True},
    {"id": "placement_recommendation", "category": "Placement", "title": "Placement recommendation",
     "examples": ["Should this client be defended, negotiated, redesigned or marketed?"],
     "triggers": ["placement", "go to market", "defend", "negotiate", "rfq", "incumbent", "market the"],
     "engine": "placement.overview", "scope": "client", "needs_client_id": True},
    {"id": "wellness_opportunity", "category": "Wellness", "title": "Wellness opportunity",
     "examples": ["What wellness opportunities exist?"],
     "triggers": ["wellness", "prevention", "health program", "wellness opportunity"],
     "engine": "wellness.overview", "scope": "client", "needs_client_id": True},
    {"id": "data_quality_trust", "category": "Trust", "title": "Data quality / can I trust this?",
     "examples": ["Can I trust this dashboard?", "Which data issues affect this recommendation?"],
     "triggers": ["trust", "data quality", "can i trust", "reliable", "data issue", "which data issues", " dq"],
     "engine": "evidence.dq_overview", "scope": "either", "needs_client_id": False},
    {"id": "export_readiness", "category": "Export", "title": "Client pack / export readiness",
     "examples": ["Is the client pack ready to send?", "Export readiness"],
     "triggers": ["export", "client pack", "board pack", "ready to send", "pack ready", "presentation ready"],
     "engine": "exports.pack_sections", "scope": "client", "needs_client_id": True},
    {"id": "next_best_action", "category": "Action", "title": "Next best action",
     "examples": ["What should the broker do next?", "Next best action"],
     "triggers": ["next best action", "what should i do", "what next", "recommended action",
                  "what should the broker do", "nba", "what to do next"],
     "engine": "recommendations.nba", "scope": "client", "needs_client_id": True},
]

_BY_ID = {i["id"]: i for i in INTENT_REGISTRY}


def get_intent(intent_id):
    return _BY_ID.get(intent_id)


# Blocked topics -> deterministic governed refusal (checked BEFORE routing).
BLOCKED_TOPICS = [
    {"reason": "medical_advice",
     "patterns": ["medical history", "medical advice", "diagnose me", "what treatment", "prescribe",
                  "should i take", "is this cancer", "health condition of"]},
    {"reason": "legal_advice",
     "patterns": ["legal advice", "is it legal", "lawsuit", "should i sue", "sue them"]},
    {"reason": "member_pii",
     "patterns": ["member's medical", "member medical history", "employee name", "patient name",
                  "who is the member", "name of the patient", "individual member", "list members", "member's name"]},
    {"reason": "prediction_without_evidence",
     "patterns": ["predict exact", "exact future premium", "guarantee", "guaranteed", "will premium be",
                  "forecast exact", "predict the future"]},
    {"reason": "ignore_data_quality",
     "patterns": ["ignore data quality", "ignore dq", "regardless of data", "recommend anyway",
                  "even if data is missing", "without evidence"]},
    {"reason": "fabricate",
     "patterns": ["make up", "just guess", "invent a number", "fabricate", "assume a number", "make something up"]},
    {"reason": "external_knowledge",
     "patterns": ["search the web", "latest news", "google", "from the internet", "outside benefitiq",
                  "external source", "use web"]},
]

BLOCKED_MESSAGE = {
    "medical_advice": "Ask BenefitIQ does not provide medical advice or interpret an individual's health.",
    "legal_advice": "Ask BenefitIQ does not provide legal advice.",
    "member_pii": "Ask BenefitIQ answers only from aggregate governed data and never exposes individual member information.",
    "prediction_without_evidence": "Ask BenefitIQ will not predict or guarantee figures without governed evidence.",
    "ignore_data_quality": "Ask BenefitIQ will not bypass data-quality governance; caveats and restrictions always apply.",
    "fabricate": "Ask BenefitIQ never fabricates numbers; if governed data is missing it says Not available.",
    "external_knowledge": "Ask BenefitIQ answers only from governed BenefitIQ data, not external or web sources.",
}
