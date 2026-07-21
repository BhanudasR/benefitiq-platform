import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { Shell } from "../components/Shell";
import { TABS, TAB_GROUPS, RENEWAL_SUBTABS, WELLNESS_SUBTABS } from "../nav/tabs";
import { renderWithProviders } from "./util";

describe("navigation shell", () => {
  it("renders exactly 20 top-level tabs in the sidebar", () => {
    renderWithProviders(<Shell />);
    expect(TABS).toHaveLength(20);
    for (const t of TABS) {
      expect(screen.getByTestId(`nav-${t.id}`)).toBeInTheDocument();
    }
  });

  it("all 20 tabs have unique routes", () => {
    const paths = new Set(TABS.map((t) => t.path));
    expect(paths.size).toBe(20);
  });

  it("has exactly the 6 demo groups, Data Trust & Admin last", () => {
    expect(TAB_GROUPS).toHaveLength(6);
    expect(TAB_GROUPS[TAB_GROUPS.length - 1]).toBe("Data Trust & Admin");
  });

  it("Data Onboarding and Source Evidence are the final two tabs", () => {
    const lastTwo = TABS.slice(-2).map((t) => t.id);
    expect(lastTwo).toEqual(["data-onboarding", "source-evidence"]);
  });

  it("Renewal Intelligence has exactly the 6 demo sub-tabs (Sandbox + Balanced are NOT main tabs)", () => {
    const renewal = TABS.find((t) => t.id === "renewal")!;
    expect(renewal.subTabs).toHaveLength(6);
    expect(renewal.subTabs!.map((s) => s.label)).toEqual([
      "Overview", "Claims Drivers", "Benefit & Savings Sandbox",
      "Balanced Benefit Design", "Recommended Strategy", "Placement Trigger / Next Best Action",
    ]);
    expect(RENEWAL_SUBTABS).toHaveLength(6);
    // the two former main tabs must no longer be top-level
    expect(TABS.find((t) => t.id === "savings-sandbox")).toBeUndefined();
    expect(TABS.find((t) => t.id === "balanced-design")).toBeUndefined();
  });

  it("Benefits & Benchmarking is one main tab with exactly 7 sub-tabs", () => {
    const bm = TABS.find((t) => t.id === "benchmarking")!;
    expect(bm.subTabs).toHaveLength(7);
    expect(bm.subTabs!.map((s) => s.label)).toEqual([
      "Benchmark Overview", "Benefit Design Features", "Policy Terms Comparison",
      "Market / Peer Comparison", "Benefit Gap Analysis", "Discussion Points", "Evidence / Export",
    ]);
    expect(TABS).toHaveLength(20);   // still one of the 20 main tabs
  });

  it("Placement Intelligence is one main tab with exactly 7 sub-tabs", () => {
    const pm = TABS.find((t) => t.id === "placement")!;
    expect(pm.subTabs).toHaveLength(7);
    expect(pm.subTabs!.map((s) => s.label)).toEqual([
      "Placement Overview", "Incumbent Defence", "RFQ Readiness", "Quote Comparison",
      "Terms Comparison", "Recommendation", "Evidence",
    ]);
    expect(TABS).toHaveLength(20);   // still one of the 20 main tabs
  });

  it("Wellness Intelligence has exactly the 4 demo sub-tabs", () => {
    const wellness = TABS.find((t) => t.id === "wellness")!;
    expect(wellness.subTabs).toHaveLength(4);
    expect(wellness.subTabs!.map((s) => s.label)).toEqual([
      "Wellness Overview", "Opportunity & Recommendation", "Wellness Planner", "ROI & Impact Tracking",
    ]);
    expect(WELLNESS_SUBTABS).toHaveLength(4);
  });
});
