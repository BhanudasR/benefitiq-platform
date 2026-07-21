import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return { ...actual, api: { ...actual.api, metric: vi.fn() } };
});
import { api } from "../lib/api";
import { Claims } from "../pages/Claims";
import { Ailment } from "../pages/Ailment";
import { Hospital } from "../pages/Hospital";

function wire(map: any) {
  (api.metric as any).mockImplementation((name: string) => Promise.resolve(map[name] ?? { data_quality_status: "No Data", value: {} }));
}
const NODATA = { data_quality_status: "No Data", value: {} };

beforeEach(() => (api.metric as any).mockReset());

const CLAIMS = {
  claims: { data_quality_status: "Analytics Ready", caveats: [], formula: "paid+outstanding", value: {
    incurred: 1620000, paid: 1500000, outstanding: 120000, claim_count: 42, open_claims: 12, closed_claims: 30,
    average_claim_size: 38571, cashless_count: 28, reimbursement_count: 14, status_split: { "Settled Fully": 30, "Outstanding": 12 } } },
  trends: { data_quality_status: "Analytics Ready", caveats: [], value: { series: [
    { policy_year: 2025, incurred: 1400000 }, { policy_year: 2026, incurred: 1620000 }] } },
  "large-claims": { data_quality_status: "Analytics Ready", value: { large_claim_count: 3, large_claim_incurred_share: 0.22 } },
};
const AILMENT = { ailment: { data_quality_status: "Analytics Ready", caveats: [], formula: "group by dx", value: { top_ailments: [
  { key: "Cardiac", incurred: 500000, count: 8, average_claim_size: 62500, incurred_share: 0.31, recurring_indicator: true },
  { key: "Ortho", incurred: 300000, count: 5, average_claim_size: 60000, incurred_share: 0.18, recurring_indicator: false }] } } };
const HOSPITAL = { hospital: { data_quality_status: "Analytics Ready", caveats: [], formula: "group by hospital", value: {
  top_hospitals: [{ key: "Apollo", incurred: 400000, count: 6, average_claim_size: 66000 },
                  { key: "Fortis", incurred: 250000, count: 4, average_claim_size: 62500 }],
  network_count: 20, non_network_count: 8, top_hospital_concentration: 0.35 } } };

describe("Claims dashboard", () => {
  it("renders governed KPIs and charts", async () => {
    wire(CLAIMS);
    renderWithProviders(<Claims />);
    await waitFor(() => expect(screen.getByTestId("claims-kpis")).toBeInTheDocument());
    expect(screen.getByTestId("claims-kpi-count")).toHaveTextContent("42");
    expect(screen.getByTestId("claims-paid-outstanding")).toBeInTheDocument();
    expect(screen.getByTestId("claims-status")).toHaveTextContent("Settled Fully");
    await userEvent.click(screen.getAllByText(/View evidence/i)[0]);
    await waitFor(() => expect(screen.getByTestId("evidence-drawer")).toBeInTheDocument());
  });
  it("No-Data renders empty state", async () => {
    wire({ claims: NODATA });
    renderWithProviders(<Claims />);
    await waitFor(() => expect(screen.getByTestId("empty-state")).toBeInTheDocument());
  });
});

describe("Ailment dashboard", () => {
  it("renders top ailments, quadrant and recurring groups from API", async () => {
    wire(AILMENT);
    renderWithProviders(<Ailment />);
    await waitFor(() => expect(screen.getByTestId("ailment-kpis")).toBeInTheDocument());
    expect(screen.getByTestId("ailment-top")).toHaveTextContent("Cardiac");
    expect(screen.getByTestId("ailment-quadrant")).toBeInTheDocument();
    expect(screen.getByTestId("ailment-recurring")).toHaveTextContent("Cardiac");
  });
  it("No-Data renders empty state", async () => {
    wire({ ailment: NODATA });
    renderWithProviders(<Ailment />);
    await waitFor(() => expect(screen.getByTestId("empty-state")).toBeInTheDocument());
  });
});

describe("Hospital dashboard", () => {
  it("renders providers, network split and shows 'Not available' for city", async () => {
    wire(HOSPITAL);
    renderWithProviders(<Hospital />);
    await waitFor(() => expect(screen.getByTestId("hospital-kpis")).toBeInTheDocument());
    expect(screen.getByTestId("hospital-top")).toHaveTextContent("Apollo");
    expect(screen.getByTestId("hospital-network")).toHaveTextContent("Network");
    expect(screen.getByTestId("hospital-table")).toHaveTextContent("Not available");   // city never fabricated
  });
  it("No-Data renders empty state", async () => {
    wire({ hospital: NODATA });
    renderWithProviders(<Hospital />);
    await waitFor(() => expect(screen.getByTestId("empty-state")).toBeInTheDocument());
  });
});
