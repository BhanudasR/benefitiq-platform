/**
 * Production navigation = the approved demo PORTAL structure.
 *
 * EXACTLY 20 top-level tabs, in the demo order, grouped into 6 sections. Two demo
 * modules are NOT top-level tabs — Benefit & Savings Sandbox and Balanced Benefit
 * Design live as SUB-TABS under Renewal Intelligence. Renewal Intelligence has
 * exactly the 6 demo sub-tabs; Wellness Intelligence has exactly the 4 demo sub-tabs.
 * Data Onboarding + Source Evidence are moved to the END (Data Trust & Admin) so the
 * critical trust modules never interrupt the CXO/broker decision journey.
 */
export type SubTab = { id: string; label: string; path: string; end?: boolean; wired?: boolean };
export type Tab = {
  id: string; label: string; path: string; group: string;
  wired?: boolean; subTabs?: SubTab[];
};

export const TAB_GROUPS = [
  "Portfolio & Executive",
  "Core Analytics",
  "Benefits & Renewal",
  "Strategic Advisory",
  "AI & Outputs",
  "Data Trust & Admin",
];

/** Renewal Intelligence — exactly the 6 demo sub-tabs (no more). Room-rent, co-pay,
 *  parent co-pay, disease cap, maternity sub-limit, corporate buffer and the
 *  multi-lever scenario are SECTIONS/CONTROLS inside "Benefit & Savings Sandbox". */
export const RENEWAL_SUBTABS: SubTab[] = [
  { id: "renewal-overview", label: "Overview", path: "/renewal", end: true, wired: true },
  { id: "renewal-claims-drivers", label: "Claims Drivers", path: "/renewal/claims-drivers", wired: true },
  { id: "renewal-savings-sandbox", label: "Benefit & Savings Sandbox", path: "/renewal/savings-sandbox", wired: true },
  { id: "renewal-balanced-design", label: "Balanced Benefit Design", path: "/renewal/balanced-design", wired: true },
  { id: "renewal-recommended-strategy", label: "Recommended Strategy", path: "/renewal/recommended-strategy", wired: true },
  { id: "renewal-placement-trigger", label: "Placement Trigger / Next Best Action", path: "/renewal/placement-trigger", wired: true },
];

/** Benefits & Benchmarking — parent tab with exactly the 7 benchmarking sub-tabs.
 *  Benchmarks benefit DESIGN + policy T&C only (never claims). Still ONE of the 20 tabs. */
export const BENCHMARKING_SUBTABS: SubTab[] = [
  { id: "benchmarking-overview", label: "Benchmark Overview", path: "/benchmarking", end: true, wired: true },
  { id: "benchmarking-features", label: "Benefit Design Features", path: "/benchmarking/features", wired: true },
  { id: "benchmarking-policy-terms", label: "Policy Terms Comparison", path: "/benchmarking/policy-terms", wired: true },
  { id: "benchmarking-peer", label: "Market / Peer Comparison", path: "/benchmarking/peer-comparison", wired: true },
  { id: "benchmarking-gaps", label: "Benefit Gap Analysis", path: "/benchmarking/gap-analysis", wired: true },
  { id: "benchmarking-discussion", label: "Discussion Points", path: "/benchmarking/discussion-points", wired: true },
  { id: "benchmarking-evidence", label: "Evidence / Export", path: "/benchmarking/evidence", wired: true },
];

/** Wellness Intelligence — exactly the 4 demo sub-tabs (no more). */
export const WELLNESS_SUBTABS: SubTab[] = [
  { id: "wellness-overview", label: "Wellness Overview", path: "/wellness", end: true },
  { id: "wellness-opportunity", label: "Opportunity & Recommendation", path: "/wellness/opportunity" },
  { id: "wellness-planner", label: "Wellness Planner", path: "/wellness/planner" },
  { id: "wellness-roi", label: "ROI & Impact Tracking", path: "/wellness/roi" },
];

export const TABS: Tab[] = [
  // 1 — Portfolio & Executive View
  { id: "broker-portfolio", label: "Broker Portfolio", path: "/broker-portfolio", group: "Portfolio & Executive" },
  { id: "client-portfolio", label: "Client Portfolio", path: "/client-portfolio", group: "Portfolio & Executive" },
  { id: "executive-summary", label: "Executive Summary", path: "/executive-summary", group: "Portfolio & Executive", wired: true },

  // 2 — Core Analytics
  { id: "demographics", label: "Demographics", path: "/demographics", group: "Core Analytics" },
  { id: "claims", label: "Claims", path: "/claims", group: "Core Analytics" },
  { id: "ailment", label: "Ailment", path: "/ailment", group: "Core Analytics" },
  { id: "settlement", label: "Settlement", path: "/settlement", group: "Core Analytics" },
  { id: "maternity", label: "Maternity", path: "/maternity", group: "Core Analytics" },
  { id: "employee-family", label: "Employee & Family", path: "/employee-family", group: "Core Analytics" },
  { id: "si-utilization", label: "SI Utilization", path: "/si-utilization", group: "Core Analytics" },
  { id: "hospital", label: "Hospital", path: "/hospital", group: "Core Analytics" },
  { id: "rejection", label: "Rejection", path: "/rejection", group: "Core Analytics" },

  // 3 — Benefits & Renewal Strategy
  { id: "benchmarking", label: "Benefits & Benchmarking", path: "/benchmarking", group: "Benefits & Renewal", wired: true, subTabs: BENCHMARKING_SUBTABS },
  { id: "renewal", label: "Renewal Intelligence", path: "/renewal", group: "Benefits & Renewal", wired: true, subTabs: RENEWAL_SUBTABS },

  // 4 — Strategic Advisory
  { id: "placement", label: "Placement Intelligence", path: "/placement", group: "Strategic Advisory" },
  { id: "wellness", label: "Wellness Intelligence", path: "/wellness", group: "Strategic Advisory", subTabs: WELLNESS_SUBTABS },

  // 5 — AI & Outputs
  { id: "ask-benefitiq", label: "Ask BenefitIQ", path: "/ask-benefitiq", group: "AI & Outputs" },
  { id: "export", label: "PPT / Client Pack / Export", path: "/export", group: "AI & Outputs" },

  // 6 — Data Trust & Admin (moved to END)
  { id: "data-onboarding", label: "Data Onboarding", path: "/data-onboarding", group: "Data Trust & Admin", wired: true },
  { id: "source-evidence", label: "Source Evidence / Data Quality", path: "/source-evidence", group: "Data Trust & Admin" },
];
