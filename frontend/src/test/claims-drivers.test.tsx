import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return { ...actual, api: { ...actual.api, metric: vi.fn() } };
});
import { api } from "../lib/api";
import { ClaimsDrivers } from "../pages/ClaimsDrivers";

const CLAIMS = { data_quality_status: "Analytics Ready", advisory_blocked: false, caveats: [],
  formula: "incurred = paid + outstanding", numerator: 5400000, denominator: 120, source_tables: ["claim"],
  value: { claim_count: 120, average_claim_size: 45000, incurred: 5400000, paid: 5000000, outstanding: 400000,
    paid_outstanding_ratio: 12.5, cashless_count: 80, reimbursement_count: 40, open_claims: 10, closed_claims: 110,
    status_split: { "Settled Fully": 100, "Under Process": 20 } } };
const LARGE = { data_quality_status: "Analytics Ready", value: { large_claim_count: 2, large_claim_incurred: 2400000, large_claim_incurred_share: 0.44 } };
const RELATION = { data_quality_status: "Analytics Ready", value: { groups: [
  { key: "Self", count: 60, incurred: 3000000, incurred_share: 0.55 },
  { key: "Spouse", count: 40, incurred: 1500000, incurred_share: 0.28 }], parent_claim_share: 0.1 } };
const HOSPITAL = { data_quality_status: "Analytics Ready", value: { top_hospitals: [
  { key: "Apollo", count: 30, incurred: 2000000, incurred_share: 0.37 }], top_hospital_concentration: 0.37, network_count: 70, non_network_count: 50 } };
const AILMENT = { data_quality_status: "Analytics Ready", value: { top_ailments: [
  { key: "Cardiac", count: 20, incurred: 1800000, incurred_share: 0.33, recurring_indicator: true }] } };
const TRENDS = { data_quality_status: "Analytics Ready", value: { yoy: [{ paid_pct: 12, incurred_pct: 15, claim_count_pct: 8 }] } };
const ICR = { data_quality_status: "Analytics Ready", value: { operational_icr: 73 } };

function wire(overrides: Record<string, any> = {}) {
  const map: Record<string, any> = { claims: CLAIMS, "large-claims": LARGE, relation: RELATION,
    hospital: HOSPITAL, ailment: AILMENT, trends: TRENDS, icr: ICR, ...overrides };
  (api.metric as any).mockImplementation((n: string) => Promise.resolve(map[n]));
}
beforeEach(() => (api.metric as any).mockReset?.());

describe("Claims Drivers (governed, API-driven — Option A)", () => {
  it("renders frequency vs severity + relation/hospital/ailment breakdowns from the API", async () => {
    wire();
    renderWithProviders(<ClaimsDrivers />);
    await waitFor(() => expect(screen.getByTestId("cd-relation")).toBeInTheDocument());
    expect(screen.getByTestId("cd-hospital")).toBeInTheDocument();
    expect(screen.getByTestId("cd-ailment")).toBeInTheDocument();
    expect(screen.getByText("Self")).toBeInTheDocument();
    expect(screen.getByText("Apollo")).toBeInTheDocument();
    expect(screen.getByText("Cardiac")).toBeInTheDocument();
    // large-claim effect share rendered as a percent from the API fraction
    expect(screen.getByTestId("cd-large-count")).toHaveTextContent("2");
  });

  it("shows a premium governed empty state when a dimension has no rows", async () => {
    wire({ relation: { data_quality_status: "Analytics Ready", value: { groups: [] } } });
    renderWithProviders(<ClaimsDrivers />);
    await waitFor(() => expect(screen.getByTestId("cd-hospital")).toBeInTheDocument());
    expect(screen.queryByTestId("cd-relation")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Not available in scope/i).length).toBeGreaterThan(0);
  });

  it("Restricted claims → advisory-blocked; Conditional → caveats", async () => {
    wire({ claims: { ...CLAIMS, advisory_blocked: true, data_quality_status: "Restricted" } });
    const { unmount } = renderWithProviders(<ClaimsDrivers />);
    await waitFor(() => expect(screen.getByTestId("restricted-banner")).toBeInTheDocument());
    unmount();
    wire({ claims: { ...CLAIMS, data_quality_status: "Conditional", caveats: ["Written premium basis used."] } });
    renderWithProviders(<ClaimsDrivers />);
    await waitFor(() => expect(screen.getAllByTestId("caveat-banner").length).toBeGreaterThan(0));
  });

  it("evidence drawer opens and the 4-questions block is present", async () => {
    wire();
    renderWithProviders(<ClaimsDrivers />);
    await waitFor(() => expect(screen.getByTestId("four-questions")).toBeInTheDocument());
    // two governed "View evidence" affordances exist (KPI card + section); either opens the drawer
    await userEvent.click(screen.getAllByText(/View evidence/i)[0]);
    await waitFor(() => expect(screen.getByTestId("evidence-drawer")).toHaveTextContent("incurred = paid + outstanding"));
  });
});
