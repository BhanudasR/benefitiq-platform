import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return { ...actual, api: { ...actual.api, placement: vi.fn() } };
});
import { api } from "../lib/api";
import {
  PlacementOverview, PlacementIncumbentDefence, PlacementRfqReadiness, PlacementQuoteComparison,
  PlacementTermsComparison, PlacementRecommendation, PlacementEvidence,
} from "../pages/Placement";

// claims-domain tokens that must NOT appear in the Terms Comparison payload (design + T&C only)
const CLAIMS_TOKENS = ["icr", "utiliz", "ailment", "incurred", "loss_ratio", "premium_adequacy",
  "claim_count", "claim_frequency", "claim_severity", "average_claim", "hospital_name", "hospital_usage"];

const BASE = {
  module: "placement_intelligence", data_quality_status: "Analytics Ready", restricted: false,
  advisory_blocked: false, confidence: "medium", confidence_score: 0.6, reliability: "medium",
  caveats: [], source_basis: ["renewal Placement Trigger engine (/recommendations/placement-trigger)"],
  reuses_engine: "recommendations.placement_trigger",
};
const OVERVIEW = { ...BASE, view: "overview", placement_state: "no", recommendation: "no",
  decision_summary: "Defend incumbent. Loss is event-driven.", incumbent_defence_score: 0.72,
  rfq_readiness: 0.4, trigger_reason: "ICR within defend band", terms_to_protect_count: 3,
  benchmark_gaps_to_raise_count: 2 };
const DEFENCE = { ...BASE, view: "incumbent_defence", incumbent_defence_score: 0.72,
  placement_state: "no", defence_reasons: [{ rule: "one_off", explanation: "Loss is event-driven (one-off claims)." }],
  negotiation_evidence: { operational_icr: 118, adjusted_icr: 96 }, operational_icr: 118, adjusted_icr: 96,
  adjusted_icr_note: "Adjusted / Defendable ICR never replaces Operational ICR." };
const RFQ = { ...BASE, view: "rfq_readiness", rfq_readiness: 0.4, placement_state: "no",
  trigger_reason: "ICR within band; incumbent defensible", go_to_market_required: false,
  next_best_actions: [{ rule: "prep", explanation: "Prepare the negotiation pack." }] };
const QUOTE = { ...BASE, view: "quote_comparison", quote_data_available: false, quotes: [], quote_count: 0,
  message: "Quote comparison pending — upload insurer quotes to compare.",
  expected_fields: ["insurer", "policy_terms", "benefit_design"], note: "No fake quotes or pricing are generated." };
const TERMS = { module: "placement_intelligence", view: "terms_comparison",
  benchmark_domain: "benefit_design_and_policy_terms_only", confidence: "medium", confidence_score: 0.5,
  reliability: "medium", caveats: [], valid_peer_group: true,
  terms_to_protect: [{ feature_id: "ped_waiting", feature: "PED / Waiting Period", classification: "Above Benchmark" }],
  terms_to_protect_count: 1,
  policy_terms: [{ feature_id: "ped_waiting", feature: "PED / Waiting Period", client_value: 24, benchmark_value: 12, classification: "Above Benchmark" }],
  benchmark_gaps_to_raise: [], benchmark_gaps_count: 0, linked_benchmark_actions: [],
  source_basis: ["Benefit Benchmarking (benefit design + policy terms only)"],
  reuses_engine: "benchmarking.policy_terms_comparison" };
const REC = { ...BASE, view: "recommendation", recommendation: "no", placement_state: "no",
  placement_triggered: "no", trigger_reason: "Incumbent defensible", reasoning: [{ rule: "band", explanation: "ICR within defend band." }],
  next_best_action: { rule: "negotiate", explanation: "Open negotiation with the incumbent." },
  operational_icr: 118, adjusted_icr: 96,
  source: "renewal Placement Trigger engine (/recommendations/placement-trigger)" };
const EVID = { ...BASE, view: "overview", evidence_references: [{ source: "metrics.icr" }] };

beforeEach(() => (api.placement as any).mockReset());

