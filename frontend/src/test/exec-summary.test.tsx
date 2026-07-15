import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return { ...actual, api: { ...actual.api, metric: vi.fn() } };
});
import { api } from "../lib/api";
import { ExecutiveSummary } from "../pages/ExecutiveSummary";

const ANALYTICS = {
  portfolio: { data_quality_status: "Analytics Ready", value: { total_premium: 2200000, premium_basis: "written", lives_covered: 1240, employee_count: 980 } },
  claims: { data_quality_status: "Analytics Ready", value: { claim_count: 42 } },
  icr: { data_quality_status: "Analytics Ready", advisory_blocked: false, caveats: [], premium_basis: "written",
         formula: "incurred/earned x100", numerator: 1620000, denominator: 2200000, source_tables: ["claim", "policy_version"],
         value: { operational_icr: 73.64, incurred: 1620000, earned_premium: 2200000 } },
};

function wire(map: any) {
  (api.metric as any).mockImplementation((name: string) => Promise.resolve(map[name]));
}

beforeEach(() => (api.metric as any).mockReset());

describe("Executive Summary (API-driven)", () => {
  it("renders KPI values that come only from the API", async () => {
    wire(ANALYTICS);
    renderWithProviders(<ExecutiveSummary />);
    await waitFor(() => expect(screen.getByText("73.64%")).toBeInTheDocument());
    expect(screen.getByText("₹22,00,000")).toBeInTheDocument();     // total premium (formatted API value)
    // "1,240" appears in both the KPI card and the decision summary (both from the API value)
    expect(screen.getAllByText(/1,240/).length).toBeGreaterThan(0); // lives covered
    // evidence appears on demand and shows the API formula
    await userEvent.click(screen.getByRole("button", { name: /View evidence/i }));
    await waitFor(() => expect(screen.getByTestId("evidence-panel")).toHaveTextContent("incurred/earned x100"));
  });

  it("Restricted response renders the advisory-blocked banner", async () => {
    wire({ ...ANALYTICS, icr: { ...ANALYTICS.icr, data_quality_status: "Restricted", advisory_blocked: true,
      caveats: ["Dataset is RESTRICTED."] } });
    renderWithProviders(<ExecutiveSummary />);
    await waitFor(() => expect(screen.getByTestId("restricted-banner")).toBeInTheDocument());
  });

  it("Conditional response renders caveats", async () => {
    wire({ ...ANALYTICS, icr: { ...ANALYTICS.icr, data_quality_status: "Conditional",
      caveats: ["Written premium used (basis='written')."] } });
    renderWithProviders(<ExecutiveSummary />);
    await waitFor(() => expect(screen.getByTestId("caveat-banner")).toHaveTextContent(/written premium/i));
  });

  it("No-Data renders a premium empty state", async () => {
    wire({ portfolio: { data_quality_status: "No Data", value: {} },
           claims: { data_quality_status: "No Data", value: {} },
           icr: { data_quality_status: "No Data", value: {} } });
    renderWithProviders(<ExecutiveSummary />);
    await waitFor(() => expect(screen.getByTestId("empty-state")).toBeInTheDocument());
  });
});
