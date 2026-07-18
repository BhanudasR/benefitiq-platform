# BenefitIQ — Product Notes (durable principles)

## Gold Standard engineering principle (standing — applies to every sprint)
> **BenefitIQ must be developed as a Gold Standard enterprise SaaS product. The codebase, UI,
> architecture, tests, governance, security and product experience must never look like vibe-coded
> output. Every feature must be production-disciplined, explainable, maintainable, API-driven and
> aligned with the approved demo experience.**

BenefitIQ is a world-class enterprise SaaS product for Employee Benefits / GMC brokers, insurers and
CXO-level users. Every sprint must move it closer to production, not just visual completion. The bar is
global enterprise SaaS quality, broker/CXO-ready UX, governed data intelligence, explainable decisions,
and a clean, maintainable codebase.

The standard, in ten commitments: (1) **Clean architecture** — backend/frontend/services/models/routes/
tests separated; no large messy files; no duplicate logic; no business rules or calculations in the UI;
frontend is an API-driven rendering layer. (2) **No vibe-coded shortcuts** — no hacks, random components,
inconsistent naming, copy-paste logic, magic numbers, fake values, temporary code, unexplained TODOs, or
console/debug code in production files. (3) **Enterprise UI quality** — premium, intentional, CXO-ready;
consistent design tokens, cards, badges, evidence panels, empty states and banners; no admin-panel or
broken-placeholder feel; preserve the demo portal's analytical flow. (4) **Data trust & explainability**
— every important number comes from governed backend APIs with evidence/formula/source/caveat; Restricted
→ advisory-blocked; Conditional → caveats; no frontend KPI/ICR/savings/scenario math. (5) **Security &
governance** — tenant isolation, RBAC, no secrets/.env/tokens in Git, immutable raw, no ungoverned
analytics, audit/lineage never bypassed. (6) **Testing discipline** — every commit passes frontend tests +
build, backend tests, import/route sanity, the no-frontend-math guard, no mock KPI values, no node_modules/
dist/cache committed, intact Alembic chain on schema change, and no unrelated files. (7) **Commit
discipline** — scoped commits; never mix unrelated backend with UI; separate docs-only/frontend-only/
backend-only/schema commits; report included + excluded files; no commit or push without approval.
(8) **Product consistency** — approved navigation and per-tab demo analysis; Renewal Intelligence = 6 demo
sub-tabs; Wellness Intelligence = 4 demo sub-tabs; Data Onboarding + Source Evidence at the end; Sandbox +
Balanced Design under Renewal Intelligence. (9) **Production-readiness mindset** — before marking a sprint
complete, verify it is maintainable, explainable, testable, secure, scalable, consistent with the vision,
and credible in front of a broker CEO/CHRO/insurer/enterprise technology evaluator. (10) **Quality bar** —
BenefitIQ must look like a professionally engineered SaaS product, not a prototype.

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

### Approved navigation structure (corrected — 20 top-level tabs)
All demo modules are preserved, but Benefit & Savings Sandbox and Balanced Benefit Design are **not**
top-level tabs — they are **sub-tabs under Renewal Intelligence**. The 20 top-level tabs, in demo order:
Broker Portfolio · Client Portfolio · Executive Summary · Demographics · Claims · Ailment · Settlement ·
Maternity · Employee & Family · SI Utilization · Hospital · Rejection · Benefits & Benchmarking · Renewal
Intelligence · Placement Intelligence · Wellness Intelligence · Ask BenefitIQ · PPT / Client Pack / Export ·
Data Onboarding · Source Evidence / Data Quality. **Data Onboarding and Source Evidence / Data Quality sit
at the END** (Data Trust & Admin) so trust modules never interrupt the CXO/broker journey.

- **Renewal Intelligence — exactly 6 demo sub-tabs:** Overview · Claims Drivers · Benefit & Savings
  Sandbox · Balanced Benefit Design · Recommended Strategy · Placement Trigger / Next Best Action. Room
  rent, co-pay, parent co-pay, disease cap, maternity sub-limit, corporate buffer and the multi-lever
  scenario are sections/controls **inside** Benefit & Savings Sandbox — never separate sub-tabs.
