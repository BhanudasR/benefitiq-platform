/** The approved demo's full module set — all 22 tabs are present in production nav. */
export type Tab = { id: string; label: string; path: string; group: string; wired?: boolean };

export const TABS: Tab[] = [
  { id: "broker-portfolio", label: "Broker Portfolio", path: "/broker-portfolio", group: "Portfolio" },
  { id: "client-portfolio", label: "Client Portfolio", path: "/client-portfolio", group: "Portfolio" },
  { id: "executive-summary", label: "Executive Summary", path: "/executive-summary", group: "Overview", wired: true },
  { id: "data-onboarding", label: "Data Onboarding", path: "/data-onboarding", group: "Trust", wired: true },
  { id: "source-evidence", label: "Source Evidence / Data Quality", path: "/source-evidence", group: "Trust" },
  { id: "demographics", label: "Demographics", path: "/demographics", group: "Diagnostics" },
  { id: "claims", label: "Claims", path: "/claims", group: "Diagnostics" },
  { id: "ailment", label: "Ailment", path: "/ailment", group: "Diagnostics" },
  { id: "settlement", label: "Settlement", path: "/settlement", group: "Diagnostics" },
  { id: "maternity", label: "Maternity", path: "/maternity", group: "Diagnostics" },
  { id: "employee-family", label: "Employee & Family", path: "/employee-family", group: "Diagnostics" },
  { id: "si-utilization", label: "SI Utilization", path: "/si-utilization", group: "Diagnostics" },
  { id: "hospital", label: "Hospital", path: "/hospital", group: "Diagnostics" },
  { id: "rejection", label: "Rejection", path: "/rejection", group: "Diagnostics" },
  { id: "benchmarking", label: "Benefits & Benchmarking", path: "/benchmarking", group: "Strategic" },
  { id: "renewal", label: "Renewal Intelligence", path: "/renewal", group: "Strategic" },
  { id: "savings-sandbox", label: "Benefit & Savings Sandbox", path: "/savings-sandbox", group: "Strategic" },
  { id: "balanced-design", label: "Balanced Benefit Design", path: "/balanced-design", group: "Strategic" },
  { id: "placement", label: "Placement Intelligence", path: "/placement", group: "Strategic" },
  { id: "wellness", label: "Wellness Intelligence", path: "/wellness", group: "Strategic" },
  { id: "ask-benefitiq", label: "Ask BenefitIQ", path: "/ask-benefitiq", group: "Assist" },
  { id: "export", label: "PPT / Client Pack / Export", path: "/export", group: "Assist" },
];

export const TAB_GROUPS = ["Portfolio", "Overview", "Trust", "Diagnostics", "Strategic", "Assist"];
