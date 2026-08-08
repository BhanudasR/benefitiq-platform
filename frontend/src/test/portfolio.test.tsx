import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return { ...actual, api: { ...actual.api, portfolio: vi.fn() } };
});
import { api } from "../lib/api";
import { BrokerPortfolio } from "../pages/BrokerPortfolio";
import { ClientPortfolio } from "../pages/ClientPortfolio";

const CLIENT_C1: any = {
  client_id: "C1", client_name: "Acme Corp", lives: 2, premium: 1000000, claims_incurred: 1600000,
  icr: 160, projected_icr: null, adjusted_icr: null, data_quality_status: "Analytics Ready",
  policy_count: 1, next_renewal_days: 20, renewal_due_bucket: "d30", risk_band: "place",
  risk_impact: "high", urgency_band: "high", industry: null, risk_score: null,
  main_claims_driver: null, recommended_next_action: null,
};

const CLIENT_C2: any = {
  client_id: "C2", client_name: "Beta Ltd", lives: 1, premium: 1000000, claims_incurred: 500000,
  icr: 50, projected_icr: null, adjusted_icr: null, data_quality_status: "Analytics Ready",
  policy_count: 1, next_renewal_days: 200, renewal_due_bucket: "later", risk_band: "defend",
  risk_impact: "low", urgency_band: "low", industry: null, risk_score: null,
  main_claims_driver: null, recommended_next_action: null,
};

const BROKER = {
  data_quality_status: "Analytics Ready",
  advisory_blocked: false,
  caveats: [],
  formula: "per-client rollup",
  source_basis: ["governed metric engines", "RecommendationConfig ICR bands"],
  value: {
    total_clients: 2, active_policies: 2, total_lives: 3, total_premium: 2000000,
    total_claims: 2, claims_incurred: 2100000, portfolio_icr: 105,
    average_client_icr: 105, projected_portfolio_icr: null,
    premium_at_risk: 1000000, claims_at_risk: 1600000,
    expected_renewal_loading_exposure: null, opportunity_value: null,
    renewal_due_clients: 1, high_risk_renewals: 1, premium_basis: "written",
    renewal_due: { overdue: 0, d30: 1, d60: 0, d90: 0, later: 1, missing: 0 },
    risk_distribution: { place: 1, defend: 1 },
    readiness_distribution: { "Analytics Ready": 2 },
    priority_matrix: {
      low: { low: 1, medium: 0, high: 0 },
      medium: { low: 0, medium: 0, high: 0 },
      high: { low: 0, medium: 0, high: 1 },
    },
    renewal_action_queue: [
      { key: "immediate_attention", label: "Immediate Attention", basis: "High risk + <=30 days", count: 1 },
      { key: "plan_strategy_call", label: "Plan Strategy Call", basis: "High risk + 31-60 days", count: 0 },
      { key: "monitor_closely", label: "Monitor Closely", basis: "Medium/high risk + 61-90 days", count: 0 },
      { key: "track_prepare", label: "Track & Prepare", basis: ">90 days or lower risk", count: 1 },
    ],
    clients: [CLIENT_C1, CLIENT_C2],
    client_risk_queue: [CLIENT_C1, CLIENT_C2],
    high_risk_clients: [{ client_id: "C1" }],
    next_best_actions: ["1 client(s) at or above the redesign ICR band - prioritise renewal review."],
  },
};

const CLIENT = {
  data_quality_status: "Analytics Ready", advisory_blocked: false, caveats: [], formula: "client-360",
  value: {
    client_id: "C1", client_name: "Acme Corp", lives: 2, premium: 1000000, total_claims: 1, operational_icr: 160,
    policy_years: [2026], policy_status: {}, premium_basis: "written", data_quality_status: "Analytics Ready",
    renewal_status: { next_renewal_date: "2026-08-11", days_to_renewal: 20, due_bucket: "d30" },
    benchmarking_status: { valid_peer_group: false, confidence: "low", features_comparable: 0, features_total: 24 },
    placement_status: { placement_state: "no", incumbent_defence_score: 0.7, rfq_readiness: 0.4 },
    wellness_status: { posture: "Improving population posture" },
    next_best_action: { recommendation: "defend", confidence: "medium", reason: "ICR within the defend band." },
    links: { renewal: "/renewal", benchmarking: "/benchmarking", placement: "/placement", wellness: "/wellness", claims: "/claims" },
  },
};

beforeEach(() => (api.portfolio as any).mockReset());

