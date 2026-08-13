import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtPercent, fmtShare, fmtNumber } from "../lib/format";
import {
  Card, DecisionSummary, DataQualityBadge, CaveatBanner,
  RestrictedBanner, Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { EvidenceDrawer } from "../components/ui/sandbox";
import { KpiStat, ChartFrame, BarH, SERIES } from "../components/ui/charts";

const NA = "Not Available";

function clean(v: string): string {
  return v === "-" || v === "â€”" ? NA : v;
}

function pct(v: number | null | undefined): string {
  return clean(fmtPercent(v));
}

function money(v: number | null | undefined): string {
  return clean(fmtCurrency(v));
}

function num(v: number | null | undefined): string {
  return clean(fmtNumber(v));
}

const TRIGGER_STYLE: Record<string, string> = {
  yes: "bg-red-50 text-bad border-red-200",
  no: "bg-green-50 text-good border-green-200",
  review: "bg-amber-50 text-warn border-amber-200",
};

export function PlacementTrigger() {
  const [ev, setEv] = useState(false);
  const q = useQuery({ queryKey: ["reco", "placement-trigger"], queryFn: () => api.recommendation("placement-trigger") });

  if (q.isLoading) return <div className="space-y-5"><Skeleton rows={4} /></div>;
  if (q.isError) return <div className="space-y-5"><ErrorState onRetry={() => q.refetch()} /></div>;

  const d = q.data || {};
  const status = d.data_quality_status || "No Data";
  if (status === "No Data")
    return <EmptyState title="Placement decision pending governed data"
      message="No activated governed data yet. Complete Data Onboarding to generate the placement decision." />;

  const triggered = String(d.placement_triggered ?? "review");
  const ne = d.negotiation_evidence || {};
  const reasoning: any[] = d.reasoning || [];
  const nba = d.next_best_action;
  const confLine = `Confidence ${d.confidence || NA}; reliability ${d.reliability || NA}.`;

  return (
    <div className="space-y-5" data-testid="placement-trigger-master-screen">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between" data-testid="pt-top-context">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Placement Trigger and Next Best Action</h1>
          <p className="mt-1 text-sm text-muted">Governed decision: defend incumbent, review, or prepare RFQ</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl2 border border-line bg-card px-4 py-2">
            <div className="text-[11px] text-muted">Data Quality Score</div>
            <DataQualityBadge status={status} />
          </div>
          <button className="rounded-xl2 bg-brand px-4 py-2 text-sm font-semibold text-white">Export</button>
        </div>
      </div>
      <RestrictedBanner blocked={d.advisory_blocked} />
      <CaveatBanner caveats={d.caveats} />

      <DecisionSummary title={String(d.recommendation)} points={[d.summary || "Governed placement decision.", confLine]} />

      <Card className="p-5 border-l-4 border-l-brand">
        <div data-testid="pt-command-layout">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-brand">Placement decision</div>
            <span data-testid="pt-triggered"
              className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full border ${TRIGGER_STYLE[triggered] || "bg-slate-100 text-muted border-line"}`}>
              {triggered}
            </span>
          </div>
          <h3 className="text-base font-semibold text-ink mt-1">{String(d.recommendation)}</h3>
          {d.trigger_reason && <p className="text-sm text-muted mt-1" data-testid="pt-reason">{String(d.trigger_reason)}</p>}
          <div className="grid grid-cols-1 gap-4 mt-4 sm:grid-cols-3">
            <KpiStat label="Incumbent defence" value={d.incumbent_defence_score != null ? String(d.incumbent_defence_score) : NA} sub="Backend score" testid="pt-defence" />
            <KpiStat label="RFQ readiness" value={d.rfq_readiness != null ? String(d.rfq_readiness) : NA} sub="Backend score" testid="pt-rfq" />
            <KpiStat label="Negotiation range" value={NA} sub="Backend supplied only" testid="pt-negotiation-range" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartFrame title="Defence and RFQ Readiness" subtitle="Backend-returned scores only" status={status} evidence={d} evidenceTitle="Placement evidence" testid="pt-trigger-bands">
          <BarH data={[
            { label: "Incumbent defence", value: d.incumbent_defence_score, color: SERIES[1] },
            { label: "RFQ readiness", value: d.rfq_readiness, color: SERIES[3] },
          ]} format={(x) => String(x)} />
        </ChartFrame>
        <Card className="p-4">
          <div className="text-sm font-semibold text-ink mb-2">Negotiation Evidence</div>
          <div data-testid="pt-negotiation-evidence" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
              <div className="text-xs text-muted">Operational ICR</div>
              <div className="mt-1 text-lg font-semibold text-ink" data-testid="pt-op-icr">{pct(ne.operational_icr ?? d.operational_icr)}</div>
            </div>
            <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
              <div className="text-xs text-muted">Adjusted defendable ICR</div>
              <div className="mt-1 text-lg font-semibold text-warn" data-testid="pt-adj-icr">{pct(ne.adjusted_icr ?? d.adjusted_icr)}</div>
            </div>
            <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
              <div className="text-xs text-muted">Large one-off share</div>
              <div className="mt-1 text-lg font-semibold text-ink">{fmtShare(ne.large_claim_incurred_share)}</div>
            </div>
            <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
              <div className="text-xs text-muted">One-off candidate count</div>
              <div className="mt-1 text-lg font-semibold text-ink" data-testid="pt-oneoff-count">{num(ne.large_claim_count)}</div>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-line bg-slate-50 px-3 py-2 text-xs text-muted">
            Large claim evidence is aggregate-safe. Raw claim numbers, member IDs and individual claim rows are not displayed.
          </div>
          {ne.note && <p className="text-xs text-muted mt-2">{String(ne.note)}</p>}
        </Card>
      </div>

      {reasoning.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-semibold text-ink mb-2">Why this decision</div>
          <ul className="list-disc pl-5 text-sm text-ink/80 space-y-1" data-testid="pt-reasoning">
            {reasoning.map((r, i) => <li key={i}>{r.explanation}</li>)}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3" data-testid="pt-action-rail">
        <Card className="p-4"><div data-testid="pt-alerts"><div className="text-sm font-semibold text-ink">Placement Alerts</div><div className="mt-3 text-sm text-bad rounded-lg border border-red-200 bg-red-50 px-3 py-2">Negotiation range: {NA}</div></div></Card>
        <Card className="p-4"><div data-testid="pt-opportunities"><div className="text-sm font-semibold text-ink">Opportunities</div><div className="mt-3 text-sm text-good rounded-lg border border-green-200 bg-green-50 px-3 py-2">Use defence evidence when incumbent score supports it</div></div></Card>
        <Card className="p-4"><div data-testid="pt-action-center"><div className="text-sm font-semibold text-ink">Next Best Action</div><div className="mt-3 text-sm rounded-lg border border-line px-3 py-2" data-testid="pt-nba">{nba ? String(nba.explanation) : NA}</div></div></Card>
      </div>

      <Card className="p-4">
        <div data-testid="pt-unsupported" className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {["Insurer recommendation", "Negotiation range", "Legal conclusion", "Raw one-off claim rows"].map((label) => (
            <div key={label} className="rounded-lg border border-line bg-slate-50 px-3 py-2">
              <div className="text-xs text-muted">{label}</div>
              <div className="mt-1 text-sm font-semibold text-ink">{NA}</div>
            </div>
          ))}
        </div>
      </Card>

      <FourQuestions
        soWhat={`Placement decision: ${triggered}; ${String(d.recommendation)}.`}
        why={reasoning.length > 0 ? String(reasoning[0].explanation) : "Weighted from governed incumbent-defence and RFQ-readiness signals."}
        next={nba ? String(nba.explanation) : "Follow the governed next best action once available."}
        trust={`Rendered from the governed placement-trigger engine on ${status} data. Trigger decision is never computed in the browser.`} />

      <Card className="p-4">
        <div data-testid="pt-evidence-footer" className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-ink">Evidence and Caveats</div>
            <div className="mt-1 text-xs text-muted">Placement trigger, scores, reason and next best action come from the governed backend. Raw identifiers are not rendered.</div>
          </div>
          <DataQualityBadge status={status} />
        </div>
      </Card>

      <button className="text-xs font-medium text-brand hover:underline" onClick={() => setEv(true)}>View evidence and caveats</button>
      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="Placement decision evidence" evidence={ev ? d : null} />
    </div>
  );
}
