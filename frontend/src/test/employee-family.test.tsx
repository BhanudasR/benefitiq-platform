import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return { ...actual, api: { ...actual.api, metric: vi.fn() } };
});
import { api } from "../lib/api";
import { EmployeeFamily } from "../pages/EmployeeFamily";

function wire(map: any) {
  (api.metric as any).mockImplementation((name: string) => Promise.resolve(map[name] ?? { data_quality_status: "No Data", value: {} }));
}
const RELATION = { data_quality_status: "Analytics Ready", caveats: [], formula: "group by relationship", value: {
  groups: [
    { key: "Self", count: 60, incurred: 3000000, average_claim_size: 50000, incurred_share: 0.55 },
    { key: "Spouse", count: 40, incurred: 1500000, average_claim_size: 37500, incurred_share: 0.28 },
    { key: "Unknown", count: 5, incurred: 100000, average_claim_size: 20000, incurred_share: 0.02 }],
  parent_claim_share: 0.10 } };

beforeEach(() => (api.metric as any).mockReset());

describe("Employee & Family dashboard (governed /metrics/relation)", () => {
  it("renders KPIs, charts and drill table from governed API values", async () => {
    wire({ relation: RELATION });
    renderWithProviders(<EmployeeFamily />);
    await waitFor(() => expect(screen.getByTestId("ef-kpis")).toBeInTheDocument());
    expect(api.metric).toHaveBeenCalledWith("relation");
    expect(screen.getByTestId("ef-kpi-top")).toHaveTextContent("Self");
    expect(screen.getByTestId("ef-kpi-parent")).toHaveTextContent("10%");     // parent_claim_share fraction → percent
    expect(screen.getByTestId("ef-bars")).toHaveTextContent("Self");
    expect(screen.getByTestId("ef-donut")).toHaveTextContent("Spouse");
    expect(screen.getByTestId("ef-table")).toHaveTextContent("Spouse");
    // Unknown is surfaced via caveats, not merged into a relationship group
    expect(screen.getByTestId("ef-table")).not.toHaveTextContent("Unknown");
  });

  it("shows 'Not available' when parent-claim share is absent", async () => {
    wire({ relation: { ...RELATION, value: { groups: RELATION.value.groups } } });
    renderWithProviders(<EmployeeFamily />);
    await waitFor(() => expect(screen.getByTestId("ef-kpi-parent")).toBeInTheDocument());
    expect(screen.getByTestId("ef-kpi-parent")).toHaveTextContent(/Not available/i);
  });

  it("opens the evidence drawer", async () => {
    wire({ relation: RELATION });
    renderWithProviders(<EmployeeFamily />);
    await waitFor(() => expect(screen.getByTestId("ef-bars")).toBeInTheDocument());
    await userEvent.click(screen.getAllByText(/View evidence/i)[0]);
    await waitFor(() => expect(screen.getByTestId("evidence-drawer")).toBeInTheDocument());
  });

  it("No-Data renders a premium empty state", async () => {
    wire({ relation: { data_quality_status: "No Data", value: {} } });
    renderWithProviders(<EmployeeFamily />);
    await waitFor(() => expect(screen.getByTestId("empty-state")).toBeInTheDocument());
  });
});
