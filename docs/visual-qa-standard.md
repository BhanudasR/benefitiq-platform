# BenefitIQ Visual QA Standard

Sprint 4 defines the visual acceptance standard for every BenefitIQ dashboard. Approved dashboard reference images are product requirements, not inspiration. A dashboard is not founder-ready only because tests pass; it must pass reference-image visual QA.

## Scope

This standard applies to every analytics, portfolio, renewal, benchmarking, placement, wellness, AI, export, and trust dashboard screen. Existing screens are functionally useful but visually pending until they pass this standard.

## Screenshot Standard

### Viewports

Use these viewports for founder-led visual QA:

- Primary desktop: `1600x1000`
- Secondary desktop: `1440x900`
- Mobile sanity check: `390x844`

The primary desktop screenshot is the acceptance baseline for reference-image comparison. Mobile screenshots check readability, overflow, and text wrapping; they do not replace desktop reference comparison.

### Capture Method

Use browser-rendered local app screenshots after implementation:

- Capture a viewport screenshot for first-screen reference comparison.
- Capture a full-page screenshot only as secondary evidence.
- Confirm the page is loaded with representative governed API data or clear `Not Available` values.
- Do not use mocked visual values that create fake product claims.

If full-page screenshot stitching distorts the layout, record that and use the viewport screenshot as the primary visual QA artifact.

### Naming

Use this naming pattern:

```text
review-artifacts/visual-qa/{sprint}/{module-slug}/{module-slug}-{viewport}-{YYYYMMDD-HHMM}.png
```

Example:

```text
review-artifacts/visual-qa/sprint5/executive-summary/executive-summary-1600x1000-20260810-1430.png
```

### Storage And Git

Screenshots are local review artifacts only.

- Store screenshots under `review-artifacts/visual-qa/`.
- Keep `review-artifacts/` untracked.
- Add `review-artifacts/` to local `.git/info/exclude`.
- Do not commit screenshots unless the founder separately approves a repo-level visual artifact policy.
- Never use `git add .` during dashboard sprints; stage explicit approved files only.

## Reference Comparison Checklist

For each dashboard module, compare the current screen against its approved reference image and confirm:

- Strong module title and subtitle
- Top context bar with refresh, data quality, export, client/policy controls where relevant
- Dense KPI snapshot band with icons/status/trend where backend supports them
- Multiple visual analytics sections
- Appropriate charts such as matrix, heatmap, trend, donut, bar, gauge, waterfall, or distribution views
- AI or insight summary only when grounded by governed backend data
- Alerts section
- Opportunities section
- Action center or next best action area
- Drill-down links to relevant modules
- Evidence/caveat footer
- `Not Available` treatment for unsupported fields
- No fake values and no zero used as a placeholder for missing data
- Good spacing, hierarchy, readability, and text wrapping at desktop and mobile sanity viewports
- No generic admin-table feel
- No raw employee/member/claim PII on master dashboards
- No frontend KPI or business calculation

## Dashboard Acceptance Score

Score every dashboard out of 100:

| Category | Points |
| --- | ---: |
| BRD alignment | 10 |
| Reference image alignment | 20 |
| KPI completeness | 10 |
| Chart richness | 10 |
| Actionability | 10 |
| Evidence/explainability | 10 |
| Readability/layout polish | 10 |
| No-vibe SaaS feel | 10 |
| Data governance compliance | 5 |
| Test/build readiness | 5 |

Acceptance bands:

- `90-100`: Founder-ready
- `80-89`: Strong, minor visual gaps
- `70-79`: Functionally useful, visual hardening required
- `<70`: Visually pending

Founder acceptance requires `90+` or an explicit founder waiver.

## Shell And Layout Standard

- Sidebar must be stable, readable, and non-distracting.
- Current module must be clearly highlighted.
- Top header should show workspace context, tenant/role, and relevant controls.
- Page title and subtitle must anchor the first viewport.
- Context controls should include client, policy year, insurer/TPA, data quality, refresh, and export when relevant.
- Desktop layouts should be dense but readable, targeting the approved reference density.
- KPI bands should avoid cramped text; use fewer columns when values are long.
- Chart grids should use stable dimensions and should not shift when values load.
- No nested cards for main content.
- Text must not clip, overlap, or overflow its container.
- Mobile must remain usable, but desktop reference parity is the primary founder acceptance path.

## Component Standard

### KPI Cards

- Show label, value, support text, and optional status/trend.
- Values must come from governed backend APIs.
- Missing values render as `Not Available`.

### Chart Cards

- Include title, subtitle, chart, empty state, data quality indicator, and evidence access when relevant.
- Chart geometry can be rendered in frontend; business values cannot be computed in frontend.

### Insight Cards

- Use only backend-grounded insights, recommendations, caveats, or summaries.
- Do not generate unsupported claims in the browser.

### Risk, Opportunity, And Action Cards

- Risk cards must show basis and caveats where data is partial.
- Opportunity values must be backend-supported or `Not Available`.
- Action cards must link to governed drill-down modules.

### Evidence/Caveat Footer

Every dashboard should end with an evidence/caveat footer that includes:

- Formula or basis summary
- Source basis or source tables
- Data quality status
- Reliability / restricted / advisory-blocked state where available
- Caveats
- Unsupported-field disclaimer when applicable

### Not Available Treatment

Use `Not Available` for unsupported or missing BRD fields. Do not use zero, blank, dash-only, or fake values for business meaning.

## Visual QA Workflow

1. Inspect approved reference image.
2. List all visible reference sections.
3. Map each section to backend-supported data or `Not Available`.
4. Implement or retrofit only approved scope.
5. Run relevant tests and build.
6. Capture screenshots using the standard viewport.
7. Score the dashboard using the rubric.
8. Report screenshot path, score, visual gaps, and test results.
9. Stop for founder approval.

## Sprint 5 Recommendation

Sprint 5 should harden the three master pattern dashboards:

- Executive Summary
- Broker Portfolio
- Client Portfolio

These define the visual benchmark for later modules. Sprint 5 should close reference-density gaps, improve first-viewport hierarchy, add supported alerts/opportunities/action rails, keep unsupported fields as `Not Available`, and complete screenshot QA for all three.

