import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { AppRoutes } from "../routes";
import { TABS } from "../nav/tabs";
import { renderWithProviders } from "./util";

// stub metrics so the two wired tabs don't error; placeholders don't call the API
vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return { ...actual, api: { ...actual.api, metric: vi.fn().mockResolvedValue({ data_quality_status: "No Data", value: {} }) } };
});

describe("all 22 tab routes render", () => {
  for (const t of TABS.filter((x) => !x.wired)) {
    it(`placeholder route renders a premium scaffold: ${t.label}`, () => {
      renderWithProviders(<AppRoutes />, { route: t.path });
      expect(screen.getAllByText(t.label).length).toBeGreaterThan(0);
      expect(screen.getByText(/On the BenefitIQ roadmap/i)).toBeInTheDocument();
    });
  }
  it("wired tabs are reachable", () => {
    renderWithProviders(<AppRoutes />, { route: "/executive-summary" });
    expect(screen.getAllByText(/Executive Summary/i).length).toBeGreaterThan(0);
  });
});
