"""Portfolio Command Center (Sprint 23) — read-only COMPOSITION layer.

Broker Portfolio (book rollup) and Client Portfolio (client-360) are composed from the
existing governed engines (metrics portfolio/icr/claims, benchmarking, placement, wellness,
recommendations) — never recomputed. Risk bands reuse RecommendationConfig ICR thresholds;
renewal windows are the governed 30/60/90-day buckets from policy_end_date. No new decision
logic, no fabricated rollups, no migration.
"""
