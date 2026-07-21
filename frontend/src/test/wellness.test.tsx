import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return { ...actual, api: { ...actual.api, wellness: vi.fn() } };
});
import { api } from "../lib/api";
import { WellnessOverview, WellnessOpportunity, WellnessPlanner, WellnessRoi } from "../pages/Wellness";

// Governed /wellness/* response shapes (Sprint 12). Rendered directly — no browser math.
const OVERVIEW = {
  kind: "wellness_overview", recommendation: "3 wellness categor(ies) identified from claim patterns",
  summary: "Population wellness posture derived from governed claim patterns; top category: Metabolic health.",
  confidence: "high", confidence_score: 0.8, reliability: "high",
  caveats: [], restricted: false, advisory_blocked: false, data_quality_status: "Analytics Ready",
  suppressed_cohorts: 0, k_anonymity_min_cohort_size: 5,
  population: { total_claims: 18, total_incurred: 1400000 },
  preventable_incurred: 1000000, supportive_incurred: 400000,
  categories_present: [{ category_id: "metabolic", label: "Metabolic health (diabetes / endocrine)", claim_count: 6, incurred: 600000, share: 0.4286, preventable: true, recurring: true }],
  chronic_recurring_categories: ["Metabolic health (diabetes / endocrine)"],
  engagement_baseline: { status: "pending", note: "No wellness engagement / participation data ingested yet." },
};

const RECS = {
  kind: "wellness_recommendations", recommendation: "Metabolic health program: diabetes-risk screening camps.",
  summary: "Claim-pattern-based wellness recommendations.", confidence: "high", confidence_score: 0.8, reliability: "high",
  caveats: [], restricted: false, advisory_blocked: false, data_quality_status: "Analytics Ready",
  suppressed_cohorts: 1, k_anonymity_min_cohort_size: 5,
  recommendations: [{
    category_id: "metabolic", label: "Metabolic health wellness opportunity", ailment_category: "Metabolic health (diabetes / endocrine)",
    affected_cohort: { level: "cohort", basis: "claims mapped", claim_count: 6, recurring: true, note: "Cohort-level only; no individual employee is targeted or identified." },
    claim_driver: { top_diagnosis_codes: ["E11"], recurring: true },
    potential_impact: { incurred: 600000, incurred_share: 0.4286, label: "estimate", basis: "share of portfolio incurred" },
    suggested_intervention: "Metabolic health program: diabetes-risk screening camps, nutrition and lifestyle coaching.",
    employer_impact: { note: "Reducing preventable claims can ease renewal cost — scenario estimate, not a guaranteed saving.", preventable: true },
    employee_impact: { note: "Cohort-level, voluntary and confidential wellness support; no individual targeting; no medical diagnosis advice.", sensitive: false },
    roi_tracking_basis: { metric: "pre/post incurred", label: "estimate / tracking basis — NOT a guaranteed saving" },
    confidence: "high", reliability: "high",
    next_best_action: { explanation: "Scope and launch: Metabolic health program for the affected cohort." }, caveats: [],
  }],
  primary_recommendation: {},
};

const PLANNER = {
  kind: "wellness_planner", recommendation: "Wellness plan foundation (1 sequenced intervention(s))",
  summary: "A governed planning scaffold sequenced from wellness opportunities.", confidence: "high", confidence_score: 0.8, reliability: "high",
  caveats: [], restricted: false, advisory_blocked: false, data_quality_status: "Analytics Ready",
  suppressed_cohorts: 0, k_anonymity_min_cohort_size: 5,
  plan: [{ sequence: 1, category: "Metabolic health (diabetes / endocrine)", intervention: "Metabolic health program: diabetes-risk screening camps.", target_cohort: { claim_count: 6, level: "cohort" }, milestone: "Quarter 1 of the pre-renewal cycle", owner: "TBD — assign during program setup" }],
  foundation: true, basis: "Sequenced from governed wellness opportunities across the renewal timeline.",
};

const ROI = {
  kind: "wellness_roi_impact", recommendation: "Wellness ROI & impact tracking foundation",
  summary: "Baseline tracking basis established per wellness category.", confidence: "high", confidence_score: 0.8, reliability: "high",
  caveats: [], restricted: false, advisory_blocked: false, data_quality_status: "Analytics Ready",
  suppressed_cohorts: 0, k_anonymity_min_cohort_size: 5,
  tracking: [{ category: "Metabolic health (diabetes / endocrine)", baseline: { incurred: 600000, claim_count: 6 }, tracking_metric: "pre/post incurred and claim frequency", label: "estimate / tracking basis — NOT a guaranteed saving", actuals_status: "pending — no post-period engagement/outcome data ingested yet" }],
  foundation: true, roi_label: "estimate / tracking basis — not a guaranteed saving", actuals_status: "pending",
};

