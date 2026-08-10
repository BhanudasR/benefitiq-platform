import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");

function readDoc(name: string): string {
  return fs.readFileSync(path.join(root, "docs", name), "utf8");
}

describe("visual governance documentation", () => {
  it("defines the dashboard visual QA standard without screenshot comparison tooling", () => {
    const standard = readDoc("visual-qa-standard.md");

    expect(standard).toContain("Approved dashboard reference images are product requirements");
    expect(standard).toContain("1600x1000");
    expect(standard).toContain("1440x900");
    expect(standard).toContain("390x844");
    expect(standard).toContain("review-artifacts/visual-qa/");
    expect(standard).toContain("Not Available");
    expect(standard).toContain("Evidence/Caveat Footer");
    expect(standard).toContain("90-100");
    expect(standard).toContain("Founder-ready");
    expect(standard).toContain("No frontend KPI or business calculation");
  });

  it("creates a dashboard backlog from the accepted visual audit", () => {
    const backlog = readDoc("dashboard-visual-backlog.md");

    expect(backlog).toContain("Executive Summary");
    expect(backlog).toContain("Broker Portfolio");
    expect(backlog).toContain("Client Portfolio");
    expect(backlog).toContain("Renewal Intelligence_Overview.png");
    expect(backlog).toContain("Sprint 5");
    expect(backlog).toContain("Founder acceptance");
  });
});
