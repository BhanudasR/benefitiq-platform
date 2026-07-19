import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return { ...actual, api: { ...actual.api, recommendation: vi.fn() } };
});
import { api } from "../lib/api";
import { PlacementTrigger } from "../pages/PlacementTrigger";

// Governed /recommendations/placement-trigger response shape (Sprint 10). Rendered
// directly — the trigger decision is never computed in the browser.
const PLACEMENT = {
  kind: "placement_trigger", recommendation: "Defend incumbent", placement_triggered: "no",
  summary: "Defend incumbent. Incumbent defence is strong.",
  confidence: "high", confidence_score: 1.0, reliability: "high",
  incumbent_defence_score: 1.0, rfq_readiness: 0.06,
  trigger_reason: "Incumbent defence is strong (score 1.0 >= 0.65); defend the renewal rather than going to market.",
  negotiation_evidence: {
    operational_icr: 73.64, adjusted_icr: 19.09, large_claim_incurred_share: 0.74, large_claim_count: 1,
    one_off_claims: [{ claim_number: "CLM-3", policy_year: 2026, incurred: 1200000, one_off_review_candidate: true }],
    note: "Operational ICR is unchanged; Adjusted / Defendable ICR supports negotiation but never replaces it.",
  },
  reasoning: [{ rule: "incumbent_defence_score", explanation: "Incumbent-defence score 1.0 (weighted from one-off share, Adjusted ICR and ICR headroom).", evidence: {} }],
  next_best_action: { rule: "defend_one_off", explanation: "Defend renewal using one-off claim evidence.", evidence: {} },
  caveats: [], restricted: false, advisory_blocked: false, data_quality_status: "Analytics Ready",
  operational_icr: 73.64, adjusted_icr: 19.09,
};

beforeEach(() => (api.recommendation as any).mockReset());

describe("Placement Trigger / NBA (single-sourced from /recommendations/placement-trigger)", () => {
  it("renders the API trigger decision, scores, reason, evidence and next best action", async () => {
    (api.recommendation as any).mockResolvedValue(PLACEMENT);
    renderWithProviders(<PlacementTrigger />);
    await waitFor(() => expect(screen.getByTestId("pt-triggered")).toHaveTextContent("no"));
    expect(api.recommendation).toHaveBeenCalledWith("placement-trigger");
    expect(screen.getByTestId("pt-defence")).toHaveTextContent("1");
    expect(screen.getByTestId("pt-rfq")).toHaveTextContent("0.06");
    expect(screen.getByTestId("pt-reason")).toHaveTextContent(/defence is strong/i);
    expect(screen.getByTestId("pt-nba")).toHaveTextContent(/one-off claim evidence/i);
    expect(screen.getByTestId("pt-negotiation-evidence")).toHaveTextContent("73.64%");
    expect(screen.getByText("CLM-3")).toBeInTheDocument();
    expect(screen.getByTestId("pt-reasoning")).toHaveTextContent(/Incumbent-defence score/i);
  });

  it("renders a yes trigger from the API (not computed)", async () => {
    (api.recommendation as any).mockResolvedValue({ ...PLACEMENT, recommendation: "Trigger placement",
      placement_triggered: "yes", incumbent_defence_score: 0.2, rfq_readiness: 0.8,
      trigger_reason: "Renewal is not defensible; trigger RFQ." });
    renderWithProviders(<PlacementTrigger />);
    await waitFor(() => expect(screen.getByTestId("pt-triggered")).toHaveTextContent("yes"));
    expect(screen.getByTestId("pt-rfq")).toHaveTextContent("0.8");
  });

  it("does not compute a trigger — a No-Data response shows a premium pending state", async () => {
    (api.recommendation as any).mockResolvedValue({ recommendation: "review", data_quality_status: "No Data" });
    renderWithProviders(<PlacementTrigger />);
    await waitFor(() => expect(screen.getByText(/Placement decision pending governed data/i)).toBeInTheDocument());
    expect(screen.queryByTestId("pt-triggered")).not.toBeInTheDocument();
  });

  it("Restricted response shows advisory-blocked; Conditional shows caveats", async () => {
    (api.recommendation as any).mockResolvedValue({ ...PLACEMENT, placement_triggered: "review",
      advisory_blocked: true, restricted: true, data_quality_status: "Restricted",
      caveats: ["Dataset is RESTRICTED; advisory placement decisions are blocked."] });
    const { unmount } = renderWithProviders(<PlacementTrigger />);
    await waitFor(() => expect(screen.getByTestId("restricted-banner")).toBeInTheDocument());
    unmount();
    (api.recommendation as any).mockResolvedValue({ ...PLACEMENT, data_quality_status: "Conditional",
      caveats: ["Written premium basis used."] });
    renderWithProviders(<PlacementTrigger />);
    await waitFor(() => expect(screen.getByTestId("caveat-banner")).toHaveTextContent(/written premium/i));
  });

  it("evidence drawer opens", async () => {
    (api.recommendation as any).mockResolvedValue(PLACEMENT);
    renderWithProviders(<PlacementTrigger />);
    await waitFor(() => expect(screen.getByTestId("pt-triggered")).toBeInTheDocument());
    await userEvent.click(screen.getByText(/View evidence/i));
    await waitFor(() => expect(screen.getByTestId("evidence-drawer")).toBeInTheDocument());
  });
});