describe("Placement Intelligence UI (single-sourced from /placement/*)", () => {
  it("Overview renders governed placement state, counts and source basis", async () => {
    (api.placement as any).mockResolvedValue(OVERVIEW);
    renderWithProviders(<PlacementOverview />);
    await waitFor(() => expect(screen.getByTestId("pm-overview")).toBeInTheDocument());
    expect(api.placement).toHaveBeenCalledWith("overview");
    expect(screen.getByTestId("pm-state-badge")).toHaveTextContent(/defend incumbent/i);
    expect(screen.getByTestId("pm-protect-count")).toHaveTextContent("3");
    expect(screen.getByTestId("pm-gaps-count")).toHaveTextContent("2");
    expect(screen.getByTestId("pm-source-basis")).toHaveTextContent(/Placement Trigger engine/);
  });

  it("Incumbent Defence keeps Operational and Adjusted ICR separate and lists reasons", async () => {
    (api.placement as any).mockResolvedValue(DEFENCE);
    renderWithProviders(<PlacementIncumbentDefence />);
    await waitFor(() => expect(screen.getByTestId("pm-defence")).toBeInTheDocument());
    expect(screen.getByTestId("pm-defence")).toHaveTextContent(/event-driven/i);
    expect(screen.getByTestId("pm-defence")).toHaveTextContent("118");   // operational
    expect(screen.getByTestId("pm-defence")).toHaveTextContent("96");    // adjusted, separate
  });

  it("RFQ Readiness renders readiness, go-to-market and trigger basis", async () => {
    (api.placement as any).mockResolvedValue(RFQ);
    renderWithProviders(<PlacementRfqReadiness />);
    await waitFor(() => expect(screen.getByTestId("pm-rfq")).toBeInTheDocument());
    expect(api.placement).toHaveBeenCalledWith("rfq-readiness");
    expect(screen.getByTestId("pm-go-to-market")).toHaveTextContent(/no/i);
    expect(screen.getByTestId("pm-rfq")).toHaveTextContent(/incumbent defensible/i);
  });

  it("Quote Comparison shows the governed pending / no-quote state", async () => {
    (api.placement as any).mockResolvedValue(QUOTE);
    renderWithProviders(<PlacementQuoteComparison />);
    await waitFor(() => expect(screen.getByTestId("pm-quote-pending")).toBeInTheDocument());
    expect(screen.getByTestId("pm-quote-pending")).toHaveTextContent(/pending/i);
    expect(screen.getByTestId("pm-quote-pending")).toHaveTextContent(/upload insurer quotes/i);
  });

  it("Terms Comparison renders terms + counts and stays claims-free", async () => {
    (api.placement as any).mockResolvedValue(TERMS);
    const { container } = renderWithProviders(<PlacementTermsComparison />);
    await waitFor(() => expect(screen.getByTestId("pm-terms")).toBeInTheDocument());
    expect(api.placement).toHaveBeenCalledWith("terms-comparison");
    expect(screen.getByTestId("pm-terms-table")).toHaveTextContent(/Waiting Period/);
    expect(screen.getByTestId("pm-terms-protect")).toHaveTextContent("1");
    const text = (container.textContent || "").toLowerCase();
    for (const tok of CLAIMS_TOKENS) expect(text).not.toContain(tok);
  });

  it("Recommendation renders the decision, source basis and reasons", async () => {
    (api.placement as any).mockResolvedValue(REC);
    renderWithProviders(<PlacementRecommendation />);
    await waitFor(() => expect(screen.getByTestId("pm-recommendation")).toBeInTheDocument());
    expect(api.placement).toHaveBeenCalledWith("recommendation");
    expect(screen.getByTestId("pm-rec-source")).toHaveTextContent(/Placement Trigger engine/);
    expect(screen.getByTestId("pm-state-badge")).toHaveTextContent(/defend incumbent/i);
    expect(screen.getByTestId("pm-recommendation")).toHaveTextContent(/defend band/i);
  });

  it("Evidence renders governed evidence and the drawer opens", async () => {
    (api.placement as any).mockResolvedValue(EVID);
    renderWithProviders(<PlacementEvidence />);
    await waitFor(() => expect(screen.getByTestId("pm-evidence")).toBeInTheDocument());
    expect(api.placement).toHaveBeenCalledWith("evidence/overview");
    await userEvent.click(screen.getByText(/View evidence/i));
    await waitFor(() => expect(screen.getByTestId("evidence-drawer")).toBeInTheDocument());
  });

  it("missing response shows a premium pending state", async () => {
    (api.placement as any).mockResolvedValue(undefined);
    renderWithProviders(<PlacementOverview />);
    await waitFor(() => expect(screen.getByText(/Placement pending governed data/i)).toBeInTheDocument());
    expect(screen.queryByTestId("pm-overview")).not.toBeInTheDocument();
  });
});
