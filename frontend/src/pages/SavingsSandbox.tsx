import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtPercent, fmtNumber, fmtValue } from "../lib/format";
import {
  Card, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { EvidenceDrawer, ScenarioControl, EmployeeImpactCallout } from "../components/ui/sandbox";
import { KpiStat, ChartFrame, BarH, SERIES } from "../components/ui/charts";

const NA = "Not Available";

function clean(v: string): string {
  return v === "-" || v === "â€”" ? NA : v;
}

function money(v: number | null | undefined): string {
  return clean(fmtCurrency(v));
}

function pct(v: number | null | undefined): string {
  return clean(fmtPercent(v));
}

function num(v: number | null | undefined): string {
  return clean(fmtNumber(v));
}

type Lever = { id: string; label: string; params: Array<{ k: string; label: string; suffix?: string }> };

const LEVERS: Lever[] = [
  { id: "room-rent", label: "Room Rent", params: [{ k: "room_rent_pct", label: "Room rent percent as fraction", suffix: "of SI" }] },
  { id: "copay", label: "Co-pay", params: [{ k: "copay_pct", label: "Co-pay percent as fraction" }] },
  { id: "parent-copay", label: "Parent Co-pay", params: [{ k: "parent_copay_pct", label: "Parent co-pay percent as fraction" }] },
  { id: "disease-cap", label: "Disease Cap", params: [{ k: "proposed_cap", label: "Proposed cap amount" }] },
  { id: "maternity-sublimit", label: "Maternity Sublimit", params: [{ k: "proposed_cap", label: "Sublimit amount" }] },
  { id: "corporate-buffer", label: "Corporate Buffer", params: [] },
  { id: "scenario", label: "Multi-lever Scenario", params: [
    { k: "room_rent_pct", label: "Room rent percent" },
    { k: "copay_pct", label: "Co-pay percent" },
    { k: "disease_cap", label: "Disease cap amount" },
  ] },
];

const pick = (o: any, keys: string[]) => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

function FromBenchmarkGapBanner() {
  const [sp] = useSearchParams();
  const actionId = sp.get("fromAction") || undefined;
  const q = useQuery({
    queryKey: ["bm-action", actionId], enabled: !!actionId,
    queryFn: () => api.benchmarkActions.get(actionId as string),
  });
  if (!actionId || !q.data) return null;
  const a = q.data;
  return (
    <Card className="p-4 border-l-4 border-l-brand">
      <div data-testid="from-benchmark-gap-banner">
        <div className="text-xs font-semibold uppercase tracking-wide text-brand mb-1">From benchmark gap</div>
        <div className="text-sm font-semibold text-ink">{a.feature_name}
          <span className="ml-2 text-[11px] font-medium text-muted">({String(a.classification)})</span></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm mt-2">
          <div><span className="text-muted">Client value: </span>{a.current_client_value != null ? fmtValue(a.current_client_value) : NA}</div>
          <div><span className="text-muted">Peer benchmark: </span>{a.benchmark_value != null ? fmtValue(a.benchmark_value) : NA}</div>
          <div><span className="text-muted">Peer group: </span>{String(a.peer_group_definition?.basis || NA)}</div>
          <div><span className="text-muted">Confidence: </span>{String(a.confidence || NA)}</div>
        </div>
        <div className="text-xs text-muted mt-2">Context only. This page does not compute cost impact; impact simulation below is computed by the governed simulation service.</div>
      </div>
    </Card>
  );
}

function TopContextBar({ status }: { status: string }) {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between" data-testid="sandbox-top-context">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Benefit and Savings Sandbox</h1>
        <p className="mt-1 text-sm text-muted">Scenario canvas for governed renewal levers. Backend engines calculate; frontend displays.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-xl2 border border-line bg-card px-4 py-2 text-xs">
          <span className="text-muted">Scenario status: </span><span className="font-semibold text-ink">{status}</span>
        </div>
        <button className="rounded-xl2 bg-brand px-4 py-2 text-sm font-semibold text-white">Export</button>
      </div>
    </div>
  );
}

