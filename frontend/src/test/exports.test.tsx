import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return { ...actual, api: { ...actual.api, exports: vi.fn(), exportsGenerate: vi.fn(), portfolio: vi.fn() } };
});
import { api } from "../lib/api";
import { ExportClientPack } from "../pages/ExportClientPack";
import { ClientPackPrint } from "../pages/ClientPackPrint";

const CAT = {
  data_quality_status: "Restricted", advisory_blocked: true,
  value: {
    client_id: "C1", client_name: "Acme Corp", content_ids: ["executive_summary", "renewal_intelligence"],
    pack_status: "Restricted", directional: true, verdict: "ready_directional",
    verdict_note: "Exportable, but a Restricted dataset is in scope.",
    counts: { ready: 1, restricted: 1, no_data: 0, total: 2 },
    sections: [
      { id: "executive_summary", title: "Executive Summary", status: "Restricted", readiness: "restricted", caveats: [] },
      { id: "renewal_intelligence", title: "Renewal Intelligence", status: "Analytics Ready", readiness: "ready", caveats: [] },
    ],
  },
};
const PREVIEW = {
  data_quality_status: "Restricted", advisory_blocked: true, caveats: ["Pack contains a Restricted dataset — directional only."],
  formula: "min-band-gates",
  value: {
    client_id: "C1", client_name: "Acme Corp", generated_at: "2026-07-23T00:00:00Z", pack_type: "full_board_pack",
    pack_status: "Restricted", directional: true, trust_note: "Directional — a Restricted dataset is in scope.",
    section_order: ["cover", "executive_summary", "renewal_intelligence", "data_quality_appendix"],
    sections: [
      { id: "cover", title: "Cover", status: "Restricted", readiness: "restricted", headline: "Acme Corp — BenefitIQ client pack", kpis: [], caveats: ["Directional pack."], source_tables: [], confidence: "low", evidence: {} },
      { id: "executive_summary", title: "Executive Summary", status: "Restricted", readiness: "restricted",
        headline: "Operational ICR 120% — priority.", caveats: ["Directional."], source_tables: ["claim"], confidence: "low", evidence: {},
        kpis: [{ label: "Operational ICR", value: 120, format: "percent", data_quality_status: "Restricted", source: "claim" },
               { label: "Top ailment group", value: null, format: "text", data_quality_status: "Restricted", source: "claim" }] },
      { id: "renewal_intelligence", title: "Renewal Intelligence", status: "Analytics Ready", readiness: "ready",
        headline: "Negotiate stance.", kpis: [{ label: "Recommended stance", value: "negotiate", format: "text" }], caveats: [], source_tables: ["claim"], confidence: "medium", evidence: {} },
      { id: "data_quality_appendix", title: "Data Quality / Source Evidence", status: "Restricted", readiness: "restricted",
        headline: "Trust appendix — headline 'Restricted'.", kpis: [], caveats: ["Restricted dataset in scope."], source_tables: ["dataset_version"], confidence: "low", evidence: {},
        appendix: { headline_readiness: "Restricted", weighted_dq_score: 62, active_dataset_count: 2, issues: { critical: 3 },
          gating_reason: "claims dataset Restricted", provenance: [{ section: "Executive Summary", status: "Restricted", source_tables: ["claim"], confidence: "low", caveats: [] }] } },
    ],
  },
};

function route(name: string) { return name.includes("sections") ? CAT : PREVIEW; }

beforeEach(() => {
  (api.exports as any).mockReset(); (api.exportsGenerate as any).mockReset(); (api.portfolio as any).mockReset();
  (api.exports as any).mockImplementation((n: string) => Promise.resolve(route(n)));
  (api.exportsGenerate as any).mockResolvedValue({ audit: { recorded: true } });
});

