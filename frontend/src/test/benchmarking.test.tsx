import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return { ...actual, api: { ...actual.api, benchmarking: vi.fn() } };
});
import { api } from "../lib/api";
import { BenchmarkOverview, BenchmarkFeatures, BenchmarkPolicyTerms, BenchmarkPeer, BenchmarkGaps, BenchmarkDiscussion, BenchmarkEvidence } from "../pages/Benchmarking";

// claims-specific denylist (must NOT match legitimate benefit terms like "pre/post
// hospitalization" or "co-pay") — mirrors the Sprint 15 backend structural test.
const CLAIMS_TOKENS = ["icr", "utiliz", "ailment", "incurred", "loss_ratio", "premium_adequacy",
  "claim_count", "claim_frequency", "claim_severity", "average_claim", "hospital_name", "hospital_usage"];

const TOP = {
  peer_group_definition: { basis: "internal_broker_portfolio", min_peer_count: 3, criteria: { scope: "internal broker portfolio" } },
  peer_count: 3, valid_peer_group: true, confidence: "medium", confidence_score: 0.5, reliability: "medium",
  benchmark_basis: "internal_broker_portfolio", config_version: "v1-default", evidence_completeness: 0.3,
  source: "internal_broker_portfolio", caveats: [], benchmark_domain: "benefit_design_and_policy_terms_only",
};
const OVERVIEW = { ...TOP, kind: "benchmark_overview", summary: "Benefit design benchmarked against 3 peers.",
  classification_counts: { "Same as Benchmark": 1, "Above Benchmark": 1, "Below Benchmark": 1, "Different from Benchmark": 1, "Not Available / Not Comparable": 20 },
  features_total: 24, features_comparable: 4 };
const FEATURES = { ...TOP, kind: "benchmark_features", features: [
  { feature_id: "room_rent", feature: "Room Rent", client_value: 0.01, benchmark_value: 0.01, classification: "Same as Benchmark", discussion_point: "Room rent is same as benchmark.", not_comparable_reason: null },
  { feature_id: "copay", feature: "Co-pay", client_value: 0.20, benchmark_value: 0.10, classification: "Above Benchmark", discussion_point: "Co-pay is above the peer benchmark; a higher co-pay increases member cost-share.", not_comparable_reason: null },
  { feature_id: "pre_post_hospitalization", feature: "Pre / Post Hospitalization", client_value: null, benchmark_value: null, classification: "Not Available / Not Comparable", discussion_point: "not captured", not_comparable_reason: "This benefit feature is not yet captured in structured policy terms." },
] };
const POLICY_TERMS = { ...TOP, kind: "benchmark_policy_terms", policy_terms: [
  { feature_id: "ped_waiting", feature: "PED / Waiting Period", client_value: 24, benchmark_value: 12, classification: "Above Benchmark", discussion_point: "Longer wait is less generous.", not_comparable_reason: null },
  { feature_id: "non_payables_exclusions", feature: "Non-payables / Exclusions", client_text: "a", benchmark_value: "b", classification: "Different from Benchmark", discussion_point: "Review exclusions.", not_comparable_reason: null },
] };
const PEER = { ...TOP, kind: "benchmark_peer_comparison", comparisons: [], features_with_peer_benchmark: 3 };
const GAPS = { ...TOP, kind: "benchmark_gap_analysis", gap_count: 2, gaps: [
  { feature_id: "copay", feature: "Co-pay", client_value: 0.20, benchmark_value: 0.10, classification: "Above Benchmark", discussion_point: "Co-pay is above the peer benchmark." },
  { feature_id: "maternity_limit", feature: "Maternity Limit", client_value: 500000, benchmark_value: 750000, classification: "Below Benchmark", discussion_point: "Maternity limit is below peers." },
] };
const DISC = { ...TOP, kind: "benchmark_discussion_points", count: 1, discussion_points: [
  { feature_id: "copay", feature: "Co-pay", classification: "Above Benchmark", discussion_point: "Co-pay is above the peer benchmark; align to reduce member cost-share.", peer_group_definition: TOP.peer_group_definition, evidence: {} },
] };
const EVIDENCE = { ...TOP, kind: "benchmark_gap_analysis" };

beforeEach(() => (api.benchmarking as any).mockReset());