export function SavingsSandbox() {
  const [leverId, setLeverId] = useState("room-rent");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [state, setState] = useState<{ loading: boolean; data: any; error: string | null }>({ loading: false, data: null, error: null });
  const [ev, setEv] = useState(false);
  const lever = LEVERS.find((l) => l.id === leverId)!;

  async function run() {
    const params: Record<string, any> = {};
    for (const p of lever.params) if (vals[p.k] !== undefined && vals[p.k] !== "") params[p.k] = vals[p.k];
    setState({ loading: true, data: null, error: null });
    try {
      const data = await api.simulation(leverId, params);
      setState({ loading: false, data, error: null });
    } catch (e: any) {
      setState({ loading: false, data: null, error: e.message || "Simulation failed" });
    }
  }

  const r = state.data;
  const v = r?.value;
  const saving = v ? pick(v, ["portfolio_saving", "employer_saving", "combined_saving", "estimated_buffer_draw"]) : undefined;
  const premiumImpact = v ? pick(v, ["premium_impact", "estimated_premium_impact"]) : undefined;
  const revisedIcr = v ? pick(v, ["revised_icr", "combined_revised_icr"]) : undefined;
  const affected = v ? pick(v, ["affected_claims", "large_claim_count", "claims_exceeding_si"]) : undefined;
  const memberOop = v?.member_out_of_pocket;
  const gap = v?.employee_gap_risk;
  const status = r?.data_quality_status || "Not run";

  return (
    <div className="space-y-5" data-testid="sandbox-master-screen">
      <TopContextBar status={status} />
      <FromBenchmarkGapBanner />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.8fr,1.3fr,0.9fr]" data-testid="sandbox-canvas">
        <Card className="p-4">
          <div data-testid="sandbox-lever-rail">
            <div className="text-sm font-semibold text-ink">Lever Rail</div>
            <div className="mt-1 text-xs text-muted">Backend-supported levers only</div>
            <div className="mt-3 grid grid-cols-1 gap-2">
              {LEVERS.map((l) => (
                <button key={l.id} data-testid={`lever-${l.id}`} onClick={() => { setLeverId(l.id); setState({ loading: false, data: null, error: null }); }}
                  className={`text-left text-sm px-3 py-2 rounded-lg border ${leverId === l.id ? "bg-brandSoft text-brand border-blue-200" : "border-line text-ink/80 hover:bg-slate-50"}`}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div data-testid="sandbox-scenario-inputs">
            <div className="text-sm font-semibold text-ink">{lever.label} Scenario</div>
            <div className="mt-1 text-xs text-muted">Run calls the governed simulation API. No React-side simulation math.</div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {lever.params.map((p) => (
                <ScenarioControl key={p.k} label={p.label} suffix={p.suffix}
                  value={vals[p.k] || ""} onChange={(val) => setVals((s) => ({ ...s, [p.k]: val }))} />
              ))}
              {lever.params.length === 0 && <div className="rounded-lg border border-line bg-slate-50 px-3 py-2 text-sm text-muted">No manual input required for this governed backend scenario.</div>}
            </div>
            <button data-testid="run-scenario" onClick={run}
              className="mt-4 bg-brand text-white text-sm font-medium rounded-lg px-5 py-2">Run scenario</button>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-amber-500">
          <div data-testid="sandbox-hr-caveat">
            <div className="text-sm font-semibold text-ink">HR Sensitivity Caveat</div>
            <p className="mt-2 text-sm leading-6 text-ink/80">Savings and member impact are displayed only when the backend returns them. Benefit design changes need HR review before client-ready use.</p>
            <div className="mt-3 rounded-lg border border-line bg-slate-50 px-3 py-2">
              <div className="text-xs text-muted">Premium impact</div>
              <div className="mt-1 text-lg font-semibold text-ink">{premiumImpact !== undefined ? money(premiumImpact) : NA}</div>
            </div>
          </div>
        </Card>
      </div>

      {state.loading && <Skeleton rows={3} />}
      {state.error && <ErrorState message={state.error} onRetry={run} />}
      {!state.loading && !state.error && !r && <EmptyState title="No scenario run yet" message="Choose a lever, set inputs if required, and run the governed simulation to see backend-supported values." />}

      {r && v && (
        <div className="space-y-4">
          <RestrictedBanner blocked={r.advisory_blocked} />
          <CaveatBanner caveats={r.caveats} />
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4" data-testid="sandbox-kpis">
            <KpiStat label="Portfolio Saving" value={saving !== undefined ? money(saving) : NA} sub={`term_basis: ${v.term_basis || NA}`} testid="portfolio-saving" />
            <KpiStat label="Revised ICR" value={revisedIcr !== undefined ? pct(revisedIcr) : NA} sub={`Operational: ${pct(r.operational_icr?.operational_icr)}`} testid="revised-icr" />
            <KpiStat label="Affected Claims" value={affected !== undefined ? num(affected) : NA} sub="Backend supplied only" testid="affected-claims" />
            <KpiStat label="Employee Impact" value={(memberOop !== undefined || gap !== undefined) ? money(gap !== undefined ? gap : memberOop) : NA} sub="Backend supplied only" testid="employee-impact-kpi" />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartFrame title="Scenario Outcome" subtitle="Returned values only" status={r.data_quality_status} evidence={r} evidenceTitle="Simulation evidence" testid="sandbox-outcome-chart">
              <BarH data={[
                { label: "Portfolio saving", value: saving, color: SERIES[1] },
                { label: "Premium impact", value: premiumImpact, color: SERIES[2] },
              ]} format={(x) => money(x)} />
            </ChartFrame>
            <Card className="p-4">
              <div data-testid="sandbox-not-available">
                <div className="text-sm font-semibold text-ink">Unsupported Scenario Outputs</div>
                <div className="mt-3 grid grid-cols-1 gap-2">
                  {["Guaranteed savings", "Strategy score", "Premium impact if absent", "Scenario comparison"].map((label) => (
                    <div key={label} className="rounded-lg border border-line bg-slate-50 px-3 py-2">
                      <div className="text-xs text-muted">{label}</div>
                      <div className="mt-1 text-sm font-semibold text-ink">{label === "Premium impact if absent" && premiumImpact !== undefined ? money(premiumImpact) : NA}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {(memberOop !== undefined || gap !== undefined) && (
            <EmployeeImpactCallout
              label={gap !== undefined ? "Employee gap risk above cap" : "Member out-of-pocket co-pay"}
              amount={money(gap !== undefined ? gap : memberOop)}
              note="Shown only when returned by the backend simulation." />
          )}

          <Card className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted mb-1">Formula and assumptions</div>
            <div className="text-sm text-ink">{r.formula || NA}</div>
            {Array.isArray(r.assumptions) && r.assumptions.length > 0 && (
              <ul className="list-disc pl-5 mt-2 text-sm text-muted space-y-0.5">{r.assumptions.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul>
            )}
            <button className="mt-3 text-xs font-medium text-brand hover:underline" onClick={() => setEv(true)}>View full evidence</button>
          </Card>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3" data-testid="sandbox-action-rail">
            <Card className="p-4"><div data-testid="sandbox-alerts"><div className="text-sm font-semibold text-ink">Scenario Alerts</div><div className="mt-3 text-sm text-bad rounded-lg border border-red-200 bg-red-50 px-3 py-2">Employee impact score: {NA}</div></div></Card>
            <Card className="p-4"><div data-testid="sandbox-opportunities"><div className="text-sm font-semibold text-ink">Opportunities</div><div className="mt-3 text-sm text-good rounded-lg border border-green-200 bg-green-50 px-3 py-2">Compare backend-supported levers before strategy selection</div></div></Card>
            <Card className="p-4"><div data-testid="sandbox-action-center"><div className="text-sm font-semibold text-ink">Action Center</div><div className="mt-3 text-sm rounded-lg border border-line px-3 py-2">Move supported scenario to Recommended Strategy</div></div></Card>
          </div>

          <FourQuestions
            soWhat={saving !== undefined ? `${lever.label} returned portfolio saving ${money(saving)} and revised ICR ${pct(revisedIcr)}.` : `${lever.label} scenario computed by the governed simulation.`}
            why="The saving, revised ICR and affected claims are all returned by the backend simulation, never calculated in the browser."
            next={(memberOop !== undefined || gap !== undefined) ? "Weigh the employer saving against the employee or member impact shown above before recommending this lever." : "Compare this lever against others before recommending it."}
            trust={`Figures from the governed simulation API on ${r.data_quality_status} data. Unsupported premium, savings and employee-impact values remain ${NA}.`} />

          <Card className="p-4">
            <div data-testid="sandbox-evidence-footer" className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-ink">Evidence and Caveats</div>
                <div className="mt-1 text-xs text-muted">Every major output is returned by the governed simulation API. Unsupported outputs stay {NA}.</div>
              </div>
              <DataQualityBadge status={r.data_quality_status} />
            </div>
          </Card>
        </div>
      )}
      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="Simulation evidence" evidence={r || null} />
    </div>
  );
}
