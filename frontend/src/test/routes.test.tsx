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
    terms: vi.fn().mockResolvedValue({ terms: [] }) } };
});

describe("all 22 tab routes render", () => {
  it("every tab has a unique route and renders without crashing", () => {
    expect(TABS).toHaveLength(22);
    expect(new Set(TABS.map((t) => t.path)).size).toBe(22);
  });
  for (const t of TABS) {
    it(`route renders: ${t.label}`, () => {
      renderWithProviders(<AppRoutes />, { route: t.path });
      // the label always appears (sidebar nav link + page header)
      expect(screen.getAllByText(t.label).length).toBeGreaterThan(0);
    });
  }
});