- **Wellness Intelligence — exactly 4 demo sub-tabs:** Wellness Overview · Opportunity & Recommendation ·
  Wellness Planner · ROI & Impact Tracking.

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

## Settings / Admin Panel (roadmap — future sprint, e.g. Sprint 9+)
> **BenefitIQ must include an enterprise-grade Settings / Admin Panel for broker and client user
> management, role-based access, tenant/client assignment, governance configuration and auditability.
> Broker roles such as Data Analyst, Consultant, RM, Servicing Manager, Claims Manager, EB Head,
> Placement Head and Placement Manager may initially have full access, but the RBAC foundation must
> support future broker-requested restrictions without redesign. Client HR access must be
> client-specific and restricted by design.**

**Not** part of the main analytical dashboard flow and **must not** disturb the 20 top-level tabs. Surface
it as a utility/admin entry in the top-right user menu or the bottom of the sidebar ("Settings"). It must
feel like an enterprise SaaS admin console — clean user list, role badges, access summary, invite-user
flow, user status, audit history, search/filter, client-assignment view, confirmation modals for risky
actions, permission matrix (future) — never a developer tool or basic technical admin screen.

**Do not implement until separately approved.** Record as a product requirement only; keep it out of the
Sprint 8 Renewal Intelligence restructure.

### Capabilities (build the RBAC foundation correctly now; restrict later without redesign)
1. **User management** — create / edit / deactivate / invite / reset access; assign role; assign broker &
   client access; view status and (later) last login/activity; every change audited.
2. **RBAC — broker roles:** Broker Admin · Data Analyst · Consultant · Relationship Manager (RM) ·
   Servicing Manager · Claims Manager · EB Head · Placement Head · Placement Manager · Wellness Manager ·
   Finance/Billing · Read-only Viewer. **Client roles:** Client HR (now: foundation only) · Client HR
   Head/CHRO, Client Finance, Client Viewer (future). *Current mode:* all broker roles default to full
   access. *Future mode:* restrict role-wise, client-wise and module-wise on broker request — the schema
   must support this from day one so no redesign is needed.
3. **Permission-group foundation:** View Dashboard · Upload Data · Review Mapping · Approve Dataset · View
   Data Quality · View Claims Analytics · View Renewal Intelligence · Run Savings Simulation · View Policy
   Terms · Manage Policy Terms · View Placement Intelligence · View Wellness Intelligence · Export Reports ·
   Manage Users · Manage Settings · Admin Override · View Audit Logs. Initially map broker roles to
   broad/full permission sets; later constrain per role/client/module.
4. **Tenant / broker management (future):** broker org, branches/teams, client list, client↔user mapping,
   client↔policy mapping, user↔client and user↔policy-year assignment, active/inactive clients, broker
   branding.
5. **Client access (future):** Client HR gets client-specific, read-limited access (Executive Summary,
   claims/renewal summary, Savings Sandbox output, PPT/Client Pack) — no raw-data access unless approved,
   no cross-client access, no admin rights. Create the role foundation now only.
6. **Settings sections (eventual):** User Management · Role & Permission Management · Broker/Tenant
   Settings · Client Access Management · Data Governance Settings · Mapping Profile Settings · Metric
   Configuration · Simulation Configuration · Policy Terms Configuration · Notification Settings · Audit
   Logs · Security Settings · API/Integration Settings (future) · Branding/Theme (future).
7. **Governance rules (Gold Standard):** enforce tenant isolation; a user cannot access another
   broker/client's data unless explicitly assigned; every user/role/permission change is audited; admin
   override requires a reason; **no hard-coded access logic in the frontend — the frontend renders access
   from backend-provided permissions; backend is the source of truth**; no secrets/tokens exposed;
   deleting a user never removes audit history.

