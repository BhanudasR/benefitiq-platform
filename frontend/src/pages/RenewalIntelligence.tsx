import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtPercent, fmtNumber, fmtShare, fmtValue } from "../lib/format";
import {
  Card, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { EvidenceDrawer } from "../components/ui/sandbox";
import { ChartFrame, Gauge, Sparkline, StackedBar, BarH, KpiStat, SERIES } from "../components/ui/charts";

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

function text(v: unknown): string {
  return clean(fmtValue(v));
}

function TopContextBar({ status, onEvidence }: { status: string; onEvidence: () => void }) {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between" data-testid="renewal-top-context">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Renewal Intelligence</h1>
          <button className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-brand"
            onClick={onEvidence}>Evidence</button>
        </div>
        <p className="mt-1 text-sm text-muted">Renewal defence workbench: Data to Insight to Decision to Action to Value</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-xl2 border border-line bg-card px-4 py-2 text-xs">
          <span className="text-muted">Client and policy context: </span><span className="font-semibold text-ink">{NA}</span>
        </div>
        <div className="rounded-xl2 border border-line bg-card px-4 py-2">
          <div className="text-[11px] text-muted">Data Quality Score</div>
          <DataQualityBadge status={status} />
        </div>
        <button className="rounded-xl2 bg-brand px-4 py-2 text-sm font-semibold text-white">Export</button>
      </div>
    </div>
  );
}

