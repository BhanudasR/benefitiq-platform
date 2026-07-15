import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./util";

vi.mock("../lib/api", async (orig) => {
  const actual: any = await orig();
  return { ...actual, api: { ...actual.api, batch: vi.fn(), reviewQueue: vi.fn() } };
});
import { api } from "../lib/api";
import { DataOnboarding } from "../pages/DataOnboarding";

describe("Data Onboarding (API-driven)", () => {
  it("shows a premium empty state before a batch is tracked", () => {
    renderWithProviders(<DataOnboarding />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("renders governed batch status + DQ + review queue from the API", async () => {
    (api.batch as any).mockResolvedValue({ batch_id: "b1", status: "ACTIVE", file_kind: "claims",
      dataset_version: { readiness_status: "Conditional / Review Recommended", dq_score: 82.9, restricted: false } });
    (api.reviewQueue as any).mockResolvedValue({ total: 4, quarantined_count: 1, quarantine: [] });
    renderWithProviders(<DataOnboarding />);
    await userEvent.type(screen.getByLabelText("Batch ID"), "b1");
    await userEvent.click(screen.getByTestId("track-batch"));
    await waitFor(() => expect(screen.getByText(/Batch status: ACTIVE/i)).toBeInTheDocument());
    expect(screen.getByTestId("dq-badge")).toHaveTextContent("Conditional");
    expect(screen.getByText(/Quarantined rows:/i)).toBeInTheDocument();
  });
});
