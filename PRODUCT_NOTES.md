# BenefitIQ — Product Notes (durable principles)

## Production UI/UX principle (standing)
> **Production BenefitIQ must preserve the approved demo's premium CXO/broker dashboard experience,
> module coverage and decision-first storytelling, while replacing all mock/demo logic with governed
> API-driven production data.**

Backend creates trust; frontend creates adoption — both must be world-class. The production UI must
NOT be downgraded to a basic admin panel, plain-table app, developer console, or internal MIS page.

**The demo (`BenefitIQ_Demo.html`) is the UX reference** for: navigation structure, dashboard tab
layout, premium enterprise look-and-feel, clean KPI cards, visual hierarchy, explainability
icons/panels, source-evidence chips, decision-first summaries, Renewal Intelligence interaction
style, Data Onboarding flow, Ask BenefitIQ chat experience (later), client-ready storytelling, light
premium business UI, and broker/CXO-friendly language.

### All 22 demo tabs preserved in the production roadmap
Broker Portfolio · Client Portfolio · Executive Summary · Data Onboarding · Source Evidence / Data
Quality · Demographics · Claims · Ailment · Settlement · Maternity · Employee & Family · SI
Utilization · Hospital · Rejection · Benefits & Benchmarking · Renewal Intelligence · Benefit &
Savings Sandbox · Balanced Benefit Design · Placement Intelligence · Wellness Intelligence · Ask
BenefitIQ · PPT / Client Pack / Export.

### Improvement allowed
Spacing / responsiveness / accessibility (WCAG 2.1 AA), chart clarity, explainability panels,
source-evidence visibility, loading & empty states, review workflows, error handling, mobile/tablet
responsiveness, and consistency of colours / typography / components.

### No compromise
Do not remove approved modules; do not simplify into a generic dashboard; do not replace visual
storytelling with raw tables; do not remove explainability, source evidence, or decision/action
summaries from strategic modules; do not remove Renewal Intelligence / Savings Sandbox / Balanced
Benefit Design; do not drop Ask BenefitIQ from the roadmap; do not make it look like an internal MIS
page.

### Sequencing
Backend-first for now. Do **not** start UI dashboards until the metric/simulation APIs are stable.
When frontend work starts, it must recreate the demo-level UX on production APIs — API-driven,
governed data only, no hard-coded demo values, no frontend KPI math, no fake analytics.