function InsightSummary({ status, iv, adj, largeVal }: { status: string; iv: any; adj: any; largeVal: any }) {
  return (
    <Card className="p-4 border-l-4 border-l-brand">
      <div data-testid="renewal-insight-summary">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl2 bg-brandSoft text-sm font-black text-brand">RI</div>
          <div>
            <div className="text-sm font-semibold text-ink">Governed Renewal Defence Summary</div>
            <p className="mt-1 text-sm leading-6 text-ink/80">
              Operational ICR is {pct(iv.operational_icr)}. Adjusted and defendable ICR is {pct(adj?.adjusted_icr)} when the backend simulation returns it.
              Large claim candidate count is {num(largeVal?.large_claim_count)} and all unsupported projections remain {NA}.
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-4">
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Data status</div>
            <div className="mt-1 font-semibold text-ink">{status}</div>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Projection basis</div>
            <div className="mt-1 font-semibold text-ink">{NA}</div>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">One-off treatment</div>
            <div className="mt-1 font-semibold text-ink">Candidate review only</div>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Evidence ready</div>
            <div className="mt-1 font-semibold text-ink">Governed APIs</div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function UnsupportedPanel({ title, items, testid }: { title: string; items: string[]; testid: string }) {
  return (
    <Card className="p-4">
      <div data-testid={testid}>
        <div className="text-sm font-semibold text-ink">{title}</div>
        <div className="mt-1 text-xs text-muted">Reference section retained without unsupported renewal inference</div>
        <div className="mt-3 grid grid-cols-1 gap-2">
          {items.map((item) => (
            <div key={item} className="rounded-lg border border-line bg-slate-50 px-3 py-2">
              <div className="text-xs text-muted">{item}</div>
              <div className="mt-1 text-sm font-semibold text-ink">{NA}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function ActionRail({ largeVal }: { largeVal: any }) {
  const alerts = [
    `Projected ICR: ${NA}`,
    `Large claim candidates: ${num(largeVal?.large_claim_count)}`,
    `Renewal readiness score: ${NA}`,
  ];
  const opportunities = [
    "Use adjusted ICR only as a caveated defence view",
    "Review claim drivers before selecting benefit levers",
    "Prepare governed evidence pack for renewal discussion",
  ];
  const actions = [
    "Open Claims Drivers",
    "Run backend Sandbox scenarios",
    "Review Recommended Strategy and Placement Trigger",
  ];
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3" data-testid="renewal-action-rail">
      <Card className="p-4">
        <div data-testid="renewal-alerts">
          <div className="text-sm font-semibold text-ink">Renewal Risk Alerts</div>
          <div className="mt-3 space-y-2">
            {alerts.map((item) => <div key={item} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-bad">{item}</div>)}
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div data-testid="renewal-opportunities">
          <div className="text-sm font-semibold text-ink">Opportunities</div>
          <div className="mt-3 space-y-2">
            {opportunities.map((item) => <div key={item} className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-good">{item}</div>)}
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div data-testid="renewal-action-center">
          <div className="text-sm font-semibold text-ink">Action Center</div>
          <div className="mt-3 space-y-2">
            {actions.map((item) => (
              <div key={item} className="rounded-lg border border-line px-3 py-2 text-sm text-ink">{item}</div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function EvidenceFooter({ status, evidence, onEvidence }: { status: string; evidence: any; onEvidence: () => void }) {
  const sources = evidence?.source_tables || [];
  return (
    <Card className="p-4">
      <div data-testid="renewal-evidence-footer" className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-ink">Evidence and Caveats</div>
          <div className="mt-1 text-xs text-muted">
            Operational, paid and outstanding ICR come from governed metrics. Adjusted ICR comes from the backend simulation.
            Projection, readiness, risk scoring, IBNR, inflation and seasonality remain {NA}.
          </div>
          {sources.length > 0 && <div className="mt-2 text-[11px] text-muted">Sources: {sources.join(", ")}</div>}
          <div className="mt-1 text-[11px] text-muted">Formula: {text(evidence?.formula)}</div>
        </div>
        <div className="flex items-center gap-3">
          <DataQualityBadge status={status} />
          <button onClick={onEvidence} className="text-xs font-semibold text-brand hover:underline">View evidence and formulas</button>
        </div>
      </div>
    </Card>
  );
}

export function RenewalIntelligence() {
  const [ev, setEv] = useState<{ title: string; data: any } | null>(null);
  const icr = useQuery({ queryKey: ["m", "icr"], queryFn: () => api.metric("icr") });
  const trends = useQuery({ queryKey: ["m", "trends"], queryFn: () => api.metric("trends") });
  const large = useQuery({ queryKey: ["m", "large-claims"], queryFn: () => api.metric("large-claims") });
  const adjusted = useQuery({ queryKey: ["s", "adjusted-icr"], queryFn: () => api.simulation("adjusted-icr") });

  if (icr.isLoading) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv({ title: "ICR evidence", data: null })} /><Skeleton rows={4} /></div>;
  if (icr.isError) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv({ title: "ICR evidence", data: null })} /><ErrorState onRetry={() => icr.refetch()} /></div>;
  const status = icr.data?.data_quality_status || "No Data";
  if (status === "No Data") return <div className="space-y-5"><TopContextBar status={status} onEvidence={() => setEv({ title: "ICR evidence", data: null })} /><EmptyState message="No activated governed data yet. Complete Data Onboarding to build the renewal view." /></div>;

  const iv = icr.data.value || {};
  const series = trends.data?.value?.series || [];
  const largeVal = large.data?.value || {};
  const adj = adjusted.data?.value || {};
  const blocked = icr.data.advisory_blocked || adjusted.data?.advisory_blocked;
  const trendValues = series.map((s: any) => s.operational_icr).filter((x: any) => typeof x === "number");

  return (
    <div className="space-y-5" data-testid="renewal-master-screen">
      <TopContextBar status={status} onEvidence={() => setEv({ title: "ICR evidence", data: icr.data })} />
      <RestrictedBanner blocked={blocked} />
      <CaveatBanner caveats={icr.data.caveats} />
      <InsightSummary status={status} iv={iv} adj={adj} largeVal={largeVal} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-6" data-testid="renewal-kpis">
        <KpiStat label="Current ICR" value={pct(iv.operational_icr)} sub={`Basis: ${icr.data.premium_basis || "written"}`} badge={<DataQualityBadge status={status} />} onEvidence={() => setEv({ title: "ICR evidence", data: icr.data })} testid="renewal-kpi-current" />
        <KpiStat label="Projected ICR" value={NA} sub="Backend projection absent" testid="renewal-kpi-projected" />
        <KpiStat label="Adjusted ICR" value={pct(adj.adjusted_icr)} sub="Backend defendable view" onEvidence={() => setEv({ title: "Adjusted ICR evidence", data: adjusted.data })} testid="adjusted-icr" />
        <KpiStat label="Renewal Risk" value={NA} sub="Backend supplied only" testid="renewal-kpi-risk" />
        <KpiStat label="Renewal Readiness" value={NA} sub="Backend supplied only" testid="renewal-kpi-readiness" />
        <KpiStat label="Large Claim Share" value={fmtShare(largeVal.large_claim_incurred_share)} sub={`${num(largeVal.large_claim_count)} candidates`} testid="renewal-kpi-large-share" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr,1fr,0.9fr]">
        <ChartFrame title="ICR Bridge" subtitle="Operational to defendable view; no projection math in browser"
          status={status} evidence={adjusted.data || icr.data} evidenceTitle="ICR bridge evidence" testid="renewal-icr-bridge"
          empty={typeof iv.operational_icr !== "number" && typeof adj.adjusted_icr !== "number"} emptyMessage="ICR bridge requires governed ICR values.">
          <BarH data={[
            { label: "Current operational ICR", value: iv.operational_icr, color: SERIES[0] },
            { label: "Adjusted defendable ICR", value: adj.adjusted_icr, color: SERIES[2] },
            { label: "Projected ICR", value: null, color: SERIES[3] },
          ]} format={(x) => pct(x)} />
        </ChartFrame>
        <ChartFrame title="Operational ICR Gauge" subtitle="Current ICR, backend metric value"
          status={status} evidence={icr.data} evidenceTitle="ICR evidence" testid="renewal-icr-gauge"
          empty={typeof iv.operational_icr !== "number"} emptyMessage="Operational ICR not available yet.">
          <Gauge value={iv.operational_icr} min={0} max={200} valueText={pct(iv.operational_icr)}
            label="Operational ICR" bands={[{ upTo: 100, color: "#16A34A" }, { upTo: 120, color: "#D97706" }]} />
        </ChartFrame>
        <ChartFrame title="Large Claim Impact" subtitle="Aggregate one-off candidate view, no raw identifiers"
          status={large.data?.data_quality_status} caveats={large.data?.caveats} evidence={large.data} evidenceTitle="Large claim evidence" testid="renewal-large-impact"
          empty={!largeVal || largeVal.large_claim_count == null} emptyMessage="Large claim impact is not available in scope.">
          <div className="grid grid-cols-1 gap-3 text-sm">
            <div className="rounded-lg border border-line px-3 py-2">
              <div className="text-xs text-muted">Large claim candidate count</div>
              <div className="mt-1 text-xl font-semibold text-ink" data-testid="large-count">{num(largeVal.large_claim_count)}</div>
            </div>
            <div className="rounded-lg border border-line px-3 py-2">
              <div className="text-xs text-muted">Aggregate incurred</div>
              <div className="mt-1 text-xl font-semibold text-ink">{money(largeVal.large_claim_incurred)}</div>
            </div>
            <div className="rounded-lg border border-line px-3 py-2">
              <div className="text-xs text-muted">Share of incurred</div>
              <div className="mt-1 text-xl font-semibold text-ink" data-testid="large-share">{fmtShare(largeVal.large_claim_incurred_share)}</div>
            </div>
          </div>
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartFrame title="Operational ICR Trend" subtitle="Governed multi-year series"
          status={trends.data?.data_quality_status} caveats={trends.data?.caveats} evidence={trends.data} evidenceTitle="Trend evidence" testid="renewal-icr-trend"
          empty={trendValues.length < 2} emptyMessage="At least two policy years are needed for trend display.">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Sparkline values={trendValues} width={280} height={64} />
            <div className="grid grid-cols-2 gap-2 text-xs">
              {series.map((s: any) => (
                <div key={s.policy_year} className="rounded-lg border border-line px-3 py-2">
                  <div className="text-muted">{s.policy_year}</div>
                  <div className="font-semibold text-ink">{pct(s.operational_icr)}</div>
                </div>
              ))}
            </div>
          </div>
        </ChartFrame>
        <ChartFrame title="Paid and Outstanding Exposure" subtitle="Financial basis behind current ICR"
          status={status} evidence={icr.data} evidenceTitle="ICR evidence" testid="renewal-paid-outstanding"
          empty={iv.paid_icr == null && iv.outstanding_icr == null} emptyMessage="Paid and outstanding ICR not available.">
          <StackedBar rows={[{ label: "ICR components", segments: [
            { label: "Paid ICR", value: iv.paid_icr, color: SERIES[0] },
            { label: "Outstanding ICR", value: iv.outstanding_icr, color: SERIES[2] },
          ] }]} format={(x) => pct(x)} />
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <UnsupportedPanel title="Projection and Seasonality" items={["Projected ICR", "IBNR", "Inflation", "Seasonality"]} testid="renewal-projection-unsupported" />
        <UnsupportedPanel title="Risk and Readiness Scores" items={["Renewal risk score", "Renewal readiness", "Recurring risk score"]} testid="renewal-readiness-unsupported" />
        <UnsupportedPanel title="Negotiation Simulator" items={["Insurer ask range", "Premium impact", "Guaranteed savings"]} testid="renewal-negotiation-unsupported" />
      </div>

      <ActionRail largeVal={largeVal} />
      <FourQuestions
        soWhat={`Current ICR is ${pct(iv.operational_icr)} and adjusted defendable ICR is ${pct(adj.adjusted_icr)} when supported by backend simulation.`}
        why="Operational ICR remains the official metric. The adjusted view is a separate caveated defence lens returned by the backend."
        next="Open Claims Drivers, then test backend-supported levers in the Sandbox before using Recommended Strategy."
        trust={`Figures come from governed ICR, trend, large-claim and adjusted-ICR APIs on ${status} data. Unsupported projections remain ${NA}.`} />
      <EvidenceFooter status={status} evidence={icr.data} onEvidence={() => setEv({ title: "ICR evidence", data: icr.data })} />
      <EvidenceDrawer open={!!ev && !!ev.data} onClose={() => setEv(null)} title={ev?.title} evidence={ev?.data || null} />
    </div>
  );
}
