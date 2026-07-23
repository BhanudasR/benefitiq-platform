import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { AppRoutes } from "../routes";
import { TABS } from "../nav/tabs";
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
    benchmarking: vi.fn().mockResolvedValue(noData),
    placement: vi.fn().mockResolvedValue(noData),
    portfolio: vi.fn().mockResolvedValue(noData),
    dataQuality: vi.fn().mockResolvedValue(noData) } };
});

describe("all 20 top-level tab routes render", () => {
  it("every tab has a unique route and renders without crashing", () => {
    expect(TABS).toHaveLength(20);
    expect(new Set(TABS.map((t) => t.path)).size).toBe(20);
  });
  for (const t of TABS) {
    it(`route renders: ${t.label}`, () => {
      renderWithProviders(<AppRoutes />, { route: t.path });
      // the label always appears (sidebar nav link + page/shell header)
      expect(screen.getAllByText(t.label).length).toBeGreaterThan(0);
    });
  }
});
