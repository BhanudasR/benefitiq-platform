import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./util";

/** Mock postForm (the internal multipart helper) by intercepting global fetch. */
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

/** Helper: create a minimal fake File object. */
function fakeFile(name = "claims_sample_masked.csv", content = "col1,col2\nv1,v2") {
  return new File([content], name, { type: "text/csv" });
}

function jsonResp(body: any, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

const PROFILE_RESP = {
  file_kind: "claims", table: "claims",
  profile: { row_count: 50, column_count: 6, blank_rows: 0, headers: ["claim_no", "member_id", "total_claim_amount"] },
};
const MAPPING_SUGGEST_RESP = {
  overall_confidence: 0.87,
  unmapped_mandatory: [],
  saved_profile_available: false,
  layout_signature: "abc123",
  suggestions: [
    { source_header: "claim_no", suggested_canonical: "claim_number", confidence: 0.95, status: "mapped" },
    { source_header: "member_id", suggested_canonical: "member_id", confidence: 0.91, status: "mapped" },
    { source_header: "total_claim_amount", suggested_canonical: "total_claim_amount", confidence: 0.88, status: "mapped" },
  ],
};
const MAPPING_CONFIRM_RESP = { confirmed: true, signature: "abc123", field_map: {}, profile_saved: false };
const VALIDATE_RESP = {
  counts: { errors: 0, warnings: 2, info: 1, total: 3 },
  issues: [
    { severity: "WARNING", rule: "missing_optional", row_index: 4, field: "diagnosis_code", raw_value: null },
  ],
};
const DQ_RESP = {
  file_kind: "claims", table: "claims",
  mapping: { overall_confidence: 0.87, unmapped_mandatory: [] },
  dq_score: {
    overall: 84.5, band: "Conditional",
    components: [
      { name: "completeness", score: 92, weight: 0.25 },
      { name: "critical_error_rate", score: 100, weight: 0.15 },
      { name: "mapping_confidence", score: 87, weight: 0.15 },
      { name: "mandatory_coverage", score: 100, weight: 0.15 },
      { name: "row_count_adequacy", score: 80, weight: 0.10 },
      { name: "version_lineage", score: 100, weight: 0.10 },
      { name: "date_range_coverage", score: 40, weight: 0.05 },
      { name: "referential_integrity", score: 90, weight: 0.05 },
    ],
    caveats: ["Date range coverage is limited — fewer than 6 months of claims data detected."],
  },
  validation_counts: { errors: 0, warnings: 2, info: 1 },
  review_queue: { quarantined_count: 0, analytics_eligible_count: 50, quarantine: [] },
};

import { DataOnboarding } from "../pages/DataOnboarding";

beforeEach(() => { mockFetch.mockReset(); });

describe("Data Onboarding Wizard (Sprint 27)", () => {

  it("renders the wizard on step 0 with empty state when no file is selected", () => {
    renderWithProviders(<DataOnboarding />);
    expect(screen.getByText(/Data Onboarding/i)).toBeInTheDocument();
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.getByTestId("step-indicator-0")).toBeInTheDocument();
  });

  it("file kind selector renders all three options and allows switching", async () => {
    renderWithProviders(<DataOnboarding />);
    expect(screen.getByTestId("file-kind-policy")).toBeInTheDocument();
    expect(screen.getByTestId("file-kind-member")).toBeInTheDocument();
    expect(screen.getByTestId("file-kind-claims")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("file-kind-policy"));
    expect(screen.getByTestId("file-kind-policy").className).toContain("border-brand");
  });

  it("step navigation: upload button is disabled with no file", () => {
    renderWithProviders(<DataOnboarding />);
    expect(screen.getByTestId("upload-next")).toBeDisabled();
  });

  it("renders profile result after successful upload + profile call", async () => {
    mockFetch
      .mockImplementationOnce(() => jsonResp(PROFILE_RESP))
      .mockImplementationOnce(() => jsonResp(MAPPING_SUGGEST_RESP));
    renderWithProviders(<DataOnboarding />);
    const dropZone = screen.getByTestId("drop-zone");
    const fileInput = screen.getByTestId("file-input");
    fireEvent.change(fileInput, { target: { files: [fakeFile()] } });
    await waitFor(() => expect(screen.getByTestId("upload-next")).not.toBeDisabled());
    await userEvent.click(screen.getByTestId("upload-next"));
    await waitFor(() => expect(screen.getByTestId("mapping-table")).toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("mapping table renders suggestions with editable inputs and confidence pills", async () => {
    mockFetch
      .mockImplementationOnce(() => jsonResp(PROFILE_RESP))
      .mockImplementationOnce(() => jsonResp(MAPPING_SUGGEST_RESP));
    renderWithProviders(<DataOnboarding />);
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [fakeFile()] } });
    await userEvent.click(screen.getByTestId("upload-next"));
    await waitFor(() => expect(screen.getByTestId("mapping-table")).toBeInTheDocument());
    expect(screen.getAllByTestId("confidence-pill").length).toBeGreaterThan(0);
    expect(screen.getByTestId("map-input-0")).toBeInTheDocument();
    expect((screen.getByTestId("map-input-0") as HTMLInputElement).value).toBe("claim_number");
  });

  it("confirm mapping proceeds to validation split step", async () => {
    mockFetch
      .mockImplementationOnce(() => jsonResp(PROFILE_RESP))
      .mockImplementationOnce(() => jsonResp(MAPPING_SUGGEST_RESP))
      .mockImplementationOnce(() => jsonResp(MAPPING_CONFIRM_RESP))
      .mockImplementationOnce(() => jsonResp(VALIDATE_RESP));
    renderWithProviders(<DataOnboarding />);
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [fakeFile()] } });
    await userEvent.click(screen.getByTestId("upload-next"));
    await waitFor(() => expect(screen.getByTestId("confirm-mapping")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId("confirm-mapping"));
    await waitFor(() => expect(screen.getByTestId("validation-split")).toBeInTheDocument());
    expect(screen.getByTestId("sev-critical")).toHaveTextContent("0");
    expect(screen.getByTestId("sev-warning")).toHaveTextContent("2");
  });

  it("validation split renders error / warning / info counts from the API", async () => {
    mockFetch
      .mockImplementationOnce(() => jsonResp(PROFILE_RESP))
      .mockImplementationOnce(() => jsonResp(MAPPING_SUGGEST_RESP))
      .mockImplementationOnce(() => jsonResp(MAPPING_CONFIRM_RESP))
      .mockImplementationOnce(() => jsonResp(VALIDATE_RESP));
    renderWithProviders(<DataOnboarding />);
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [fakeFile()] } });
    await userEvent.click(screen.getByTestId("upload-next"));
    await waitFor(() => expect(screen.getByTestId("confirm-mapping")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId("confirm-mapping"));
    await waitFor(() => expect(screen.getByTestId("sev-info")).toBeInTheDocument());
    expect(screen.getByTestId("sev-info")).toHaveTextContent("1");
  });

  it("DQ score breakdown renders 8 components and readiness badge from API", async () => {
    mockFetch
      .mockImplementationOnce(() => jsonResp(PROFILE_RESP))
      .mockImplementationOnce(() => jsonResp(MAPPING_SUGGEST_RESP))
      .mockImplementationOnce(() => jsonResp(MAPPING_CONFIRM_RESP))
      .mockImplementationOnce(() => jsonResp(VALIDATE_RESP))
      .mockImplementationOnce(() => jsonResp(DQ_RESP));
    renderWithProviders(<DataOnboarding />);
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [fakeFile()] } });
    await userEvent.click(screen.getByTestId("upload-next"));
    await waitFor(() => expect(screen.getByTestId("confirm-mapping")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId("confirm-mapping"));
    await waitFor(() => expect(screen.getByTestId("validate-next")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId("validate-next"));
    await waitFor(() => expect(screen.getByTestId("dq-components")).toBeInTheDocument());
    expect(screen.getByTestId("dq-overall")).toHaveTextContent("84.5");
    expect(screen.getByTestId("dq-components").querySelectorAll("div.flex.items-center").length).toBe(8);
  });

  it("readiness badge renders correct band label from API", async () => {
    mockFetch
      .mockImplementationOnce(() => jsonResp(PROFILE_RESP))
      .mockImplementationOnce(() => jsonResp(MAPPING_SUGGEST_RESP))
      .mockImplementationOnce(() => jsonResp(MAPPING_CONFIRM_RESP))
      .mockImplementationOnce(() => jsonResp(VALIDATE_RESP))
      .mockImplementationOnce(() => jsonResp(DQ_RESP));
    renderWithProviders(<DataOnboarding />);
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [fakeFile()] } });
    await userEvent.click(screen.getByTestId("upload-next"));
    await waitFor(() => screen.getByTestId("confirm-mapping"));
    await userEvent.click(screen.getByTestId("confirm-mapping"));
    await waitFor(() => screen.getByTestId("validate-next"));
    await userEvent.click(screen.getByTestId("validate-next"));
    await waitFor(() => expect(screen.getByTestId("dq-badge")).toHaveTextContent("Conditional"));
  });

  it("review / quarantine summary renders after DQ step", async () => {
    const TO = { timeout: 8000 };
    mockFetch
      .mockImplementationOnce(() => jsonResp(PROFILE_RESP))
      .mockImplementationOnce(() => jsonResp(MAPPING_SUGGEST_RESP))
      .mockImplementationOnce(() => jsonResp(MAPPING_CONFIRM_RESP))
      .mockImplementationOnce(() => jsonResp(VALIDATE_RESP))
      .mockImplementationOnce(() => jsonResp(DQ_RESP));
    renderWithProviders(<DataOnboarding />);
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [fakeFile()] } });
    await userEvent.click(screen.getByTestId("upload-next"));
    await waitFor(() => expect(screen.getByTestId("confirm-mapping")).toBeInTheDocument(), TO);
    await userEvent.click(screen.getByTestId("confirm-mapping"));
    await waitFor(() => expect(screen.getByTestId("validate-next")).toBeInTheDocument(), TO);
    await userEvent.click(screen.getByTestId("validate-next"));
    await waitFor(() => expect(screen.getByTestId("dq-next")).toBeInTheDocument(), TO);
    await userEvent.click(screen.getByTestId("dq-next"));
    await waitFor(() => expect(screen.getByTestId("review-summary")).toBeInTheDocument(), TO);
    expect(screen.getByTestId("onboard-another")).toBeInTheDocument();
  }, 12000);

  it("shows error state when profile API call fails", async () => {
    mockFetch.mockImplementationOnce(() => jsonResp({ detail: "server error" }, 500));
    renderWithProviders(<DataOnboarding />);
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [fakeFile()] } });
    await userEvent.click(screen.getByTestId("upload-next"));
    await waitFor(() => expect(screen.getByTestId("error-state")).toBeInTheDocument());
  });

  it("No Data / empty state renders before file is selected", () => {
    renderWithProviders(<DataOnboarding />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.queryByTestId("mapping-table")).not.toBeInTheDocument();
    expect(screen.queryByTestId("validation-split")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dq-components")).not.toBeInTheDocument();
  });
});
