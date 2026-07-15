import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/** Guard: the frontend must not compute official KPIs. We strip comments/strings
 *  and assert no binary * or / arithmetic appears in the pages/format layer —
 *  numbers come only from the governed API and are formatted for display. */
function stripped(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")        // block comments
    .replace(/\/\/[^\n]*/g, " ")               // line comments
    .replace(/`(?:\\.|[^`\\])*`/g, "``")       // template literals
    .replace(/"(?:\\.|[^"\\])*"/g, '""')        // double-quoted strings
    .replace(/'(?:\\.|[^'\\])*'/g, "''");       // single-quoted strings
}

function filesIn(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return fs.statSync(p).isDirectory() ? filesIn(p) : [p];
  }).filter((p) => /\.(ts|tsx)$/.test(p));
}

describe("no frontend KPI math guard", () => {
  it("pages + format layer contain no business arithmetic on values", () => {
    const targets = [...filesIn("src/pages"), "src/lib/format.ts"];
    const mathRe = /[\w\)\]]\s*[*/]\s*[\w\(]/;   // e.g. a*b or a/b (JSX '/>' won't match)
    const offenders: string[] = [];
    for (const f of targets) {
      const code = stripped(fs.readFileSync(f, "utf8"));
      if (mathRe.test(code)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
