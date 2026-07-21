"""Governed Benefit Benchmarking engines (Sprint 15).

Benchmarks benefit DESIGN + policy terms & conditions ONLY, against a defined peer group.
It NEVER touches claims, ICR, utilization, ailment pressure, hospital usage or premium
adequacy — and never imports the claims/metrics/simulation services. Client values come
from confirmed BenefitTerm data; peer values are computed live from the internal broker
portfolio's confirmed terms. No benchmark is produced without a valid peer group, a
peer-group definition, source evidence and confidence. Backend-only; no frontend math.
"""
