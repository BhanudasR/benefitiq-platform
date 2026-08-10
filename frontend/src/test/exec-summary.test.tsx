import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return {
    ...actual,
    api: {
      ...actual.api,
      metric: vi.fn(),
      dataQuality: vi.fn(),
      simulation: vi.fn(),
      benchmarking: vi.fn(),
      placement: vi.fn(),
      wellness: vi.fn(),
      recommendation: vi.fn(),
    },
  };
});
import { api } from "../lib/api";
import { ExecutiveSummary } from "../pages/ExecutiveSummary";

const ANALYTICS: any = {
  portfolio: {
    data_quality_status: "Analytics Ready",
    value: {
      client_name: "ABC Pvt. Ltd.",
      policy_number: "GMC-2024-25-001",
      total_premium: 2200000,
      premium_basis: "written",
      lives_covered: 1240,
      employee_count: 980,
      insurer_name: "Star Health",
      tpa_name: "Medi Assist",
    },
  },
  claims: {
    data_quality_status: "Analytics Ready",
    caveats: [],
    value: {
      claim_count: 42,
      paid: 1500000,
      outstanding: 120000,
      average_claim_size: 38571,
      status_split: { "Settled Fully": 30, Outstanding: 12 },
    },
  },
  icr: {
    data_quality_status: "Analytics Ready",
    advisory_blocked: false,
    caveats: [],
    premium_basis: "written",
    formula: "incurred/earned x100",
    numerator: 1620000,
    denominator: 2200000,
    source_tables: ["claim", "policy_version"],
    value: { operational_icr: 73.64, incurred: 1620000, earned_premium: 2200000 },
  },
  trends: {
    data_quality_status: "Analytics Ready",
    caveats: [],
    value: {
      series: [
        { policy_year: 2025, operational_icr: 68.0, incurred: 1400000 },
        { policy_year: 2026, operational_icr: 73.64, incurred: 1620000 },
      ],
    },
  },
  ailment: {
    data_quality_status: "Analytics Ready",
    caveats: [],
    value: {
      top_ailments: [
        { key: "Cardiac", incurred: 500000, count: 8, average_claim_size: 62500, incurred_share: 0.31 },
      ],
    },
  },
  demographics: {
    data_quality_status: "Analytics Ready",
    value: { age_bands: [{ label: "31-45", count: 420 }, { label: "46-60", count: 260 }] },
  },
  relation: {
    data_quality_status: "Analytics Ready",
    value: { groups: [{ key: "Self", count: 980 }, { key: "Spouse", count: 260 }] },
  },
  "large-claims": {
    data_quality_status: "Analytics Ready",
    value: { large_claim_count: 3, large_claim_incurred_share: 0.22 },
  },
};

function wireMetric(map: any) {
  (api.metric as any).mockImplementation((name: string) =>
    Promise.resolve(map[name] ?? { data_quality_status: "No Data", value: {} })
  );
}

beforeEach(() => {
  (api.metric as any).mockReset();
  (api.dataQuality as any).mockReset().mockResolvedValue({
    data_quality_status: "Analytics Ready",
    value: { weighted_dq_score: 92, gating_reason: "Analytics ready." },
  });
  (api.simulation as any).mockReset().mockResolvedValue({ data_quality_status: "Analytics Ready", value: {} });
  (api.benchmarking as any).mockReset().mockResolvedValue({ features_comparable: 4, features_total: 24, peer_count: 3 });
  (api.placement as any).mockReset().mockResolvedValue({ placement_state: "no", incumbent_defence_score: 0.72 });
  (api.wellness as any).mockReset().mockResolvedValue({ posture: "Improving", summary: "Wellness posture improving." });
  (api.recommendation as any).mockReset().mockImplementation((name: string) =>
    Promise.resolve(
      name === "next-best-action"
        ? { recommended_next_action: "Start renewal data story." }
        : { recommendation: "defend", confidence: "medium", renewal_readiness_score: 74 }
    )
  );
});

