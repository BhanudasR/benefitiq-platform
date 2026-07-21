import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return {
    ...actual,
    api: {
      ...actual.api,
      benchmarking: vi.fn(),
      benchmarkActions: {
        flagGap: vi.fn(),
        list: vi.fn(),
        get: vi.fn(),
        sendToSandbox: vi.fn(),
        sandboxPreview: vi.fn(),
        patch: vi.fn(),
      },
    },
  };
});
import { api } from "../lib/api";
import { BenchmarkGaps, BenchmarkFeatures } from "../pages/Benchmarking";
import { SavingsSandbox } from "../pages/SavingsSandbox";

const ACTOR = { sub: "u", tenant_id: "acme", role: "analyst", capabilities: ["view", "benchmark_action"] } as any;
const READONLY = { sub: "u", tenant_id: "acme", role: "analyst", capabilities: ["view", "read_only"] } as any;

const TOP = {
  peer_group_definition: { basis: "internal_broker_portfolio", min_peer_count: 3 },
  peer_count: 3, valid_peer_group: true, confidence: "medium", confidence_score: 0.5,
  reliability: "medium", benchmark_basis: "internal_broker_portfolio", caveats: [],
  benchmark_domain: "benefit_design_and_policy_terms_only",
};
const GAPS = { ...TOP, kind: "benchmark_gap_analysis", gap_count: 2, gaps: [
  { feature_id: "copay", feature: "Co-pay", client_value: 0.20, benchmark_value: 0.10, classification: "Above Benchmark", discussion_point: "Co-pay is above the peer benchmark." },
  { feature_id: "ped_waiting", feature: "PED / Waiting Period", client_value: 24, benchmark_value: 12, classification: "Above Benchmark", discussion_point: "Longer wait is less generous." },
] };
const FEATURES = { ...TOP, kind: "benchmark_features", features: [
  { feature_id: "room_rent", feature: "Room Rent", client_value: 0.01, benchmark_value: 0.02, classification: "Below Benchmark", discussion_point: "..." },
] };
const ACTION = {
  id: "a1", feature_id: "copay", feature_name: "Co-pay", current_client_value: "0.2", benchmark_value: "0.1",
  classification: "Above Benchmark", peer_group_definition: { basis: "internal_broker_portfolio" },
  confidence: "medium", status: "flagged", target_module: "discussion_only", simulation_ready: true,
  sandbox_lever: "copay", selected_action: "flag_for_discussion", action_history: [{}],
};

beforeEach(() => {
  (api.benchmarking as any).mockReset();
  (api.benchmarkActions.flagGap as any).mockReset();
  (api.benchmarkActions.get as any).mockReset();
});

