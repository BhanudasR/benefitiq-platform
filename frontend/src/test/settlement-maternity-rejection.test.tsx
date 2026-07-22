import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return { ...actual, api: { ...actual.api, metric: vi.fn() } };
});
import { api } from "../lib/api";
import { Settlement } from "../pages/Settlement";
import { Maternity } from "../pages/Maternity";
import { Rejection } from "../pages/Rejection";

function wire(map: any) {
  (api.metric as any).mockImplementation((name: string) => Promise.resolve(map[name] ?? { data_quality_status: "No Data", value: {} }));
}
const NODATA = { data_quality_status: "No Data", value: {} };

const SETTLE = { data_quality_status: "Analytics Ready", caveats: [], formula: "status mix", value: {
  claim_count: 6, paid: 270000, outstanding: 70000, incurred: 340000, closed_count: 5, open_count: 1,
  cashless_count: 3, reimbursement_count: 3, settled_fully_count: 3, settled_partially_count: 1, repudiated_count: 1,
  bill_breakup_claims: 1, deduction_amount: 5000,
  status_distribution: [{ key: "Settled Fully", count: 3 }, { key: "Repudiated", count: 1 }],
  tat: { available: false, reason: "Requires Date_of_Receipt_Of_Complete_Claim_Document and Date_of_Payment." } } };

const MAT = { data_quality_status: "Analytics Ready", caveats: [], formula: "keyword/ICD-O", value: {
  maternity_claim_count: 2, total_claims_in_scope: 6, incurred: 110000, average_claim_size: 55000,
  normal_count: 1, csection_count: 1, split_available: true, maternity_limit: 50000, newborn_cover: null,
  identification_rule: "Confirmed maternity = keyword or ICD-10 chapter-O match on diagnosis_code_l1.",
  excluded_no_diagnosis: 1 } };
const MAT_NOSPLIT = { ...MAT, value: { ...MAT.value, split_available: false, normal_count: null, csection_count: null, maternity_limit: null } };

const REJ = { data_quality_status: "Analytics Ready", caveats: [], formula: "Repudiated", value: {
  total_claims: 6, rejection_count: 1, rejection_amount: 40000, rejection_ratio: 0.1667,
  by_claim_type: [{ key: "Reimbursement", count: 1 }], top_reasons: null, wrongful_rejection: null } };

beforeEach(() => (api.metric as any).mockReset());

describe("Settlement dashboard", () => {
  it("renders governed values and a TAT 'Not available' card", async () => {
    wire({ settlement: SETTLE });
    renderWithProviders(<Settlement />);
    await waitFor(() => expect(screen.getByTestId("settle-kpis")).toBeInTheDocument());
    expect(api.metric).toHaveBeenCalledWith("settlement");
    expect(screen.getByTestId("settle-status")).toHaveTextContent("Settled Fully");
    expect(screen.getByTestId("settle-kpi-deduction")).toHaveTextContent("₹5,000");
    expect(screen.getByTestId("settle-tat")).toHaveTextContent(/Not available/i);
  });
  it("No-Data renders empty state", async () => {
    wire({ settlement: NODATA });
    renderWithProviders(<Settlement />);
    await waitFor(() => expect(screen.getByTestId("empty-state")).toBeInTheDocument());
  });
});

describe("Maternity dashboard", () => {
  it("renders governed identification, split and limit from confirmed term", async () => {
    wire({ maternity: MAT });
    renderWithProviders(<Maternity />);
    await waitFor(() => expect(screen.getByTestId("mat-kpis")).toBeInTheDocument());
    expect(screen.getByTestId("mat-kpi-count")).toHaveTextContent("2");
    expect(screen.getByTestId("mat-split")).toHaveTextContent(/C-section/i);
    expect(screen.getByTestId("mat-limit")).toHaveTextContent("₹50,000");
    expect(screen.getByTestId("mat-newborn")).toHaveTextContent(/Not available/i);   // no confirmed term
    expect(screen.getByTestId("mat-rule")).toHaveTextContent(/ICD-10 chapter-O|diagnosis_code_l1/i);
  });
  it("normal/C-section and limit show 'Not available' when unsupported", async () => {
    wire({ maternity: MAT_NOSPLIT });
    renderWithProviders(<Maternity />);
    await waitFor(() => expect(screen.getByTestId("mat-split")).toBeInTheDocument());
    expect(screen.getByTestId("mat-split")).toHaveTextContent(/Not available/i);
    expect(screen.getByTestId("mat-limit")).toHaveTextContent(/Not available/i);
  });
  it("evidence drawer opens", async () => {
    wire({ maternity: MAT });
    renderWithProviders(<Maternity />);
    await waitFor(() => expect(screen.getByTestId("mat-split")).toBeInTheDocument());
    await userEvent.click(screen.getAllByText(/View evidence/i)[0]);
    await waitFor(() => expect(screen.getByTestId("evidence-drawer")).toBeInTheDocument());
  });
});

describe("Rejection dashboard", () => {
  it("renders Repudiated-only metrics and 'Not available' reasons/wrongful cards", async () => {
    wire({ rejection: REJ });
    renderWithProviders(<Rejection />);
    await waitFor(() => expect(screen.getByTestId("rej-kpis")).toBeInTheDocument());
    expect(screen.getByTestId("rej-kpi-count")).toHaveTextContent("1");
    expect(screen.getByTestId("rej-gauge")).toBeInTheDocument();
    expect(screen.getByTestId("rej-bytype")).toHaveTextContent("Reimbursement");
    expect(screen.getByTestId("rej-reasons")).toHaveTextContent(/Not available/i);
    expect(screen.getByTestId("rej-wrongful")).toHaveTextContent(/Not available/i);
  });
  it("No-Data renders empty state", async () => {
    wire({ rejection: NODATA });
    renderWithProviders(<Rejection />);
    await waitFor(() => expect(screen.getByTestId("empty-state")).toBeInTheDocument());
  });
});
