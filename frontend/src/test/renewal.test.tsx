import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return { ...actual, api: { ...actual.api, metric: vi.fn(), simulation: vi.fn() } };
});
import { api } from "../lib/api";
import { RenewalIntelligence } from "../pages/RenewalIntelligence";

const ICR = { data_quality_status: "Analytics Ready", advisory_blocked: false, caveats: [], premium_basis: "written",
  formula: "incurred/earned x100", numerator: 1, denominator: 2, source_tables: ["claim"],
  value: { operational_icr: 73.64, paid_icr: 72.5, outstanding_icr: 1.14, incurred: 1620000, earned_premium: 2200000 } };
const TRENDS = { data_quality_status: "Analytics Ready", value: { series: [{ policy_year: 2025, premium: 1000000, incurred: 420000, operational_icr: 42.0 }] } };
const LARGE = { data_quality_status: "Analytics Ready", value: { large_claim_count: 1, large_claim_incurred: 1200000, large_claim_incurred_share: 0.42, threshold: 1000000, threshold_source: "default", large_claims: [{ claim_number: "CLM-3", policy_year: 2026, incurred: 1200000, one_off_review_candidate: true }] } };
const ADJ = { data_quality_status: "Analytics Ready", advisory_blocked: false, formula: "AdjustedICR=...",
  value: { operational_icr: 73.64, adjusted_icr: 26.0, adjusted_label: "Adjusted ICR / Defendable ICR view based on one-off claim review assumptions." } };

function wireMetric(m: any) { (api.metric as any).mockImplementation((n: string) => Promise.resolve(m[n])); }
beforeEach(() => { (api.metric as any).mockReset?.(); (api.simulation as any).mockReset?.(); });

describe("Renewal Intelligence (API-driven)", () => {
  it("renders API operational/paid/outstanding ICR; operational stays visible with adjusted", async () => {
    wireMetric({ icr: ICR, trends: TRENDS, "large-claims": LARGE });
    (api.simulation as any).mockResolvedValue(ADJ);
    renderWithProviders(<RenewalIntelligence />);
    await waitFor(() => expect(screen.getByTestId("adjusted-icr")).toHaveTextContent("26%"));
    expect(screen.getByText("72.5%")).toBeInTheDocument();                          // paid ICR (KPI)
    expect(screen.getByText("1.14%")).toBeInTheDocument();                          // outstanding ICR (KPI)
    // operational ICR appears in BOTH the KPI and the adjusted panel (not replaced)
    expect(screen.getAllByText("73.64%").length).toBeGreaterThan(1);
    expect(screen.getByTestId("op-icr")).toHaveTextContent("73.64%");
    expect(screen.getByTestId("adjusted-label")).toHaveTextContent(/Defendable ICR view/i);
    // Sprint 20 retrofit: governed ICR gauge is rendered from the same API value
    expect(screen.getByTestId("renewal-icr-gauge")).toHaveTextContent("73.64%");
  });

  it("Restricted → advisory-blocked; Conditional → caveats", async () => {
    wireMetric({ icr: { ...ICR, data_quality_status: "Conditional", caveats: ["Written premium used (basis='written')."] }, trends: TRENDS, "large-claims": LARGE });
    (api.simulation as any).mockResolvedValue(ADJ);
    const { unmount } = renderWithProviders(<RenewalIntelligence />);
    await waitFor(() => expect(screen.getByTestId("caveat-banner")).toHaveTextContent(/written premium/i));
    unmount();
    wireMetric({ icr: { ...ICR, advisory_blocked: true, data_quality_status: "Restricted" }, trends: TRENDS, "large-claims": LARGE });
    (api.simulation as any).mockResolvedValue(ADJ);
    renderWithProviders(<RenewalIntelligence />);
    await waitFor(() => expect(screen.getByTestId("restricted-banner")).toBeInTheDocument());
  });

  it("shows the large-claim / one-off impact summary and the 4-questions decision block", async () => {
    wireMetric({ icr: ICR, trends: TRENDS, "large-claims": LARGE });
    (api.simulation as any).mockResolvedValue(ADJ);
    renderWithProviders(<RenewalIntelligence />);
    await waitFor(() => expect(screen.getByTestId("large-count")).toHaveTextContent("1"));
    expect(screen.getByTestId("large-share")).toHaveTextContent("42%");
    expect(screen.getByTestId("four-questions")).toBeInTheDocument();
    expect(screen.getByText(/Can I trust this number/i)).toBeInTheDocument();
  });

  it("evidence drawer opens for a metric", async () => {
    wireMetric({ icr: ICR, trends: TRENDS, "large-claims": LARGE });
    (api.simulation as any).mockResolvedValue(ADJ);
    renderWithProviders(<RenewalIntelligence />);
    await waitFor(() => expect(screen.getByTestId("op-icr")).toHaveTextContent("73.64%"));
    await userEvent.click(screen.getAllByRole("button", { name: /View evidence/i })[0]);
    await waitFor(() => expect(screen.getByTestId("evidence-drawer")).toHaveTextContent("incurred/earned x100"));
  });
});