beforeEach(() => (api.wellness as any).mockReset());

describe("Wellness Intelligence sub-tabs (single-sourced from /wellness/*)", () => {
  it("Overview renders API posture, categories and engagement baseline", async () => {
    (api.wellness as any).mockResolvedValue(OVERVIEW);
    renderWithProviders(<WellnessOverview />);
    await waitFor(() => expect(screen.getByTestId("wo-categories")).toBeInTheDocument());
    expect(api.wellness).toHaveBeenCalledWith("overview");
    expect(screen.getByTestId("wo-categories")).toHaveTextContent(/Metabolic health/);
    expect(screen.getByTestId("wo-preventable")).toHaveTextContent("10,00,000");
    expect(screen.getByTestId("wo-engagement")).toHaveTextContent(/pending/i);
  });

  it("Opportunity & Recommendation renders ranked opportunities with interventions + privacy note", async () => {
    (api.wellness as any).mockResolvedValue(RECS);
    renderWithProviders(<WellnessOpportunity />);
    await waitFor(() => expect(screen.getByTestId("or-opportunities")).toBeInTheDocument());
    expect(api.wellness).toHaveBeenCalledWith("recommendations");
    expect(screen.getByTestId("or-item")).toHaveTextContent(/Metabolic health program/i);
    expect(screen.getByTestId("or-item")).toHaveTextContent(/Scope and launch/i);      // next best action
    expect(screen.getByTestId("or-item")).toHaveTextContent(/not a guaranteed saving/i);
    expect(screen.getByTestId("wellness-privacy")).toHaveTextContent(/k-anonymity/i);   // suppression surfaced
  });

  it("Planner renders API plan items and foundation state", async () => {
    (api.wellness as any).mockResolvedValue(PLANNER);
    renderWithProviders(<WellnessPlanner />);
    await waitFor(() => expect(screen.getByTestId("wp-plan")).toBeInTheDocument());
    expect(screen.getByTestId("wp-foundation")).toBeInTheDocument();
    expect(screen.getByTestId("wp-plan")).toHaveTextContent(/Metabolic health/);
  });

  it("ROI renders tracking basis, estimate label and pending actuals (no guaranteed saving)", async () => {
    (api.wellness as any).mockResolvedValue(ROI);
    renderWithProviders(<WellnessRoi />);
    await waitFor(() => expect(screen.getByTestId("roi-label")).toHaveTextContent(/not a guaranteed saving/i));
    expect(screen.getByTestId("roi-actuals")).toHaveTextContent(/pending/i);
    expect(screen.getByTestId("roi-tracking")).toHaveTextContent(/Metabolic health/);
  });

  it("Restricted response shows advisory-blocked; Conditional shows caveats", async () => {
    (api.wellness as any).mockResolvedValue({ ...OVERVIEW, recommendation: "Advisory blocked", advisory_blocked: true, restricted: true, data_quality_status: "Restricted", caveats: ["Dataset is RESTRICTED; advisory wellness overview is blocked."] });
    const { unmount } = renderWithProviders(<WellnessOverview />);
    await waitFor(() => expect(screen.getByTestId("restricted-banner")).toBeInTheDocument());
    unmount();
    (api.wellness as any).mockResolvedValue({ ...OVERVIEW, data_quality_status: "Conditional", caveats: ["Written premium basis used."] });
    renderWithProviders(<WellnessOverview />);
    await waitFor(() => expect(screen.getByTestId("caveat-banner")).toHaveTextContent(/written premium/i));
  });

  it("small-cohort suppression shows a privacy-safe message", async () => {
    (api.wellness as any).mockResolvedValue({ ...OVERVIEW, suppressed_cohorts: 2 });
    renderWithProviders(<WellnessOverview />);
    await waitFor(() => expect(screen.getByTestId("wellness-privacy")).toBeInTheDocument());
    expect(screen.getByTestId("wellness-privacy")).toHaveTextContent(/no individual/i);
  });

  it("missing / pending response shows a premium governed pending state", async () => {
    (api.wellness as any).mockResolvedValue({ recommendation: "Pending", data_quality_status: "No Data" });
    renderWithProviders(<WellnessOpportunity />);
    await waitFor(() => expect(screen.getByText(/pending governed data/i)).toBeInTheDocument());
    expect(screen.queryByTestId("or-opportunities")).not.toBeInTheDocument();
  });
});
