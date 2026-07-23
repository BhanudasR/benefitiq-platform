import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return { ...actual, api: { ...actual.api, dataQuality: vi.fn() } };
});
import { api } from "../lib/api";
import { DataQuality } from "../pages/DataQuality";

const OVERVIEW = {
  data_quality_status: "Restricted", advisory_blocked: true, restricted: true,
  caveats: ["Record counts unavailable for some datasets."], formula: "min-band-gates",
  source_tables: ["dataset_version", "dq_result"],
  value: {
    headline_readiness: "Restricted", weighted_dq_score: 80, weight_basis: "records",
    active_dataset_count: 3, uploads_total: 3, dataset_version_count: 3,
    gating_reason: "Headline gated to 'Restricted' by the claims dataset (DQ 60).",
    dataset_scores: [{ file_kind: "claims", dq_score: 60, readiness: "Restricted", record_count: 50, weight: 50 }],
    dataset_readiness: { Restricted: 1, "Analytics Ready": 2 },
    issues: { critical: 2, warning: 1, info: 1, affected_records: 4, affected_fields: 4, quarantined: 1, total: 4 },
    mapping: { avg_confidence: 0.61, manual_decisions: 2, decisions: { map: 1, ignore: 1, alias: 0 } },
    restricted_or_blocked: [{ file_kind: "claims", reason: "claims dataset is Restricted (DQ 60)" }],
  },
};
const ISSUES = {
  data_quality_status: "Restricted",
  value: {
    severity_split: { critical: 2, warning: 1, info: 1 },
    by_rule: [{ rule: "paid_exceeds_claimed", severity: "ERROR", count: 1, affected_records: 1, affected_fields: ["total_claim_paid"] }],
    affected_fields: [{ field: "total_claim_paid", issue_count: 1, modules_impacted: ["ICR"] }],
    affected_records: 4, affected_field_count: 4, quarantined: { records: 1, rows: [] }, total_issues: 4,
  },
};
const MODULES = {
  data_quality_status: "Restricted",
  value: {
    modules: [
      { module: "ICR", readiness: "Restricted", source_file_kind: "claims", restricted: true, advisory_fallback: false, why: "claims dataset is Restricted (DQ 60)" },
      { module: "Broker Portfolio", readiness: "Analytics Ready", source_file_kind: "policy", restricted: false, advisory_fallback: false, why: "policy dataset is Analytics Ready (DQ 90)" },
      { module: "Demographics", readiness: "No Data", source_file_kind: "member", restricted: false, advisory_fallback: false, why: "No active member dataset in scope" },
    ], readiness_distribution: {}, module_count: 3,
  },
};
const LINEAGE = {
  data_quality_status: "Restricted",
  value: {
    files: [{ file_name: "claims_1.xlsx", file_kind: "claims", sha256_short: "abc123def456", version_no: 1, status: "ACTIVE", active: true, readiness: "Restricted", uploaded_by: "u" }],
    file_count: 1, active_count: 1, immutable_raw: true, kinds: ["claims"],
  },
};

function route(name: string) {
  return (name === "overview" ? OVERVIEW : name === "issues" ? ISSUES : name === "module-readiness" ? MODULES : LINEAGE);
}

beforeEach(() => (api.dataQuality as any).mockReset());

describe("Source Evidence / Data Quality (trust command center)", () => {
  it("renders gauge, headline verdict, KPI band, severity, modules, lineage and fixes from governed values", async () => {
    (api.dataQuality as any).mockImplementation((n: string) => Promise.resolve(route(n)));
    renderWithProviders(<DataQuality />, { route: "/source-evidence" });
    await waitFor(() => expect(screen.getByTestId("dq-kpis")).toBeInTheDocument());
    expect(api.dataQuality).toHaveBeenCalledWith("overview");
    // DQ gauge + headline
    expect(screen.getByTestId("dq-gauge")).toBeInTheDocument();
    expect(screen.getByTestId("dq-headline")).toHaveTextContent(/Restricted/);
    // KPI band values
    expect(screen.getByTestId("dq-kpi-score")).toHaveTextContent("80");
    expect(screen.getByTestId("dq-kpi-datasets")).toHaveTextContent("3");
    expect(screen.getByTestId("dq-kpi-critical")).toHaveTextContent("2");
    // restricted / advisory-blocked banner
    expect(screen.getByTestId("restricted-banner")).toBeInTheDocument();
    // severity visual + module grid + lineage + fixes
    await waitFor(() => expect(screen.getByTestId("dq-severity")).toBeInTheDocument());
    expect(screen.getByTestId("dq-modules")).toBeInTheDocument();
    expect(screen.getByTestId("dq-modules")).toHaveTextContent("ICR");
    expect(screen.getByTestId("dq-lineage")).toHaveTextContent("claims_1.xlsx");
    expect(screen.getByTestId("dq-fixes")).toBeInTheDocument();
    expect(screen.getByTestId("dq-impacted")).toBeInTheDocument();
  });

  it("opens the evidence drawer", async () => {
    (api.dataQuality as any).mockImplementation((n: string) => Promise.resolve(route(n)));
    renderWithProviders(<DataQuality />, { route: "/source-evidence" });
    await waitFor(() => expect(screen.getByTestId("dq-evidence-btn")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("dq-evidence-btn"));
    await waitFor(() => expect(screen.getByTestId("evidence-drawer")).toBeInTheDocument());
  });

  it("renders Not Available when governed fields are absent", async () => {
    const noConf = { ...OVERVIEW, value: { ...OVERVIEW.value, weighted_dq_score: null, mapping: { avg_confidence: null, manual_decisions: 0, decisions: {} } } };
    (api.dataQuality as any).mockImplementation((n: string) => Promise.resolve(n === "overview" ? noConf : route(n)));
    renderWithProviders(<DataQuality />, { route: "/source-evidence" });
    await waitFor(() => expect(screen.getByTestId("dq-kpi-mapping")).toBeInTheDocument());
    expect(screen.getByTestId("dq-kpi-mapping")).toHaveTextContent(/Not available/i);
    expect(screen.getByTestId("dq-kpi-score")).toHaveTextContent(/Not available/i);
  });

  it("No-Data renders the empty state", async () => {
    (api.dataQuality as any).mockResolvedValue({ data_quality_status: "No Data", value: {} });
    renderWithProviders(<DataQuality />, { route: "/source-evidence" });
    await waitFor(() => expect(screen.getByTestId("empty-state")).toBeInTheDocument());
  });
});
