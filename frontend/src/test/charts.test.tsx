import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./util";
import {
  ChartFrame, KpiStat, Donut, BarH, BarV, StackedBar, Gauge, Sparkline, Quadrant, Heatmap,
} from "../components/ui/charts";

describe("Governed SVG chart kit (renders API-provided values only)", () => {
  it("Donut renders a legend from API values", () => {
    renderWithProviders(<Donut data={[{ label: "Cashless", value: 28 }, { label: "Reimbursement", value: 14 }]} centerValue="42" centerLabel="claims" />);
    expect(screen.getByTestId("chart-donut")).toHaveTextContent("Cashless");
    expect(screen.getByTestId("chart-donut")).toHaveTextContent("Reimbursement");
  });

  it("BarH renders labels and formatted API values", () => {
    renderWithProviders(<BarH data={[{ label: "Cardiac", value: 500000 }]} format={(v) => `₹${v}`} />);
    expect(screen.getByTestId("chart-barh")).toHaveTextContent("Cardiac");
    expect(screen.getByTestId("chart-barh")).toHaveTextContent("₹500000");
  });

  it("BarV and StackedBar render", () => {
    const { rerender } = renderWithProviders(<BarV data={[{ label: "A", value: 3 }, { label: "B", value: 6 }]} />);
    expect(screen.getByTestId("chart-barv")).toBeInTheDocument();
    rerender(<StackedBar rows={[{ label: "Incurred", segments: [{ label: "Paid", value: 90 }, { label: "Outstanding", value: 10 }] }]} />);
    expect(screen.getByTestId("chart-stacked")).toHaveTextContent("Paid");
  });

  it("Gauge renders the API value text", () => {
    renderWithProviders(<Gauge value={73.64} min={0} max={200} valueText="73.64%" label="ICR" />);
    expect(screen.getByTestId("chart-gauge")).toHaveTextContent("73.64%");
  });

  it("Gauge with no value shows a dash (no fabrication)", () => {
    renderWithProviders(<Gauge value={null} valueText={undefined} />);
    expect(screen.getByTestId("chart-gauge")).toHaveTextContent("—");
  });

  it("Sparkline and Quadrant and Heatmap render from API values", () => {
    const { rerender } = renderWithProviders(<Sparkline values={[68, 70, 73.64]} />);
    expect(screen.getByTestId("chart-sparkline")).toBeInTheDocument();
    rerender(<Quadrant points={[{ label: "Cardiac", x: 8, y: 62500 }]} />);
    expect(screen.getByTestId("chart-quadrant")).toHaveTextContent("Cardiac");
    rerender(<Heatmap cells={[{ x: 0, y: 0, value: 5 }]} xLabels={["Q1"]} yLabels={["Cardiac"]} />);
    expect(screen.getByTestId("chart-heatmap")).toHaveTextContent("Cardiac");
  });

  it("KpiStat renders the API value and an optional evidence button", async () => {
    let clicked = false;
    renderWithProviders(<KpiStat label="Operational ICR" value="73.64%" sub="Incurred" onEvidence={() => (clicked = true)} testid="kpi-x" />);
    expect(screen.getByTestId("kpistat-value")).toHaveTextContent("73.64%");
    await userEvent.click(screen.getByRole("button", { name: /View evidence/i }));
    expect(clicked).toBe(true);
  });

  it("ChartFrame shows a No-Data state when empty", () => {
    renderWithProviders(<ChartFrame title="X" empty emptyMessage="No governed data." testid="cf-empty"><div>hidden</div></ChartFrame>);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.queryByText("hidden")).not.toBeInTheDocument();
  });

  it("ChartFrame shows a caveat overlay and opens the evidence drawer", async () => {
    renderWithProviders(<ChartFrame title="X" caveats={["Written premium used."]} evidence={{ formula: "a/b" }} testid="cf"><div>body</div></ChartFrame>);
    expect(screen.getByTestId("chart-caveat")).toHaveTextContent(/written premium/i);
    await userEvent.click(screen.getByText(/View evidence/i));
    await waitFor(() => expect(screen.getByTestId("evidence-drawer")).toBeInTheDocument());
  });
});
