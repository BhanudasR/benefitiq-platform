import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return { ...actual, api: { ...actual.api, metric: vi.fn(), simulation: vi.fn() } };
});
import { api } from "../lib/api";
import { RecommendedStrategy } from "../pages/RecommendedStrategy";

// Fixtures use ONLY fields the governed backend actually returns (icr.value.operational_icr,
// adjusted-icr.value.{operational_icr,adjusted_icr}, balanced-design.value.levers[]).
// No recommendation/stance field is injected — the backend does not yet return one, so the
// screen must show a governed pending-state (the frontend never computes the recommendation).
const ICR = { data_quality_status: "Analytics Ready", advisory_blocked: false, caveats: [],
  value: { operational_icr: 118.0 } };
const ADJ = { data_quality_status: "Analytics Ready", value: { operational_icr: 118.0, adjusted_icr: 92.0 } };
const BAL = { data_quality_status: "Analytics Ready", value: { levers: [
  { lever: "room_rent", expected_saving: 35000, classification: "Preferred" },
  { lever: "copay", expected_saving: 146000, classification: "High employee impact" }] } };

function wireDefault() {
  (api.metric as any).mockImplementation((n: string) => Promise.resolve(n === "icr" ? ICR : null));
  (api.simulation as any).mockImplementation((n: string) => Promise.resolve(n === "adjusted-icr" ? ADJ : BAL));
}
beforeEach(() => { (api.metric as any).mockReset?.(); (api.simulation as any).mockReset?.(); });

describe("Recommended Strategy (governed — no frontend recommendation math)", () => {
  it("shows a governed pending-state and does NOT compute the recommendation when the backend provides none", async () => {
    wireDefault();
    renderWithProviders(<RecommendedStrategy />);
    await waitFor(() => expect(screen.getByText(/pending strategy endpoint/i)).toBeInTheDocument());
    expect(screen.getByTestId("four-questions")).toBeInTheDocument();
  });

  it("keeps Operational and Adjusted / Defendable ICR visible and separate (existing valid fields)", async () => {
    wireDefault();
    renderWithProviders(<RecommendedStrategy />);
    await waitFor(() => expect(screen.getByTestId("rs-op-icr")).toHaveTextContent("118%"));
    expect(screen.getByTestId("rs-adj-icr")).toHaveTextContent("92%");
    // the two are distinct, labelled elements — operational is never replaced by adjusted
    expect(screen.getByTestId("rs-op-icr")).not.toBe(screen.getByTestId("rs-adj-icr"));
  });

  it("Restricted dataset shows advisory-blocked banner", async () => {
    (api.metric as any).mockImplementation((n: string) => Promise.resolve(n === "icr"
      ? { ...ICR, advisory_blocked: true, data_quality_status: "Restricted" } : null));
    (api.simulation as any).mockImplementation((n: string) => Promise.resolve(n === "adjusted-icr" ? ADJ : BAL));
    renderWithProviders(<RecommendedStrategy />);
    await waitFor(() => expect(screen.getByTestId("restricted-banner")).toBeInTheDocument());
  });
});
