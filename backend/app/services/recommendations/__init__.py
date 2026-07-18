"""Governed recommendation engines (Sprint 10).

Backend-only decision-support that composes EXISTING governed outputs (metric,
simulation and terms services) into an explainable renewal stance, a placement-trigger
decision and broker next-best-actions. No raw-data access, no frontend math, no AI,
no hard-coded demo recommendations. Thresholds are governed via RecommendationConfig;
rules are centralised and each carries its own explanation + evidence reference.
Operational ICR is always read unchanged; Adjusted / Defendable ICR never replaces it.
"""