describe("Sprint 17 — benchmark gap action UI (one-way linkage)", () => {
  it("shows Flag + Send buttons and a Simulation-ready indicator for a mapped gap (capable user)", async () => {
    (api.benchmarking as any).mockResolvedValue(GAPS);
    renderWithProviders(<BenchmarkGaps />, { route: "/benchmarking/gap-analysis?client_id=C1", principal: ACTOR });
    await waitFor(() => expect(screen.getByTestId("bm-gaps")).toBeInTheDocument());
    // linkage caveat present
    expect(screen.getByTestId("bm-linkage-note")).toHaveTextContent(/does not compute cost impact/i);
    // copay is simulation-ready -> Send button + Simulation-ready indicator
    const rows = screen.getAllByTestId("bm-action-controls");
    expect(rows.length).toBe(2);
    expect(screen.getAllByTestId("bm-flag-btn").length).toBe(2);
    expect(screen.getAllByTestId("bm-send-btn").length).toBe(1);        // only copay is mapped
    expect(screen.getAllByTestId("bm-sim-indicator")[0]).toHaveTextContent(/simulation-ready/i);
    expect(screen.getAllByTestId("bm-sim-indicator")[1]).toHaveTextContent(/discussion only/i);
  });

  it("flagging a gap calls the governed API and renders an action-status badge", async () => {
    (api.benchmarking as any).mockResolvedValue(GAPS);
    (api.benchmarkActions.flagGap as any).mockResolvedValue({ ...ACTION });
    renderWithProviders(<BenchmarkGaps />, { route: "/benchmarking/gap-analysis?client_id=C1", principal: ACTOR });
    await waitFor(() => expect(screen.getByTestId("bm-gaps")).toBeInTheDocument());
    await userEvent.click(screen.getAllByTestId("bm-flag-btn")[0]);
    expect(api.benchmarkActions.flagGap).toHaveBeenCalledWith("copay", { client_id: "C1" }, "flag_for_discussion");
    await waitFor(() => expect(screen.getByTestId("bm-action-status")).toBeInTheDocument());
    expect(screen.getByTestId("bm-action-status")).toHaveTextContent(/flagged/i);
  });

  it("Send to Savings Sandbox uses the send_to_sandbox action", async () => {
    (api.benchmarking as any).mockResolvedValue(GAPS);
    (api.benchmarkActions.flagGap as any).mockResolvedValue({ ...ACTION, target_module: "renewal_sandbox", status: "sent" });
    renderWithProviders(<BenchmarkGaps />, { route: "/benchmarking/gap-analysis?client_id=C1", principal: ACTOR });
    await waitFor(() => expect(screen.getByTestId("bm-gaps")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId("bm-send-btn"));
    expect(api.benchmarkActions.flagGap).toHaveBeenCalledWith("copay", { client_id: "C1" }, "send_to_sandbox");
  });

  it("read-only user (no benchmark_action capability) sees NO action buttons but still sees the indicator", async () => {
    (api.benchmarking as any).mockResolvedValue(GAPS);
    renderWithProviders(<BenchmarkGaps />, { route: "/benchmarking/gap-analysis?client_id=C1", principal: READONLY });
    await waitFor(() => expect(screen.getByTestId("bm-gaps")).toBeInTheDocument());
    expect(screen.queryByTestId("bm-flag-btn")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bm-send-btn")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("bm-sim-indicator").length).toBe(2);   // indicator still informs
  });

  it("without a selected client, flagging prompts to select a client (no API call)", async () => {
    (api.benchmarking as any).mockResolvedValue(GAPS);
    renderWithProviders(<BenchmarkGaps />, { route: "/benchmarking/gap-analysis", principal: ACTOR });
    await waitFor(() => expect(screen.getByTestId("bm-gaps")).toBeInTheDocument());
    await userEvent.click(screen.getAllByTestId("bm-flag-btn")[0]);
    expect(api.benchmarkActions.flagGap).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getAllByTestId("bm-action-error")[0]).toHaveTextContent(/select a client/i));
  });

  it("Features table also exposes governed action controls per feature", async () => {
    (api.benchmarking as any).mockResolvedValue(FEATURES);
    renderWithProviders(<BenchmarkFeatures />, { route: "/benchmarking/features?client_id=C1", principal: ACTOR });
    await waitFor(() => expect(screen.getByTestId("bm-features-table")).toBeInTheDocument());
    expect(screen.getByTestId("bm-linkage-note")).toBeInTheDocument();
    expect(screen.getByTestId("bm-send-btn")).toBeInTheDocument();       // room_rent is mapped
  });
});

describe("Sprint 17 — Savings Sandbox From-benchmark-gap banner", () => {
  it("renders the read-only benchmark-gap context when opened via ?fromAction", async () => {
    (api.benchmarkActions.get as any).mockResolvedValue({ ...ACTION });
    renderWithProviders(<SavingsSandbox />, { route: "/renewal/savings-sandbox?fromAction=a1", principal: ACTOR });
    await waitFor(() => expect(screen.getByTestId("from-benchmark-gap-banner")).toBeInTheDocument());
    expect(api.benchmarkActions.get).toHaveBeenCalledWith("a1");
    const banner = screen.getByTestId("from-benchmark-gap-banner");
    expect(banner).toHaveTextContent("Co-pay");
    expect(banner).toHaveTextContent(/Above Benchmark/);
    expect(banner).toHaveTextContent(/internal_broker_portfolio/);
    expect(banner).toHaveTextContent(/does not compute cost impact/i);
  });

  it("shows no banner when there is no fromAction param", async () => {
    renderWithProviders(<SavingsSandbox />, { route: "/renewal/savings-sandbox", principal: ACTOR });
    expect(screen.queryByTestId("from-benchmark-gap-banner")).not.toBeInTheDocument();
    expect(api.benchmarkActions.get).not.toHaveBeenCalled();
  });
});
