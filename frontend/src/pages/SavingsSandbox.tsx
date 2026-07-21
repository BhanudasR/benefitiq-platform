import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtPercent, fmtNumber, fmtValue } from "../lib/format";
import {
  SectionHeader, Card, DecisionSummary, DataQualityBadge, CaveatBanner,
  RestrictedBanner, Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { EvidenceDrawer, ScenarioControl, EmployeeImpactCallout } from "../components/ui/sandbox";

/** Read-only "From benchmark gap" context banner (Sprint 17). When the Savings Sandbox is
 *  opened from a benchmark action (?fromAction=<id>), show the originating gap's design/T&C
 *  context — display only, no benchmark or simulation math here. Completes the one-way flow. */
function FromBenchmarkGapBanner() {
  const [sp] = useSearchParams();
  const actionId = sp.get("fromAction") || undefined;
  const q = useQuery({
    queryKey: ["bm-action", actionId], enabled: !!actionId,
    queryFn: () => api.benchmarkActions.get(actionId as string),
  });
  if (!actionId) return null;
  const a = q.data;
  if (!a) return null;
  return (
    <Card className="p-4 border-l-4 border-l-brand" >
      <div data-testid="from-benchmark-gap-banner">
        <div className="text-xs font-semibold uppercase tracking-wide text-brand mb-1">From benchmark gap</div>
        <div className="text-sm font-semibold text-ink">{a.feature_name}
          <span className="ml-2 text-[11px] font-medium text-muted">({String(a.classification)})</span></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm mt-2">
          <div><span className="text-muted">Client value: </span>{a.current_client_value != null ? fmtValue(a.current_client_value) : "—"}</div>
          <div><span className="text-muted">Peer benchmark: </span>{a.benchmark_value != null ? fmtValue(a.benchmark_value) : "—"}</div>
          <div><span className="text-muted">Peer group: </span>{String(a.peer_group_definition?.basis || "—")}</div>
          <div><span className="text-muted">Confidence: </span>{String(a.confidence || "—")}</div>
        </div>
        <div className="text-xs text-muted mt-2">
          {"Context only — this benchmark gap was flagged in Benefit Benchmarking (benefit design / policy terms). Impact simulation below is computed by the governed simulation service; benchmarking does not compute cost impact."}
        </div>
      </div>
    </Card>
  );
}

type Lever = { id: string; label: string; params: Array<{ k: string; label: string; suffix?: string }> };

const LEVERS: Lever[] = [
  { id: "room-rent", label: "Room Rent", params: [{ k: "room_rent_pct", label: "Room rent % (fraction, e.g. 0.01)", suffix: "of SI" }] },
  { id: "copay", label: "Co-pay", params: [{ k: "copay_pct", label: "Co-pay % (fraction, e.g. 0.10)" }] },
  { id: "parent-copay", label: "Parent Co-pay", params: [{ k: "parent_copay_pct", label: "Parent co-pay % (fraction)" }] },
  { id: "disease-cap", label: "Disease / Procedure Cap", params: [{ k: "proposed_cap", label: "Proposed cap (Rs)" }] },
  { id: "maternity-sublimit", label: "Maternity Sub-limit", params: [{ k: "proposed_cap", label: "Sub-limit (Rs)" }] },
  { id: "corporate-buffer", label: "Corporate Buffer", params: [] },
  { id: "scenario", label: "Multi-lever Scenario", params: [
    { k: "room_rent_pct", label: "Room rent %" }, { k: "copay_pct", label: "Co-pay %" }, { k: "disease_cap", label: "Disease cap (Rs)" }] },
];

const pick = (o: any, keys: string[]) => { for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k]; return undefined; };

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
      const data = await api.simulation(leverId, params);   // ALL computation happens in the backend
      setState({ loading: false, data, error: null });
    } catch (e: any) {
      setState({ loading: false, data: null, error: e.message || "Simulation failed" });
    }
  }

  const r = state.data;
  const v = r?.value;
  const saving = v ? pick(v, ["portfolio_saving", "employer_saving", "combined_saving", "estimated_buffer_draw"]) : undefined;
  const revisedIcr = v ? pick(v, ["revised_icr", "combined_revised_icr"]) : undefined;
  const affected = v ? pick(v, ["affected_claims", "large_claim_count", "claims_exceeding_si"]) : undefined;
  const memberOop = v?.member_out_of_pocket;
  const gap = v?.employee_gap_risk;

  return (
    <div className="space-y-5">
      <SectionHeader title="Benefit & Savings Sandbox" subtitle="Governed what-if — all savings computed by the backend, never in the browser" />
      <FromBenchmarkGapBanner />
      <Card className="p-4">
        <div className="flex flex-wrap gap-2 mb-4">
          {LEVERS.map((l) => (
            <button key={l.id} data-testid={`lever-${l.id}`} onClick={() => { setLeverId(l.id); setState({ loading: false, data: null, error: null }); }}
              className={`text-sm px-3 py-1.5 rounded-lg border ${leverId === l.id ? "bg-brandSoft text-brand border-blue-200" : "border-line text-ink/80 hover:bg-slate-50"}`}>
              {l.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {lever.params.map((p) => (
            <ScenarioControl key={p.k} label={p.label} suffix={p.suffix}
              value={vals[p.k] || ""} onChange={(val) => setVals((s) => ({ ...s, [p.k]: val }))} />
          ))}
        </div>
        <button data-testid="run-scenario" onClick={run}
          className="mt-4 bg-brand text-white text-sm font-medium rounded-lg px-5 py-2">Run scenario</button>
        <div className="text-xs text-muted mt-2">Running calls the governed simulation API; figures below are returned by the backend.</div>
      </Card>

      {state.loading && <Skeleton rows={3} />}
      {state.error && <ErrorState message={state.error} onRetry={run} />}
      {!state.loading && !state.error && !r && <EmptyState title="No scenario run yet" message="Choose a lever, set the inputs and run the governed simulation to see portfolio saving, revised ICR and member impact — with source and assumptions." />}

      {r && v && (
        <div className="space-y-4">
          <RestrictedBanner blocked={r.advisory_blocked} />
          <DecisionSummary title={`${lever.label} scenario — ${r.data_quality_status}`} points={[
            saving !== undefined ? `Portfolio saving ${fmtCurrency(saving)} (basis: ${v.term_basis || "request/config"}).` : "Saving not applicable for this lever.",
            revisedIcr !== undefined ? `Revised ICR ${fmtPercent(revisedIcr)} vs operational ${fmtPercent(r.operational_icr?.operational_icr)} (operational is unchanged).` : `Operational ICR ${fmtPercent(r.operational_icr?.operational_icr)} (unchanged).`,
          ]} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4"><div className="text-xs uppercase tracking-wide text-muted">Portfolio Saving</div>
              <div className="text-2xl font-semibold mt-1" data-testid="portfolio-saving">{saving !== undefined ? fmtCurrency(saving) : "—"}</div>
              <div className="text-xs text-muted mt-1">term_basis: {v.term_basis || "—"}</div></Card>
            <Card className="p-4"><div className="text-xs uppercase tracking-wide text-muted">Revised ICR</div>
              <div className="text-2xl font-semibold mt-1" data-testid="revised-icr">{revisedIcr !== undefined ? fmtPercent(revisedIcr) : "—"}</div>
              <div className="text-xs text-muted mt-1">Operational: {fmtPercent(r.operational_icr?.operational_icr)}</div></Card>
            <Card className="p-4"><div className="text-xs uppercase tracking-wide text-muted">Affected Claims</div>
              <div className="text-2xl font-semibold mt-1" data-testid="affected-claims">{affected !== undefined ? fmtNumber(affected) : "—"}</div></Card>
          </div>
          {(memberOop !== undefined || gap !== undefined) && (
            <EmployeeImpactCallout
              label={gap !== undefined ? "Employee gap risk (above cap)" : "Member out-of-pocket (co-pay)"}
              amount={fmtCurrency(gap !== undefined ? gap : memberOop)}
              note="Shifted from employer to member — shown for benefit-design fairness." />
          )}
          <CaveatBanner caveats={r.caveats} />
          <Card className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted mb-1">Formula &amp; assumptions</div>
            <div className="text-sm text-ink">{r.formula}</div>
            {Array.isArray(r.assumptions) && r.assumptions.length > 0 && (
              <ul className="list-disc pl-5 mt-2 text-sm text-muted space-y-0.5">{r.assumptions.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul>
            )}
            <button className="mt-3 text-xs font-medium text-brand hover:underline" onClick={() => setEv(true)}>View full evidence →</button>
          </Card>
          <FourQuestions
            soWhat={saving !== undefined ? `${lever.label} could save ${fmtCurrency(saving)} and move ICR to ${fmtPercent(revisedIcr)}.` : `${lever.label} scenario computed by the governed simulation.`}
            why="The saving, revised ICR and affected claims are all returned by the backend simulation — never calculated in the browser."
            next={(memberOop !== undefined || gap !== undefined) ? "Weigh the employer saving against the employee/member impact shown above before recommending this lever." : "Compare this lever against others in Balanced Benefit Design before recommending it."}
            trust={`Figures from the governed simulation API on ${r.data_quality_status} data; term_basis ${v.term_basis || "—"}. Formula and assumptions are shown above; open full evidence for sources.`} />
        </div>
      )}
      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="Simulation evidence" evidence={r || null} />
    </div>
  );
}
