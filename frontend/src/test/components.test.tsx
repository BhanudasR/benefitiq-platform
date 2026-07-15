import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiCard, EvidencePanel, DataQualityBadge, Skeleton, EmptyState, ErrorState } from "../components/ui/primitives";

describe("design-system primitives", () => {
  it("KPI card renders the API-provided value verbatim", () => {
    render(<KpiCard label="Operational ICR" value="73.64%" />);
    expect(screen.getByTestId("kpi-value")).toHaveTextContent("73.64%");
  });
  it("evidence panel renders formula, source tables and caveats", () => {
    render(<EvidencePanel evidence={{
      formula: "incurred / earned x 100", numerator: 1, denominator: 2,
      source_tables: ["claim", "policy_version"], caveats: ["written basis used"],
      data_quality_status: "Conditional",
    }} />);
    expect(screen.getByTestId("evidence-panel")).toHaveTextContent("incurred / earned x 100");
    expect(screen.getAllByTestId("source-chip").length).toBe(2);
    expect(screen.getByTestId("caveat-banner")).toHaveTextContent("written basis used");
  });
  it("data-quality badge, skeleton, empty and error states render", () => {
    const { rerender } = render(<DataQualityBadge status="Analytics Ready" />);
    expect(screen.getByTestId("dq-badge")).toHaveTextContent("Analytics Ready");
    rerender(<Skeleton />); expect(screen.getByTestId("skeleton")).toBeInTheDocument();
    rerender(<EmptyState />); expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    rerender(<ErrorState />); expect(screen.getByTestId("error-state")).toBeInTheDocument();
  });
});
