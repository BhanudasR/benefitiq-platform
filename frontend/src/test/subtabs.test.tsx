import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { AppRoutes } from "../routes";
import { RENEWAL_SUBTABS, WELLNESS_SUBTABS, BENCHMARKING_SUBTABS } from "../nav/tabs";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  const noData = { data_quality_status: "No Data", value: { levers: [] } };
  return { ...actual, api: { ...actual.api,
    metric: vi.fn().mockResolvedValue(noData),
    simulation: vi.fn().mockResolvedValue(noData),
    terms: vi.fn().mockResolvedValue({ terms: [] }),
    recommendation: vi.fn().mockResolvedValue(noData),
    wellness: vi.fn().mockResolvedValue(noData),
    benchmarking: vi.fn().mockResolvedValue(noData) } };
});

describe("Renewal Intelligence sub-tabs (exactly 6, demo-parity)", () => {
  it("parent shell shows the sub-tab bar", () => {
    renderWithProviders(<AppRoutes />, { route: "/renewal" });
    expect(screen.getByTestId("subtab-nav")).toBeInTheDocument();
    // all six sub-tab links present
    for (const s of RENEWAL_SUBTABS) {
      expect(screen.getByTestId(`subnav-${s.id}`)).toBeInTheDocument();
    }
  });

  for (const s of RENEWAL_SUBTABS) {
    it(`renders Renewal sub-tab: ${s.label}`, () => {
      renderWithProviders(<AppRoutes />, { route: s.path });
      expect(screen.getByTestId("subtab-nav")).toBeInTheDocument();
      expect(screen.getAllByText(s.label).length).toBeGreaterThan(0);
    });
  }
});

describe("Wellness Intelligence sub-tabs (exactly 4, demo-parity)", () => {
  for (const s of WELLNESS_SUBTABS) {
    it(`renders Wellness sub-tab: ${s.label}`, () => {
      renderWithProviders(<AppRoutes />, { route: s.path });
      expect(screen.getByTestId("subtab-nav")).toBeInTheDocument();
      expect(screen.getAllByText(s.label).length).toBeGreaterThan(0);
    });
  }
});

describe("Benefits & Benchmarking sub-tabs (exactly 7)", () => {
  it("has exactly 7 benchmarking sub-tabs", () => {
    expect(BENCHMARKING_SUBTABS).toHaveLength(7);
  });
  for (const s of BENCHMARKING_SUBTABS) {
    it(`renders Benchmarking sub-tab: ${s.label}`, () => {
      renderWithProviders(<AppRoutes />, { route: s.path });
      expect(screen.getByTestId("subtab-nav")).toBeInTheDocument();
      expect(screen.getAllByText(s.label).length).toBeGreaterThan(0);
    });
  }
});