describe("Export Client Pack workflow (governed board pack)", () => {
  it("renders pack-type, section checklist, readiness, DQ warning, preview cards and appendix", async () => {
    renderWithProviders(<ExportClientPack />, { route: "/export?client_id=C1" });
    await waitFor(() => expect(screen.getByTestId("ex-workflow")).toBeInTheDocument());
    expect(api.exports).toHaveBeenCalledWith("client-pack/sections", { client_id: "C1", pack_type: "full_board_pack" });
    expect(screen.getByTestId("ex-packtype")).toBeInTheDocument();
    expect(screen.getByTestId("ex-checklist")).toHaveTextContent("Executive Summary");
    expect(screen.getAllByTestId("ex-section-row").length).toBe(2);
    expect(screen.getByTestId("ex-readiness")).toHaveTextContent(/ready directional/i);
    expect(screen.getByTestId("ex-dq-warning")).toBeInTheDocument();          // Restricted -> directional
    await waitFor(() => expect(screen.getByTestId("ex-preview")).toBeInTheDocument());
    expect(screen.getAllByTestId("ex-preview-card").length).toBe(2);           // cover + appendix excluded
    expect(screen.getByTestId("ex-preview")).toHaveTextContent("120%");        // governed KPI value
    expect(screen.getByTestId("ex-preview")).toHaveTextContent(/Not available/i); // null KPI
    expect(screen.getByTestId("ex-appendix")).toBeInTheDocument();
    expect(screen.getByTestId("restricted-banner")).toBeInTheDocument();
  });

  it("generate calls the governed generate endpoint (audit) then opens the print view", async () => {
    renderWithProviders(<ExportClientPack />, { route: "/export?client_id=C1" });
    await waitFor(() => expect(screen.getByTestId("ex-generate")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("ex-generate"));
    await waitFor(() => expect(api.exportsGenerate).toHaveBeenCalledWith("client-pack/generate", { client_id: "C1", pack_type: "full_board_pack" }));
  });

  it("without a client_id shows the governed client picker", async () => {
    (api.portfolio as any).mockResolvedValue({ value: { clients: [{ client_id: "C1", client_name: "Acme Corp" }] } });
    renderWithProviders(<ExportClientPack />, { route: "/export" });
    await waitFor(() => expect(screen.getByTestId("ex-picker")).toBeInTheDocument());
    expect(screen.getByTestId("ex-picker")).toHaveTextContent("Acme Corp");
  });

  it("no governed sections renders the empty state", async () => {
    (api.exports as any).mockImplementation(() => Promise.resolve({ data_quality_status: "No Data", value: { sections: [], verdict: "not_ready", verdict_note: "none" } }));
    renderWithProviders(<ExportClientPack />, { route: "/export?client_id=C1" });
    await waitFor(() => expect(screen.getByTestId("empty-state")).toBeInTheDocument());
  });
});

describe("Client Pack print view", () => {
  it("renders the governed pack: cover, sections and evidence appendix", async () => {
    (api.exports as any).mockResolvedValue(PREVIEW);
    renderWithProviders(<ClientPackPrint />, { route: "/export/print?client_id=C1&pack_type=full_board_pack" });
    await waitFor(() => expect(screen.getByTestId("pack-print")).toBeInTheDocument());
    expect(screen.getByTestId("pack-cover")).toHaveTextContent("Acme Corp");
    expect(screen.getAllByTestId("pack-section").length).toBe(2);
    expect(screen.getByTestId("pack-appendix")).toHaveTextContent(/Source Evidence/i);
    expect(screen.getByTestId("pack-print")).toHaveTextContent("120%");
  });

  it("renders Not Available for missing governed figures", async () => {
    (api.exports as any).mockResolvedValue(PREVIEW);
    renderWithProviders(<ClientPackPrint />, { route: "/export/print?client_id=C1" });
    await waitFor(() => expect(screen.getByTestId("pack-print")).toBeInTheDocument());
    expect(screen.getByTestId("pack-print")).toHaveTextContent(/Not available/i);
  });
});
