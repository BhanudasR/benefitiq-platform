import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return { ...actual, api: { ...actual.api, metric: vi.fn() } };
});
import { api } from "../lib/api";
import { Demographics } from "../pages/Demographics";
import { SIUtilization } from "../pages/SIUtilization";

function wire(map: any) {
  (api.metric as any).mockImplementation((name: string) => Promise.resolve(map[name] ?? { data_quality_status: "No Data", value: {} }));
}
const NODATA = { data_quality_status: "No Data", value: {} };

const DEMO = { data_quality_status: "Analytics Ready", caveats: [], formula: "age bands from member.age", value: {
  member_count: 5, employee_count: 3, dependent_count: 2, dependent_ratio: 0.6667,
  senior_count: 1, senior_share: 0.25, senior_definition_age: 60, average_age: 38.8,
  age_bands: [{ band: "0-17", count: 1 }, { band: "18-25", count: 0 }, { band: "36-45", count: 2 }, { band: "60+", count: 1 }],
  gender_distribution: [{ key: "Male", count: 2, share: 0.5 }, { key: "Female", count: 2, share: 0.5 }],
  relationship_distribution: [{ key: "Self", count: 3, share: 0.6 }, { key: "Spouse", count: 1, share: 0.2 }],
  missing_age: 1, missing_gender: 1 } };
const DEMO_NOGENDER = { ...DEMO, value: { ...DEMO.value, gender_distribution: null, missing_gender: 5 } };

const SI = { data_quality_status: "Analytics Ready", caveats: [], formula: "utilization = incurred / SI", value: {
  member_count: 5, average_utilization: 0.35, exhausted_count: 1, exhausted_share: 0.25,
  high_utilization_count: 1, underinsured_signal_count: 1, overinsured_signal_count: 2,
  family_floater_available: true, missing_si: 1, unlinked_claims: 1,
  si_bands: [{ band: "<3L", count: 0 }, { band: "5-10L", count: 4 }],
  utilization_bands: [{ band: "0%", count: 2 }, { band: "1-25%", count: 1 }, { band: ">=100% (exhausted)", count: 1 }] } };
const SI_NOFLOAT = { ...SI, value: { ...SI.value, family_floater_available: false } };

beforeEach(() => (api.metric as any).mockReset());

describe("Demographics dashboard (governed /metrics/demographics)", () => {
  it("renders KPIs and charts from governed API values", async () => {
    wire({ demographics: DEMO });
    renderWithProviders(<Demographics />);
    await waitFor(() => expect(screen.getByTestId("demo-kpis")).toBeInTheDocument());
    expect(api.metric).toHaveBeenCalledWith("demographics");
    expect(screen.getByTestId("demo-kpi-senior")).toHaveTextContent("25%");
    expect(screen.getByTestId("demo-kpi-avgage")).toHaveTextContent("38.8");
    expect(screen.getByTestId("demo-age")).toBeInTheDocument();
    expect(screen.getByTestId("demo-gender")).toHaveTextContent("Male");
    expect(screen.getByTestId("demo-relationship")).toHaveTextContent("Self");
  });

  it("gender renders 'Not available' when the API returns null", async () => {
    wire({ demographics: DEMO_NOGENDER });
    renderWithProviders(<Demographics />);
    await waitFor(() => expect(screen.getByTestId("demo-gender")).toBeInTheDocument());
    expect(screen.getByTestId("demo-gender")).toHaveTextContent(/Not available/i);
  });

  it("opens the evidence drawer", async () => {
    wire({ demographics: DEMO });
    renderWithProviders(<Demographics />);
    await waitFor(() => expect(screen.getByTestId("demo-age")).toBeInTheDocument());
    await userEvent.click(screen.getAllByText(/View evidence/i)[0]);
    await waitFor(() => expect(screen.getByTestId("evidence-drawer")).toBeInTheDocument());
  });

  it("No-Data renders a premium empty state", async () => {
    wire({ demographics: NODATA });
    renderWithProviders(<Demographics />);
    await waitFor(() => expect(screen.getByTestId("empty-state")).toBeInTheDocument());
  });
});

describe("SI Utilization dashboard (governed /metrics/si-utilization)", () => {
  it("renders KPIs, bands and signals from governed API values", async () => {
    wire({ "si-utilization": SI });
    renderWithProviders(<SIUtilization />);
    await waitFor(() => expect(screen.getByTestId("si-kpis")).toBeInTheDocument());
    expect(api.metric).toHaveBeenCalledWith("si-utilization");
    expect(screen.getByTestId("si-kpi-avgutil")).toHaveTextContent("35%");
    expect(screen.getByTestId("si-kpi-exhausted")).toHaveTextContent("1");
    expect(screen.getByTestId("si-gauge")).toHaveTextContent("35%");
    expect(screen.getByTestId("si-bands")).toBeInTheDocument();
    expect(screen.getByTestId("si-util-bands")).toBeInTheDocument();
    expect(screen.getByTestId("si-signals")).toHaveTextContent(/Overinsured signal/i);
    expect(screen.getByTestId("si-floater")).toHaveTextContent(/Available/i);
  });

  it("family floater shows 'Not available' when absent", async () => {
    wire({ "si-utilization": SI_NOFLOAT });
    renderWithProviders(<SIUtilization />);
    await waitFor(() => expect(screen.getByTestId("si-floater")).toBeInTheDocument());
    expect(screen.getByTestId("si-floater")).toHaveTextContent(/Not available/i);
  });

  it("opens the evidence drawer", async () => {
    wire({ "si-utilization": SI });
    renderWithProviders(<SIUtilization />);
    await waitFor(() => expect(screen.getByTestId("si-kpis")).toBeInTheDocument());
    await userEvent.click(screen.getAllByText(/View evidence/i)[0]);
    await waitFor(() => expect(screen.getByTestId("evidence-drawer")).toBeInTheDocument());
  });

  it("No-Data renders a premium empty state", async () => {
    wire({ "si-utilization": NODATA });
    renderWithProviders(<SIUtilization />);
    await waitFor(() => expect(screen.getByTestId("empty-state")).toBeInTheDocument());
  });
});
