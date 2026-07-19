import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return { ...actual, api: { ...actual.api, recommendation: vi.fn() } };
});
import { api } from "../lib/api";
import { RecommendedStrategy } from "../pages/RecommendedStrategy";

// Governed /recommendations/renewal response shape (Sprint 10). The page renders these
// fields directly — it never computes the stance/decision in the browser.
const RENEWAL = {
  kind: "renewal", recommendation: "Defend", stance: "Defend",
  summary: "Renewal stance: Defend. Operational ICR 73.64% on written premium.",
  confidence: "high", confidence_score: 1.0, reliability: "high",
  reasoning: [
    { rule: "icr_comfortable", explanation: "Operational ICR 73.64% is at or below the comfortable band (100%).", evidence: {} },
    { rule: "adverse_trend", explanation: "Adverse trend: ICR moved 20% year-on-year.", evidence: {} },
  ],
  evidence_references: [{ source: "/metrics/icr", field: "operational_icr", value: 73.64 }],
  source_metrics_used: ["/metrics/icr", "/metrics/trends", "/metrics/large-claims", "/simulation/adjusted-icr", "/simulation/balanced-design"],
  caveats: [], restricted: false, advisory_blocked: false, data_quality_status: "Analytics Ready",
  next_best_action: { rule: "defend_one_off", explanation: "Defend renewal using one-off claim evidence.", evidence: {} },
  talking_points: ["Operational ICR is 73.64% on written premium (unchanged).", "Defendable ICR is 19.09% — a defensibility view, not a replacement."],
  employer_impact: { defensible_levers: [{ lever: "parent_copay", expected_saving: 60000, classification: "Good option" }], note: "Expected savings are scenario evidence, not guaranteed savings." },
  employee_impact: { high_friction_levers: [{ lever: "copay", classification: "High employee impact" }], note: "Levers with employee friction shift cost to members." },
  operational_icr: 73.64, adjusted_icr: 19.09, adjusted_icr_note: "Adjusted / Defendable ICR never replaces Operational ICR.",
  config_version: "v1-default", threshold_basis: "governed default thresholds",
};

beforeEach(() => (api.recommendation as any).mockReset());

describe("Recommended Strategy (single-sourced from /recommendations/renewal)", () => {
  it("renders API stance, confidence/reliability, reasoning, talking points and impacts", async () => {
    (api.recommendation as any).mockResolvedValue(RENEWAL);
    renderWithProviders(<RecommendedStrategy />);
    await waitFor(() => expect(screen.getByTestId("rs-stance")).toHaveTextContent("Defend"));
    expect(api.recommendation).toHaveBeenCalledWith("renewal");
    expect(screen.getByTestId("rs-confidence")).toHaveTextContent("high");
    expect(screen.getByTestId("rs-confidence")).toHaveTextContent("high");        // reliability shown too
    expect(screen.getByTestId("rs-reasoning")).toHaveTextContent(/comfortable band/i);
    expect(screen.getByTestId("rs-talking-points")).toHaveTextContent(/unchanged/i);
    expect(screen.getByTestId("rs-employer")).toHaveTextContent(/parent copay/i);
    expect(screen.getByTestId("rs-employee")).toHaveTextContent("copay");
    expect(screen.getByTestId("rs-nba")).toHaveTextContent(/one-off claim evidence/i);
    expect(screen.getByTestId("rs-source-metrics")).toHaveTextContent("/metrics/icr");
  });

  it("renders Operational and Adjusted / Defendable ICR separately from the API", async () => {
    (api.recommendation as any).mockResolvedValue(RENEWAL);
    renderWithProviders(<RecommendedStrategy />);
    await waitFor(() => expect(screen.getByTestId("rs-op-icr")).toHaveTextContent("73.64%"));
    expect(screen.getByTestId("rs-adj-icr")).toHaveTextContent("19.09%");
    expect(screen.getByTestId("rs-op-icr")).not.toBe(screen.getByTestId("rs-adj-icr"));
  });

  it("does not compute a stance — a No-Data response shows a premium pending state", async () => {
    (api.recommendation as any).mockResolvedValue({ recommendation: "Monitor", data_quality_status: "No Data", operational_icr: null });
    renderWithProviders(<RecommendedStrategy />);
    await waitFor(() => expect(screen.getByText(/Recommendation pending governed data/i)).toBeInTheDocument());
    expect(screen.queryByTestId("rs-stance")).not.toBeInTheDocument();
  });

  it("Restricted response shows advisory-blocked; Conditional shows caveats", async () => {
    (api.recommendation as any).mockResolvedValue({ ...RENEWAL, recommendation: "Advisory blocked",
      advisory_blocked: true, restricted: true, data_quality_status: "Restricted",
      caveats: ["Dataset is RESTRICTED; advisory interpretation is blocked."] });
    const { unmount } = renderWithProviders(<RecommendedStrategy />);
    await waitFor(() => expect(screen.getByTestId("restricted-banner")).toBeInTheDocument());
    unmount();
    (api.recommendation as any).mockResolvedValue({ ...RENEWAL, data_quality_status: "Conditional",
      caveats: ["Written premium basis used."] });
    renderWithProviders(<RecommendedStrategy />);
    await waitFor(() => expect(screen.getByTestId("caveat-banner")).toHaveTextContent(/written premium/i));
  });

  it("evidence drawer opens", async () => {
    (api.recommendation as any).mockResolvedValue(RENEWAL);
    renderWithProviders(<RecommendedStrategy />);
    await waitFor(() => expect(screen.getByTestId("rs-stance")).toBeInTheDocument());
    await userEvent.click(screen.getByText(/View evidence/i));
    await waitFor(() => expect(screen.getByTestId("evidence-drawer")).toBeInTheDocument());
  });
});
