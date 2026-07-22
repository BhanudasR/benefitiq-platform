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

const BROKER = { data_quality_status: "Analytics Ready", advisory_blocked: false, caveats: [], formula: "per-client rollup",
  value: {
    total_clients: 2, active_policies: 2, total_lives: 3, total_premium: 2000000, total_claims: 2,
    portfolio_icr: 105, premium_basis: "written",
    renewal_due: { overdue: 0, d30: 1, d60: 0, d90: 0, later: 1, missing: 0 },
    risk_distribution: { place: 1, defend: 1 }, readiness_distribution: { "Analytics Ready": 2 },
    clients: [
      { client_id: "C1", client_name: "Acme Corp", lives: 2, premium: 1000000, icr: 160, data_quality_status: "Analytics Ready", policy_count: 1, next_renewal_days: 20, risk_band: "place" },
      { client_id: "C2", client_name: "Beta Ltd", lives: 1, premium: 1000000, icr: 50, data_quality_status: "Analytics Ready", policy_count: 1, next_renewal_days: 200, risk_band: "defend" }],
    high_risk_clients: [{ client_id: "C1" }],
    next_best_actions: ["1 client(s) at or above the redesign ICR band — prioritise renewal review."] } };

const CLIENT = { data_quality_status: "Analytics Ready", advisory_blocked: false, caveats: [], formula: "client-360",
  value: {
    client_id: "C1", client_name: "Acme Corp", lives: 2, premium: 1000000, total_claims: 1, operational_icr: 160,
    policy_years: [2026], policy_status: {}, premium_basis: "written", data_quality_status: "Analytics Ready",
    renewal_status: { next_renewal_date: "2026-08-11", days_to_renewal: 20, due_bucket: "d30" },
    benchmarking_status: { valid_peer_group: false, confidence: "low", features_comparable: 0, features_total: 24 },
    placement_status: { placement_state: "no", incumbent_defence_score: 0.7, rfq_readiness: 0.4 },
    wellness_status: { posture: "Improving population posture" },
    next_best_action: { recommendation: "defend", confidence: "medium", reason: "ICR within the defend band." },
    links: { renewal: "/renewal", benchmarking: "/benchmarking", placement: "/placement", wellness: "/wellness", claims: "/claims" } } };

beforeEach(() => (api.portfolio as any).mockReset());

describe("Broker Portfolio (governed command center)", () => {
  it("renders book KPIs, renewal/risk/readiness visuals and top clients", async () => {
    (api.portfolio as any).mockResolvedValue(BROKER);
    renderWithProviders(<BrokerPortfolio />, { route: "/broker-portfolio" });
    await waitFor(() => expect(screen.getByTestId("bp-kpis")).toBeInTheDocument());
    expect(api.portfolio).toHaveBeenCalledWith("broker-overview");
    expect(screen.getByTestId("bp-kpi-icr")).toHaveTextContent("105%");
    expect(screen.getByTestId("bp-kpi-lives")).toHaveTextContent("3");
    expect(screen.getByTestId("bp-renewal")).toBeInTheDocument();
    expect(screen.getByTestId("bp-risk")).toBeInTheDocument();
    expect(screen.getByTestId("bp-clients")).toHaveTextContent("Acme Corp");
    expect(screen.getAllByTestId("bp-client-card").length).toBe(2);
    expect(screen.getByText(/redesign ICR band/i)).toBeInTheDocument();
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
    expect(screen.getByTestId("cp-health-bench")).toHaveTextContent(/Not available/i);   // no valid peer group
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
