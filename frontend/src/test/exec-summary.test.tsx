import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return { ...actual, api: { ...actual.api,
    metric: vi.fn(),
    benchmarking: vi.fn(), placement: vi.fn(), wellness: vi.fn(), recommendation: vi.fn() } };
});
import { api } from "../lib/api";
import { ExecutiveSummary } from "../pages/ExecutiveSummary";

const ANALYTICS: any = {
  portfolio: { data_quality_status: "Analytics Ready", value: { total_premium: 2200000, premium_basis: "written", lives_covered: 1240, employee_count: 980 } },
  claims: { data_quality_status: "Analytics Ready", caveats: [], value: { claim_count: 42, status_split: { "Settled Fully": 30, "Outstanding": 12 } } },
  icr: { data_quality_status: "Analytics Ready", advisory_blocked: false, caveats: [], premium_basis: "written",
         formula: "incurred/earned x100", numerator: 1620000, denominator: 2200000, source_tables: ["claim", "policy_version"],
         value: { operational_icr: 73.64, incurred: 1620000, earned_premium: 2200000 } },
  trends: { data_quality_status: "Analytics Ready", caveats: [], value: { series: [
    { policy_year: 2025, operational_icr: 68.0, incurred: 1400000 },
    { policy_year: 2026, operational_icr: 73.64, incurred: 1620000 }] } },
  ailment: { data_quality_status: "Analytics Ready", caveats: [], value: { top_ailments: [
    { key: "Cardiac", incurred: 500000, count: 8, average_claim_size: 62500, incurred_share: 0.31 }] } },
};

function wireMetric(map: any) {
  (api.metric as any).mockImplementation((name: string) => Promise.resolve(map[name] ?? { data_quality_status: "No Data", value: {} }));
}

beforeEach(() => {
  (api.metric as any).mockReset();
  (api.benchmarking as any).mockResolvedValue({ features_comparable: 4, features_total: 24, peer_count: 3 });
  (api.placement as any).mockResolvedValue({ placement_state: "no", incumbent_defence_score: 0.72 });
  (api.wellness as any).mockResolvedValue({ posture: "Improving" });
  (api.recommendation as any).mockResolvedValue({ recommendation: "defend", confidence: "medium" });
});

describe("Executive Summary — premium CXO dashboard (API-driven)", () => {
  it("renders the hero KPI band + charts from governed API values only", async () => {
    wireMetric(ANALYTICS);
    renderWithProviders(<ExecutiveSummary />);
    await waitFor(() => expect(screen.getByTestId("exec-kpi-band")).toBeInTheDocument());
    expect(within(screen.getByTestId("exec-kpi-icr")).getByText("73.64%")).toBeInTheDocument();
    expect(within(screen.getByTestId("exec-kpi-premium")).getByText("₹22,00,000")).toBeInTheDocument();
    expect(screen.getByTestId("exec-icr-gauge")).toBeInTheDocument();
    expect(screen.getByTestId("exec-drivers")).toBeInTheDocument();
    expect(screen.getByTestId("exec-mix")).toBeInTheDocument();
  });

  it("renders governed cross-module summary widgets", async () => {
    wireMetric(ANALYTICS);
    renderWithProviders(<ExecutiveSummary />);
    await waitFor(() => expect(screen.getByTestId("exec-widgets")).toBeInTheDocument());
    expect(screen.getByTestId("exec-widgets")).toHaveTextContent(/defend/i);   // renewal recommendation
    expect(screen.getByTestId("exec-widgets")).toHaveTextContent(/4 \/ 24|4\s*\/\s*24/);
  });

  it("opens the ICR evidence drawer on demand (API formula)", async () => {
    wireMetric(ANALYTICS);
    renderWithProviders(<ExecutiveSummary />);
    await waitFor(() => expect(screen.getByTestId("exec-kpi-icr")).toBeInTheDocument());
    await userEvent.click(within(screen.getByTestId("exec-kpi-icr")).getByRole("button", { name: /View evidence/i }));
    await waitFor(() => expect(screen.getByTestId("evidence-drawer")).toBeInTheDocument());
    expect(screen.getByTestId("evidence-panel")).toHaveTextContent("incurred/earned x100");
  });

  it("Restricted response renders the advisory-blocked banner", async () => {
    wireMetric({ ...ANALYTICS, icr: { ...ANALYTICS.icr, data_quality_status: "Restricted", advisory_blocked: true, caveats: ["Dataset is RESTRICTED."] } });
    renderWithProviders(<ExecutiveSummary />);
    await waitFor(() => expect(screen.getByTestId("restricted-banner")).toBeInTheDocument());
  });

  it("Conditional response renders caveats", async () => {
    wireMetric({ ...ANALYTICS, icr: { ...ANALYTICS.icr, data_quality_status: "Conditional", caveats: ["Written premium used (basis='written')."] } });
    renderWithProviders(<ExecutiveSummary />);
    await waitFor(() => expect(screen.getByTestId("caveat-banner")).toHaveTextContent(/written premium/i));
  });

  it("No-Data renders a premium empty state", async () => {
    wireMetric({ portfolio: { data_quality_status: "No Data", value: {} }, claims: { data_quality_status: "No Data", value: {} }, icr: { data_quality_status: "No Data", value: {} } });
    renderWithProviders(<ExecutiveSummary />);
    await waitFor(() => expect(screen.getByTestId("empty-state")).toBeInTheDocument());
  });
});
