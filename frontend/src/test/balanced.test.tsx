import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return { ...actual, api: { ...actual.api, simulation: vi.fn() } };
});
import { api } from "../lib/api";
import { BalancedBenefitDesign } from "../pages/BalancedBenefitDesign";

const LEVERS = { data_quality_status: "Analytics Ready", advisory_blocked: false, caveats: [],
  value: { levers: [
    { lever: "room_rent", expected_saving: 35000, icr_impact_revised: 142.5, employee_friction: "low", implementation_feasibility: "high", renewal_defensibility: "high", data_reliability: "high", classification: "Good option" },
    { lever: "copay", expected_saving: 146000, icr_impact_revised: 131.4, employee_friction: "high", implementation_feasibility: "high", renewal_defensibility: "medium", data_reliability: "high", classification: "High employee impact" },
  ] } };

beforeEach(() => (api.simulation as any).mockReset());

describe("Balanced Benefit Design (API-driven)", () => {
  it("renders lever classifications + six scoring dimensions from the API", async () => {
    (api.simulation as any).mockResolvedValue(LEVERS);
    renderWithProviders(<BalancedBenefitDesign />);
    await waitFor(() => expect(screen.getAllByTestId("lever-classification").length).toBe(2));
    expect(screen.getByText("Good option")).toBeInTheDocument();
    expect(screen.getByText("High employee impact")).toBeInTheDocument();
    // scoring-dimension labels appear once per lever card (2 levers)
    expect(screen.getAllByText("Renewal defensibility").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Data reliability").length).toBeGreaterThan(0);
  });

  it("Restricted dataset shows advisory-blocked banner", async () => {
    (api.simulation as any).mockResolvedValue({ ...LEVERS, advisory_blocked: true, data_quality_status: "Restricted" });
    renderWithProviders(<BalancedBenefitDesign />);
    await waitFor(() => expect(screen.getByTestId("restricted-banner")).toBeInTheDocument());
  });
});