describe("Executive Summary - master screen pattern (API-driven)", () => {
  it("renders the approved-reference master blocks from governed API values only", async () => {
    wireMetric(ANALYTICS);
    renderWithProviders(<ExecutiveSummary />);
    await waitFor(() => expect(screen.getByTestId("exec-master-screen")).toBeInTheDocument());

    expect(screen.getByTestId("exec-top-context")).toBeInTheDocument();
    expect(screen.getByTestId("exec-portfolio-snapshot")).toBeInTheDocument();
    expect(screen.getByTestId("exec-ai-summary")).toBeInTheDocument();
    expect(screen.getByTestId("exec-kpi-band")).toBeInTheDocument();
    expect(screen.getByTestId("exec-financial-visual")).toBeInTheDocument();
    expect(screen.getByTestId("exec-icr-gauge")).toBeInTheDocument();
    expect(screen.getByTestId("exec-claims-snapshot")).toBeInTheDocument();
    expect(screen.getByTestId("exec-drivers")).toBeInTheDocument();
    expect(screen.getByTestId("exec-population-snapshot")).toBeInTheDocument();
    expect(screen.getByTestId("exec-risk-center")).toBeInTheDocument();
    expect(screen.getByTestId("exec-opportunity-center")).toBeInTheDocument();
    expect(screen.getByTestId("exec-action-center")).toBeInTheDocument();
    expect(screen.getByTestId("exec-navigation-hub")).toBeInTheDocument();
    expect(screen.getByTestId("exec-evidence-footer")).toBeInTheDocument();

    expect(within(screen.getByTestId("exec-kpi-icr")).getByText("73.64%")).toBeInTheDocument();
    expect(screen.getByTestId("exec-portfolio-snapshot")).toHaveTextContent("ABC Pvt. Ltd.");
    expect(screen.getByTestId("exec-portfolio-snapshot")).toHaveTextContent("GMC-2024-25-001");
    expect(screen.getByTestId("exec-portfolio-snapshot")).toHaveTextContent("₹22,00,000");
  });

  it("renders governed risk, opportunity and action centers", async () => {
    wireMetric(ANALYTICS);
    renderWithProviders(<ExecutiveSummary />);
    await waitFor(() => expect(screen.getByTestId("exec-risk-center")).toBeInTheDocument());
    expect(screen.getByTestId("exec-risk-center")).toHaveTextContent(/defend/i);
    expect(screen.getByTestId("exec-opportunity-center")).toHaveTextContent(/Wellness posture/i);
    expect(screen.getByTestId("exec-action-center")).toHaveTextContent(/Start renewal data story/i);
  });

  it("uses Not Available for unsupported or missing backend fields", async () => {
    wireMetric(ANALYTICS);
    renderWithProviders(<ExecutiveSummary />);
    await waitFor(() => expect(screen.getByTestId("exec-kpi-projected")).toBeInTheDocument());
    expect(screen.getByTestId("exec-kpi-projected")).toHaveTextContent("Not Available");
    expect(screen.getByTestId("exec-kpi-incidence")).toHaveTextContent("Not Available");
  });

  it("opens the ICR evidence drawer on demand", async () => {
    wireMetric(ANALYTICS);
    renderWithProviders(<ExecutiveSummary />);
    await waitFor(() => expect(screen.getByTestId("exec-kpi-icr")).toBeInTheDocument());
    await userEvent.click(within(screen.getByTestId("exec-kpi-icr")).getByRole("button", { name: /View evidence/i }));
    await waitFor(() => expect(screen.getByTestId("evidence-drawer")).toBeInTheDocument());
    expect(screen.getByTestId("evidence-panel")).toHaveTextContent("incurred/earned x100");
  });

  it("Restricted response renders the advisory-blocked banner", async () => {
    wireMetric({
      ...ANALYTICS,
      icr: { ...ANALYTICS.icr, data_quality_status: "Restricted", advisory_blocked: true, caveats: ["Dataset is RESTRICTED."] },
    });
    renderWithProviders(<ExecutiveSummary />);
    await waitFor(() => expect(screen.getByTestId("restricted-banner")).toBeInTheDocument());
  });

  it("Conditional response renders caveats", async () => {
    wireMetric({
      ...ANALYTICS,
      icr: { ...ANALYTICS.icr, data_quality_status: "Conditional", caveats: ["Written premium used (basis='written')."] },
    });
    renderWithProviders(<ExecutiveSummary />);
    await waitFor(() => expect(screen.getByTestId("caveat-banner")).toHaveTextContent(/written premium/i));
  });

  it("No-Data renders a premium empty state", async () => {
    wireMetric({
      portfolio: { data_quality_status: "No Data", value: {} },
      claims: { data_quality_status: "No Data", value: {} },
      icr: { data_quality_status: "No Data", value: {} },
    });
    renderWithProviders(<ExecutiveSummary />);
    await waitFor(() => expect(screen.getByTestId("empty-state")).toBeInTheDocument());
  });
});