describe("Benefit Benchmarking UI (single-sourced from /benchmarking/*)", () => {
  it("Overview renders API classification counts and peer summary", async () => {
    (api.benchmarking as any).mockResolvedValue(OVERVIEW);
    renderWithProviders(<BenchmarkOverview />);
    await waitFor(() => expect(screen.getByTestId("bm-counts")).toBeInTheDocument());
    expect(api.benchmarking).toHaveBeenCalledWith("overview");
    expect(screen.getByTestId("bm-counts")).toHaveTextContent("Same as Benchmark: 1");
    expect(screen.getByTestId("bm-counts")).toHaveTextContent("Not Available / Not Comparable: 20");
    expect(screen.getByTestId("bm-peer-summary")).toHaveTextContent(/internal_broker_portfolio/);
    // Sprint 20 retrofit: classification-counts donut is rendered from the API counts
    expect(screen.getByTestId("bm-class-donut")).toBeInTheDocument();
  });

  it("Features renders client value, benchmark value, classification and NA reason", async () => {
    (api.benchmarking as any).mockResolvedValue(FEATURES);
    renderWithProviders(<BenchmarkFeatures />);
    await waitFor(() => expect(screen.getByTestId("bm-features-table")).toBeInTheDocument());
    expect(screen.getByTestId("bm-features-table")).toHaveTextContent("Room Rent");
    expect(screen.getByTestId("bm-features-table")).toHaveTextContent("Co-pay");
    expect(screen.getAllByTestId("bm-class-badge").length).toBeGreaterThan(0);
    expect(screen.getByTestId("bm-features-table")).toHaveTextContent(/not yet captured/i);   // NA reason
  });

  it("Policy Terms renders the T&C features", async () => {
    (api.benchmarking as any).mockResolvedValue(POLICY_TERMS);
    renderWithProviders(<BenchmarkPolicyTerms />);
    await waitFor(() => expect(screen.getByTestId("bm-policy-terms")).toBeInTheDocument());
    expect(api.benchmarking).toHaveBeenCalledWith("policy-terms-comparison");
    expect(screen.getByTestId("bm-policy-terms")).toHaveTextContent(/Waiting Period/);
  });

  it("Peer comparison renders peer-group definition and peer count", async () => {
    (api.benchmarking as any).mockResolvedValue(PEER);
    renderWithProviders(<BenchmarkPeer />);
    await waitFor(() => expect(screen.getByTestId("bm-peer-def")).toBeInTheDocument());
    expect(screen.getByTestId("bm-peer-count")).toHaveTextContent("3");
    expect(screen.getByTestId("bm-peer-def")).toHaveTextContent(/internal_broker_portfolio/);
  });

  it("Gap analysis renders direction-aware gaps", async () => {
    (api.benchmarking as any).mockResolvedValue(GAPS);
    renderWithProviders(<BenchmarkGaps />);
    await waitFor(() => expect(screen.getByTestId("bm-gaps")).toBeInTheDocument());
    expect(screen.getByTestId("bm-gaps")).toHaveTextContent("Co-pay");        // lower-is-better + Above => gap
    expect(screen.getByTestId("bm-gaps")).toHaveTextContent("Maternity Limit");
    expect(screen.getAllByTestId("bm-gap-row").length).toBe(2);
  });

  it("Discussion points render design-only language (no claims tokens)", async () => {
    (api.benchmarking as any).mockResolvedValue(DISC);
    const { container } = renderWithProviders(<BenchmarkDiscussion />);
    await waitFor(() => expect(screen.getByTestId("bm-discussion")).toBeInTheDocument());
    const text = (container.textContent || "").toLowerCase();
    for (const tok of CLAIMS_TOKENS) expect(text).not.toContain(tok);
  });

  it("Evidence renders governed evidence and the drawer opens", async () => {
    (api.benchmarking as any).mockResolvedValue(EVIDENCE);
    renderWithProviders(<BenchmarkEvidence />);
    await waitFor(() => expect(screen.getByTestId("bm-evidence")).toBeInTheDocument());
    expect(api.benchmarking).toHaveBeenCalledWith("evidence/gap-analysis");
    await userEvent.click(screen.getByText(/View evidence/i));
    await waitFor(() => expect(screen.getByTestId("evidence-drawer")).toBeInTheDocument());
  });

  it("invalid / too-small peer group shows a clear Not Comparable state", async () => {
    (api.benchmarking as any).mockResolvedValue({ ...OVERVIEW, valid_peer_group: false, peer_count: 1,
      caveats: ["Peer group too small (1 < 3); no benchmark can be formed."] });
    renderWithProviders(<BenchmarkOverview />);
    await waitFor(() => expect(screen.getByTestId("bm-invalid-peer")).toBeInTheDocument());
    expect(screen.getByTestId("bm-invalid-peer")).toHaveTextContent(/peer group too small/i);
  });

  it("missing response shows a premium pending state", async () => {
    (api.benchmarking as any).mockResolvedValue(undefined);
    renderWithProviders(<BenchmarkOverview />);
    await waitFor(() => expect(screen.getByText(/Benchmark pending governed data/i)).toBeInTheDocument());
    expect(screen.queryByTestId("bm-counts")).not.toBeInTheDocument();
  });

  it("no claims / ICR / utilization tokens appear in the feature UI (co-pay & pre/post hospitalization are benefits)", async () => {
    (api.benchmarking as any).mockResolvedValue(FEATURES);
    const { container } = renderWithProviders(<BenchmarkFeatures />);
    await waitFor(() => expect(screen.getByTestId("bm-features-table")).toBeInTheDocument());
    const text = (container.textContent || "").toLowerCase();
    // legitimate benefit terms are present...
    expect(text).toContain("co-pay");
    expect(text).toContain("hospitalization");
    // ...but no claims-domain token is
    for (const tok of CLAIMS_TOKENS) expect(text).not.toContain(tok);
  });
});
