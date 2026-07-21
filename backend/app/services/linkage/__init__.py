"""Sprint 17 — Benchmark Gap → Renewal / Savings Sandbox linkage (one-way, governed).

This package is the ONLY seam allowed to touch BOTH benchmarking (upstream, read) and
simulation (downstream). The benchmarking classification package stays claims-free and never
imports simulation; here the flow is strictly one-way — a benchmark gap is snapshot and, when
a governed lever exists, sent downstream for impact simulation. Simulation output (ICR, etc.)
never flows back into benchmarking classification.
"""
