import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return { ...actual, api: { ...actual.api, simulation: vi.fn() } };
});
import { api } from "../lib/api";
import { SavingsSandbox } from "../pages/SavingsSandbox";

const ROOM = { data_quality_status: "Analytics Ready", advisory_blocked: false,
  formula: "Allowed=SI x pct ; ClaimSaving=EligibleLinkedBill x Deduction%",
  assumptions: ["Allowed room rent = Sum Insured x 0.01"], caveats: ["bill breakup missing for 1 claim; proxy only"],
  operational_icr: { operational_icr: 146.0 },
  value: { portfolio_saving: 35000, revised_icr: 142.5, affected_claims: 1, proxy_claims: 1, term_basis: "request_input" } };
const COPAY = { data_quality_status: "Analytics Ready", formula: "CopaySaving = eligible x pct",
  operational_icr: { operational_icr: 146.0 }, caveats: [],
  value: { employer_saving: 146000, member_out_of_pocket: 146000, revised_icr: 131.4, affected_claims: 4, term_basis: "confirmed_policy_term" } };
const PARENT = { ...COPAY, value: { ...COPAY.value, member_out_of_pocket: 28000, affected_claims: 2 } };
const CAP = { data_quality_status: "Analytics Ready", formula: "CapSaving = Sum(Max(0, eligible - cap))",
  operational_icr: { operational_icr: 146.0 }, caveats: [],
  value: { employer_saving: 700000, employee_gap_risk: 700000, revised_icr: 76.0, affected_claims: 1, term_basis: "request_input" } };
const SCENARIO = { data_quality_status: "Analytics Ready", formula: "combined = Sum(per-lever savings)",
  operational_icr: { operational_icr: 146.0 }, caveats: [],
  value: { combined_saving: 181000, combined_revised_icr: 128.0, per_lever_saving: { room_rent: 35000, copay: 146000 } } };

beforeEach(() => (api.simulation as any).mockReset());

async function selectRunAndAssertCall(leverTestId: string, leverName: string, fill?: [string, string], result?: any) {
  (api.simulation as any).mockResolvedValue(result);
  renderWithProviders(<SavingsSandbox />);
  await userEvent.click(screen.getByTestId(leverTestId));
  if (fill) await userEvent.type(screen.getByLabelText(fill[0]), fill[1]);
  await userEvent.click(screen.getByTestId("run-scenario"));
  await waitFor(() => expect(api.simulation).toHaveBeenCalledWith(leverName, expect.any(Object)));
}

describe("Savings Sandbox (API-driven)", () => {
  it("scenario controls CALL the backend API (no local calc) and render its response", async () => {
    (api.simulation as any).mockResolvedValue(ROOM);
    renderWithProviders(<SavingsSandbox />);
    await userEvent.type(screen.getByLabelText(/Room rent %/i), "0.01", { delay: null });
    await userEvent.click(screen.getByTestId("run-scenario"));
    await waitFor(() => expect(api.simulation).toHaveBeenCalledWith("room-rent", { room_rent_pct: "0.01" }));
    await waitFor(() => expect(screen.getByTestId("portfolio-saving")).toHaveTextContent("35,000"));
    expect(screen.getByTestId("revised-icr")).toHaveTextContent("142.5%");
    expect(screen.getByTestId("affected-claims")).toHaveTextContent("1");
    // formula + caveats visible (savings never shown without source/assumptions)
    expect(screen.getByText(/ClaimSaving=EligibleLinkedBill/)).toBeInTheDocument();
    expect(screen.getByTestId("caveat-banner")).toHaveTextContent(/proxy/i);
  }, 15000);

  it("co-pay shows member out-of-pocket (employee impact)", async () => {
    await selectRunAndAssertCall("lever-copay", "copay", ["Co-pay % (fraction, e.g. 0.10)", "0.10"], COPAY);
    await waitFor(() => expect(screen.getByTestId("employee-impact")).toHaveTextContent(/Member out-of-pocket/i));
  });

  it("parent co-pay shows employee impact", async () => {
    await selectRunAndAssertCall("lever-parent-copay", "parent-copay", ["Parent co-pay % (fraction)", "0.20"], PARENT);
    await waitFor(() => expect(screen.getByTestId("employee-impact")).toBeInTheDocument());
  });

  it("disease-cap shows employee gap risk", async () => {
    await selectRunAndAssertCall("lever-disease-cap", "disease-cap", ["Proposed cap (Rs)", "500000"], CAP);
    await waitFor(() => expect(screen.getByTestId("employee-impact")).toHaveTextContent(/gap risk/i));
  });

  it("multi-lever scenario renders API response", async () => {
    (api.simulation as any).mockResolvedValue(SCENARIO);
    renderWithProviders(<SavingsSandbox />);
    await userEvent.click(screen.getByTestId("lever-scenario"));
    await userEvent.click(screen.getByTestId("run-scenario"));
    await waitFor(() => expect(api.simulation).toHaveBeenCalledWith("scenario", expect.any(Object)));
    await waitFor(() => expect(screen.getByTestId("portfolio-saving")).toHaveTextContent("1,81,000"));
    expect(screen.getByTestId("revised-icr")).toHaveTextContent("128%");
  });

  it("evidence drawer opens for a simulation", async () => {
    (api.simulation as any).mockResolvedValue(ROOM);
    renderWithProviders(<SavingsSandbox />);
    await userEvent.type(screen.getByLabelText(/Room rent %/i), "0.01", { delay: null });
    await userEvent.click(screen.getByTestId("run-scenario"));
    await waitFor(() => expect(screen.getByTestId("portfolio-saving")).toBeInTheDocument());
    await userEvent.click(screen.getByText(/View full evidence/i));
    await waitFor(() => expect(screen.getByTestId("evidence-drawer")).toBeInTheDocument());
  }, 15000);
});