describe("Broker Portfolio (governed command center)", () => {
  it("renders the master command-center sections from broker-overview only", async () => {
    (api.portfolio as any).mockResolvedValue(BROKER);
    renderWithProviders(<BrokerPortfolio />, { route: "/broker-portfolio" });
    await waitFor(() => expect(screen.getByTestId("bp-master-screen")).toBeInTheDocument());
    expect(api.portfolio).toHaveBeenCalledWith("broker-overview");

    expect(screen.getByTestId("bp-top-context")).toBeInTheDocument();
    expect(screen.getByTestId("bp-kpi-band")).toBeInTheDocument();
    expect(screen.getByTestId("bp-priority-matrix")).toBeInTheDocument();
    expect(screen.getByTestId("bp-premium-risk")).toBeInTheDocument();
    expect(screen.getByTestId("bp-risk-distribution")).toBeInTheDocument();
    expect(screen.getByTestId("bp-action-queue")).toBeInTheDocument();
    expect(screen.getByTestId("bp-client-risk-grid")).toBeInTheDocument();
    expect(screen.getByTestId("bp-evidence-footer")).toBeInTheDocument();

    expect(screen.getByTestId("bp-kpi-portfolio-icr")).toHaveTextContent("105%");
    expect(screen.getByTestId("bp-kpi-lives")).toHaveTextContent("3");
    expect(screen.getByTestId("bp-kpi-incurred")).toHaveTextContent("21,00,000");
    expect(screen.getByTestId("bp-kpi-premium-risk")).toHaveTextContent("10,00,000");
    expect(screen.getByTestId("bp-kpi-claims-risk")).toHaveTextContent("16,00,000");
    expect(screen.getAllByTestId("bp-client-row").length).toBe(2);
    expect(screen.getByTestId("bp-client-risk-grid")).toHaveTextContent("Acme Corp");
    expect(screen.getByTestId("bp-action-queue")).toHaveTextContent("Immediate Attention");
  });

  it("renders unsupported advanced BRD fields as Not Available", async () => {
    (api.portfolio as any).mockResolvedValue(BROKER);
    renderWithProviders(<BrokerPortfolio />, { route: "/broker-portfolio" });
    await waitFor(() => expect(screen.getByTestId("bp-kpi-projected")).toBeInTheDocument());
    expect(screen.getByTestId("bp-kpi-projected")).toHaveTextContent("Not Available");
    expect(screen.getByTestId("bp-kpi-loading")).toHaveTextContent("Not Available");
    expect(screen.getByTestId("bp-kpi-opportunity")).toHaveTextContent("Not Available");
    expect(screen.getByTestId("bp-client-risk-grid")).toHaveTextContent("Not Available");
  });

  it("No-Data renders empty state", async () => {
    (api.portfolio as any).mockResolvedValue({ data_quality_status: "No Data", value: {} });
    renderWithProviders(<BrokerPortfolio />, { route: "/broker-portfolio" });
    await waitFor(() => expect(screen.getByTestId("empty-state")).toBeInTheDocument());
  });
});

describe("Client Portfolio (governed client-360)", () => {
  it("renders KPIs, health cards, NBA and quick-links from governed values", async () => {
    (api.portfolio as any).mockResolvedValue(CLIENT);
    renderWithProviders(<ClientPortfolio />, { route: "/client-portfolio?client_id=C1" });
    await waitFor(() => expect(screen.getByTestId("cp-kpis")).toBeInTheDocument());
    expect(api.portfolio).toHaveBeenCalledWith("client-overview", { client_id: "C1" });
    expect(screen.getByTestId("cp-kpi-icr")).toHaveTextContent("160%");
    expect(screen.getByTestId("cp-health-bench")).toHaveTextContent(/Not available/i);
    expect(screen.getByTestId("cp-health-placement")).toHaveTextContent("no");
    expect(screen.getByTestId("cp-health-wellness")).toHaveTextContent(/Assessed/i);
    expect(screen.getByTestId("cp-links")).toHaveTextContent(/Renewal/);
  });

  it("without a client_id shows the governed client picker", async () => {
    (api.portfolio as any).mockResolvedValue(BROKER);
    renderWithProviders(<ClientPortfolio />, { route: "/client-portfolio" });
    await waitFor(() => expect(screen.getByTestId("cp-picker")).toBeInTheDocument());
    expect(screen.getByTestId("cp-picker")).toHaveTextContent("Acme Corp");
  });

  it("No-Data renders empty state", async () => {
    (api.portfolio as any).mockResolvedValue({ data_quality_status: "No Data", value: {} });
    renderWithProviders(<ClientPortfolio />, { route: "/client-portfolio?client_id=C1" });
    await waitFor(() => expect(screen.getByTestId("empty-state")).toBeInTheDocument());
  });
});
