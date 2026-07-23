import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return { ...actual, api: { ...actual.api, askIntents: vi.fn(), askQuery: vi.fn(), portfolio: vi.fn() } };
});
import { api } from "../lib/api";
import { AskBenefitIQ } from "../pages/AskBenefitIQ";

const INTENTS = {
  intents: [
    { id: "icr_explanation", category: "Claims", title: "ICR explanation", examples: ["Why is this client's ICR high?"], needs_client_id: true },
    { id: "portfolio_summary", category: "Portfolio", title: "Portfolio summary", examples: ["Which clients are high risk?"], needs_client_id: false },
  ],
};
const ANSWER = {
  question: "Why is this client's ICR high?", matched_intent: "icr_explanation", intent_title: "ICR explanation",
  intent_category: "Claims", unsupported: false, needs_client: false,
  answer_summary: "Operational ICR is 120% — elevated.", key_points: ["Incurred claims high."],
  supporting_metrics: [{ label: "Operational ICR", value: 120, format: "percent", source: "claim + policy_version", data_quality_status: "Analytics Ready" }],
  evidence_refs: [{ engine: "metrics.icr", formula: "incurred / premium" }], source_tables: ["claim", "policy_version"],
  caveats: ["Written premium basis."], confidence: "high", data_quality_status: "Analytics Ready",
  not_available_reason: null, recommended_next_action: "Open Claims Drivers.", candidates: [],
};

beforeEach(() => {
  (api.askIntents as any).mockReset(); (api.askQuery as any).mockReset(); (api.portfolio as any).mockReset();
  (api.askIntents as any).mockResolvedValue(INTENTS);
  (api.portfolio as any).mockResolvedValue({ value: { clients: [{ client_id: "C1", client_name: "Acme Corp" }] } });
});

describe("Ask BenefitIQ (governed copilot)", () => {
  it("renders guided cards, client selector and input", async () => {
    (api.askQuery as any).mockResolvedValue(ANSWER);
    renderWithProviders(<AskBenefitIQ />, { route: "/ask-benefitiq" });
    await waitFor(() => expect(screen.getByTestId("ask-page")).toBeInTheDocument());
    expect(screen.getByTestId("ask-cards")).toBeInTheDocument();
    expect(screen.getAllByTestId("ask-card").length).toBe(2);
    expect(screen.getByTestId("ask-client")).toBeInTheDocument();
    expect(screen.getByTestId("ask-input")).toBeInTheDocument();
  });

  it("renders a grounded answer with metrics, confidence, caveats and evidence drawer", async () => {
    (api.askQuery as any).mockResolvedValue(ANSWER);
    renderWithProviders(<AskBenefitIQ />, { route: "/ask-benefitiq" });
    await waitFor(() => expect(screen.getByTestId("ask-cards")).toBeInTheDocument());
    fireEvent.click(screen.getAllByTestId("ask-card")[0]);
    await waitFor(() => expect(screen.getByTestId("ask-answer")).toBeInTheDocument());
    expect(api.askQuery).toHaveBeenCalledWith({ question: "Why is this client's ICR high?", intent: "icr_explanation" });
    expect(screen.getByTestId("ask-metrics")).toHaveTextContent("120%");
    expect(screen.getByTestId("ask-answer")).toHaveTextContent(/confidence: high/i);
    expect(screen.getByTestId("caveat-banner")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("ask-evidence-btn"));
    await waitFor(() => expect(screen.getByTestId("evidence-drawer")).toBeInTheDocument());
  });

  it("renders the Unsupported state", async () => {
    (api.askQuery as any).mockResolvedValue({ unsupported: true, answer_summary: "Outside governed scope.", candidates: [], data_quality_status: "No Data" });
    renderWithProviders(<AskBenefitIQ />, { route: "/ask-benefitiq" });
    await waitFor(() => expect(screen.getByTestId("ask-input")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("ask-input"), { target: { value: "weather?" } });
    fireEvent.click(screen.getByTestId("ask-submit"));
    await waitFor(() => expect(screen.getByTestId("ask-unsupported")).toBeInTheDocument());
  });

  it("renders the Not Available state for governed No-Data answers", async () => {
    (api.askQuery as any).mockResolvedValue({ ...ANSWER, data_quality_status: "No Data", answer_summary: "Not available — no governed data.", not_available_reason: "no governed data in scope", supporting_metrics: [] });
    renderWithProviders(<AskBenefitIQ />, { route: "/ask-benefitiq" });
    await waitFor(() => expect(screen.getByTestId("ask-cards")).toBeInTheDocument());
    fireEvent.click(screen.getAllByTestId("ask-card")[0]);
    await waitFor(() => expect(screen.getByTestId("ask-not-available")).toBeInTheDocument());
  });
});
