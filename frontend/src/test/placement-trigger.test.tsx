import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return { ...actual, api: { ...actual.api, metric: vi.fn(), simulation: vi.fn() } };
});
import { api } from "../lib/api";
import { PlacementTrigger } from "../pages/PlacementTrigger";

// Fixtures use ONLY fields the governed backend actually returns (icr.value.operational_icr,
// large-claims.value.large_claims[], adjusted-icr.value.*). No placement-trigger field is
// injected — the backend has no placement-trigger engine yet, so the screen must show a
// governed pending-state and render only the existing large-claim negotiation evidence.
const ICR_BASE = { data_quality_status: "Analytics Ready", advisory_blocked: false, caveats: [], value: { operational_icr: 118.0 } };
const LARGE = { data_quality_status: "Analytics Ready", value: { large_claims: [
  { claim_number: "CLM-9", policy_year: 2026, incurred: 1500000, one_off_review_candidate: true }] } };
const ADJ = { data_quality_status: "Analytics Ready", value: { operational_icr: 118.0, adjusted_icr: 90.0 } };

function wire(icr = ICR_BASE) {
  (api.metric as any).mockImplementation((n: string) => Promise.resolve(n === "icr" ? icr : LARGE));
  (api.simulation as any).mockImplementation(() => Promise.resolve(ADJ));
}
beforeEach(() => { (api.metric as any).mockReset?.(); (api.simulation as any).mockReset?.(); });

describe("Placement Trigger / NBA (governed — no frontend trigger math)", () => {
  it("shows a governed pending-state and renders only existing large-claim evidence", async () => {
    wire();
    renderWithProviders(<PlacementTrigger />);
    await waitFor(() => expect(screen.getByText(/pending placement endpoint/i)).toBeInTheDocument());
    expect(screen.getByText("CLM-9")).toBeInTheDocument();      // insurer-negotiation evidence
    expect(screen.getByTestId("four-questions")).toBeInTheDocument();
  });

  it("Restricted dataset shows advisory-blocked banner", async () => {
    wire({ ...ICR_BASE, advisory_blocked: true, data_quality_status: "Restricted" });
    renderWithProviders(<PlacementTrigger />);
    await waitFor(() => expect(screen.getByTestId("restricted-banner")).toBeInTheDocument());
  });
});