### RBAC evolution path (compatibility check — no redesign required)
The current foundation (`backend/app/core/security.py`, `app/api/deps.py`) already carries `tenant_id` on
every JWT principal and enforces tenant-scoped role checks — **tenant isolation is forward-compatible**.
The pilot uses a 3-tier hierarchical ladder (ADMIN > REVIEWER > ANALYST via `has_role`). The Settings
sprint evolves this **additively**: introduce persisted User / Role / Permission / Assignment models, a
role→permission mapping, and a permission-based dependency (e.g. `require_permission`) alongside the
existing `require_role`; map the expanded broker/client roles onto permission groups. No change to tenant
isolation, JWT issuance or audit is required — the ladder is replaced by a superset, not redesigned.

## Procedure Intelligence Repository + Benchmark Master (roadmap — future sprint)
> **BenefitIQ must maintain a governed, versioned Procedure Intelligence Repository — a benchmark master
> of ~350–500 hospitalization procedures (covering >95% of Indian corporate GMC hospitalization cost),
> organized by clinical specialty and enriched with market-cost, cap, co-pay, frequency, severity, LOS,
> cashless-%, savings-potential and employee-impact benchmarks. It is advisory intelligence, not absolute
> tariff truth, and every benchmark carries source, confidence and last-updated.**

**Not a flat procedure list.** Model it as a governed hierarchy:
**Specialty → Procedure Group → Procedure → Benchmark Rule → Benefit Design Rule.** Specialties (per the
input doc): Ophthalmology · ENT · General Surgery · Gastroenterology · Urology · Nephrology · Obstetrics &
Gynecology · Orthopedics · Cardiology · Cardiothoracic · Neurology & Neurosurgery · Oncology · Pulmonology ·
Plastic & Reconstructive · Vascular · Pediatric Surgery · Dental (hospitalization) · Dermatology · Others
(~350 procedures target; mature target 350–500).

**Consumers (this repository powers, it does not replace, these modules):** Benefits & Benchmarking ·
Ailment Intelligence · Renewal Intelligence · Benefit & Savings Sandbox · Balanced Benefit Design ·
Placement Intelligence · Ask BenefitIQ · Client Pack / PPT exports.

**Candidate fields (benchmark master row):** `procedure_code` · `specialty` · `procedure_group` ·
`procedure_name` · `aliases` · `ICD10_mapping` · `procedure_mapping` · `market_cost_min` ·
`market_cost_median` · `market_cost_max` · `city_tier` · `hospital_tier` · `suggested_cap` ·
`suggested_copay` · `frequency_band` · `severity_band` · `average_LOS` · `typical_age_band` ·
`cashless_ratio` · `recommended_benefit_design` · `renewal_savings_potential` · `employee_experience_impact`
· `benchmark_source` · `source_confidence` · `last_updated` · `evidence_notes` · `active_flag`. (~25–30
attributes/procedure. Example: `ORTH-001` Total Knee Replacement, ICD-10 M17, median ₹3.5L, suggested cap
₹3.5L, co-pay 10%, LOS 5d, cashless 92%, design "Corporate Buffer", source Market/CGHS/PM-JAY/Broker.)

**Gold Standard rules (governance):** (1) no benchmark used without source + confidence; (2) every
benchmark carries a last-updated date; (3) city-tier and hospital-tier variation supported; (4) employee
impact shown wherever a cap/co-pay is recommended; (5) a suggested cap is a *candidate*, never an automatic
recommendation; (6) stale benchmarks are caveated; (7) the repository is governed and **versioned**;
(8) simulation may use it **only** with evidence and caveats surfaced; (9) the frontend never computes
benchmark logic — backend is the source of truth; (10) no mock pricing in production; (11) benchmarks are
**advisory intelligence, not absolute tariff truth**; (12) procedure mapping must tolerate TPA/hospital
aliases and free-text claim-description variation (reuse the governed mapping/alias discipline from
onboarding). **Do not implement until separately approved** — roadmap capability and architecture direction
only; sequence it as a future sprint after the current UI/navigation work.
