import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtShare } from "../lib/format";
import {
  Card, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { ChartFrame, KpiStat, BarH, Donut, Quadrant, SERIES } from "../components/ui/charts";
import { EvidenceDrawer } from "../components/ui/sandbox";

const NA = "Not Available";

function clean(v: string): string {
  return v === "-" || v === "â€”" || v === "Ã¢â‚¬â€" ? NA : v;
}

function money(v: number | null | undefined): string {
  return clean(fmtCurrency(v));
}

function num(v: number | null | undefined): string {
  return clean(fmtNumber(v));
}

function share(v: number | null | undefined): string {
  return clean(fmtShare(v));
}

function TopContextBar({ status, onEvidence }: { status: string; onEvidence: () => void }) {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between" data-testid="ailment-top-context">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Ailment Intelligence</h1>
          <button className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-brand"
            onClick={onEvidence}>Evidence</button>
        </div>
        <p className="mt-1 text-sm text-muted">Understand reported diagnosis groups, cost impact and wellness links</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-xl2 border border-line bg-card px-4 py-2 text-xs">
          <span className="text-muted">Last refresh: </span><span className="font-semibold text-ink">{NA}</span>
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

function AilmentInsightSummary({ status, top }: { status: string; top: any }) {
  return (
    <Card className="p-4 border-l-4 border-l-brand">
      <div data-testid="ailment-insight-summary">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl2 bg-brandSoft text-sm font-black text-brand">AI</div>
          <div>
            <div className="text-sm font-semibold text-ink">Governed Ailment Summary</div>
            <p className="mt-1 text-sm leading-6 text-ink/80">
              Ailment Intelligence uses aggregate diagnosis group data only. The leading returned group is
              {` ${top ? String(top.key) : NA}`} with incurred value {top ? money(top.incurred) : NA}.
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Data status</div>
            <div className="mt-1 font-semibold text-ink">{status}</div>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Top share</div>
            <div className="mt-1 font-semibold text-ink">{top ? share(top.incurred_share) : NA}</div>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Clinical inference</div>
            <div className="mt-1 font-semibold text-ink">Not provided</div>
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
        <div className="mt-1 text-xs text-muted">Reference section retained without unsupported disease inference</div>
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

function WellnessOpportunityLinks() {
  const items = [
    "Open Wellness Overview",
    "Review Wellness Opportunity",
    "Prepare disease-wise renewal story",
  ];
  return (
    <Card className="p-4">
      <div data-testid="ailment-wellness-links">
        <div className="text-sm font-semibold text-ink">Wellness Opportunity Links</div>
        <div className="mt-1 text-xs text-muted">Links only; no expected impact is fabricated here</div>
        <div className="mt-3 space-y-2">
          {items.map((item) => <div key={item} className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-good">{item}</div>)}
        </div>
      </div>
    </Card>
  );
}

function AilmentActionRail({ top, recurring }: { top: any; recurring: any[] }) {
  const alerts = [
    top ? `Leading reported group: ${String(top.key)}` : NA,
    `Recurring groups: ${num(recurring.length)}`,
    "Disease risk score: Not Available",
  ];
  const opportunities = [
    "Open Wellness module for governed opportunities",
    "Review frequency and severity matrix",
    "Use aggregate groups in renewal discussion",
  ];
  const actions = [
    "Review top reported ailment groups",
    "Prepare wellness discussion inputs",
    "Open claims dashboard for financial context",
  ];
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3" data-testid="ailment-action-rail">
      <Card className="p-4">
        <div data-testid="ailment-alerts">
          <div className="text-sm font-semibold text-ink">Alerts</div>
          <div className="mt-3 space-y-2">
            {alerts.map((item) => <div key={item} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-bad">{item}</div>)}
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div data-testid="ailment-opportunities">
          <div className="text-sm font-semibold text-ink">Opportunities</div>
          <div className="mt-3 space-y-2">
            {opportunities.map((item) => <div key={item} className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-good">{item}</div>)}
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div data-testid="ailment-action-center">
          <div className="text-sm font-semibold text-ink">Action Center</div>
          <div className="mt-3 space-y-2">
            {actions.map((item, index) => (
              <div key={item} className="flex gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand text-xs font-bold text-white">{num(index + 1)}</span>
                <span>{item}</span>
              </div>
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
      <div data-testid="ailment-evidence-footer" className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-ink">Evidence & Caveats</div>
          <div className="mt-1 text-xs text-muted">
            Ailment Intelligence renders governed aggregate diagnosis groups only. Unsupported clinical taxonomy fields show as {NA}.
          </div>
          {sources.length > 0 && <div className="mt-2 text-[11px] text-muted">Sources: {sources.join(", ")}</div>}
          <div className="mt-1 text-[11px] text-muted">Formula: {clean(evidence?.formula || NA)}</div>
        </div>
        <div className="flex items-center gap-3">
          <DataQualityBadge status={status} />
          <button onClick={onEvidence} className="text-xs font-semibold text-brand hover:underline">View evidence and formulas</button>
        </div>
      </div>
    </Card>
  );
}

export function Ailment() {
  const [ev, setEv] = useState(false);
  const ailment = useQuery({ queryKey: ["m", "ailment"], queryFn: () => api.metric("ailment") });

  if (ailment.isLoading) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv(true)} /><Skeleton rows={4} /></div>;
  if (ailment.isError) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv(true)} /><ErrorState onRetry={() => ailment.refetch()} /></div>;
  const a = ailment.data;
  const status = a?.data_quality_status || "No Data";
  if (status === "No Data") return <div className="space-y-5"><TopContextBar status={status} onEvidence={() => setEv(true)} /><EmptyState message="No activated ailment data for this tenant yet. Complete Data Onboarding to populate the Ailment dashboard." /></div>;

  const tops = a.value?.top_ailments || [];
  const first = tops[0];
  const bars = tops.slice(0, 8).map((t: any, i: number) => ({ label: String(t.key), value: t.incurred, color: SERIES[i % SERIES.length] }));
  const shareRows = tops.slice(0, 6).map((t: any, i: number) => ({ label: String(t.key), value: t.incurred, color: SERIES[i % SERIES.length] }));
  const quad = tops.slice(0, 10).map((t: any) => ({ label: String(t.key), x: t.count, y: t.average_claim_size }));
  const recurring = tops.filter((t: any) => t.recurring_indicator);

  return (
    <div className="space-y-5" data-testid="ailment-master-screen">
      <TopContextBar status={status} onEvidence={() => setEv(true)} />
      <RestrictedBanner blocked={a.advisory_blocked} />
      <CaveatBanner caveats={a.caveats} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr,1fr]">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 [&_[data-testid=kpistat-value]]:break-words [&_[data-testid=kpistat-value]]:text-xl" data-testid="ailment-kpis">
          <KpiStat label="Disease Categories" value={num(tops.length)} sub="Returned diagnosis groups" badge={<DataQualityBadge status={status} />} testid="ailment-kpi-groups" />
          <KpiStat label="Top Reported Group" value={first ? String(first.key) : NA} sub={first ? money(first.incurred) : "Backend order"} testid="ailment-kpi-top" />
          <KpiStat label="Top Incurred Share" value={first ? share(first.incurred_share) : NA} sub="Backend supplied" testid="ailment-kpi-share" />
          <KpiStat label="Average Cost" value={first ? money(first.average_claim_size) : NA} sub="For leading returned group" testid="ailment-kpi-avg" />
          <KpiStat label="Chronic Disease Share" value={NA} sub="Backend supplied only" testid="ailment-kpi-chronic" />
          <KpiStat label="Recurring Groups" value={num(recurring.length)} sub="Backend recurring indicator" testid="ailment-kpi-recurring" />
          <KpiStat label="Preventable Share" value={NA} sub="Backend supplied only" testid="ailment-kpi-preventable" />
          <KpiStat label="Disease Risk Score" value={NA} sub="Backend supplied only" testid="ailment-kpi-risk-score" />
        </div>
        <AilmentInsightSummary status={status} top={first} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr,0.9fr,0.9fr]">
        <ChartFrame title="Disease Cost Distribution" subtitle="Returned ailment groups by incurred amount" status={status}
          evidence={a} evidenceTitle="Ailment evidence" testid="ailment-top"
          empty={bars.length === 0} emptyMessage="No ailment groups in scope.">
          <BarH data={bars} format={(x) => money(x)} />
        </ChartFrame>

        <ChartFrame title="Frequency / Severity Matrix" subtitle="x = claim count, y = average claim size; both backend-supported" status={status}
          evidence={a} evidenceTitle="Ailment evidence" testid="ailment-quadrant"
          empty={quad.length === 0} emptyMessage="Not enough ailment data for a matrix.">
          <Quadrant points={quad} xLabel="Frequency" yLabel="Severity" format={(x) => num(x)} />
        </ChartFrame>

        <ChartFrame title="Ailment Share Visual" subtitle="Incurred concentration by returned groups" status={status}
          evidence={a} evidenceTitle="Ailment evidence" testid="ailment-share"
          empty={shareRows.length === 0} emptyMessage="No ailment groups in scope.">
          <Donut data={shareRows} centerValue={num(tops.length)} centerLabel="groups" />
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr,1fr,0.9fr]">
        <Card className="p-4">
          <div data-testid="ailment-recurring">
            <div className="text-sm font-semibold text-ink">Recurring Ailment Groups</div>
            <div className="mt-1 text-xs text-muted">Only backend-provided recurring indicators are shown</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {recurring.length ? recurring.slice(0, 20).map((t: any) => (
                <span key={t.key} className="rounded-full border border-line bg-slate-50 px-2 py-1 text-[11px] text-ink">
                  {String(t.key)} · {num(t.count)} claims
                </span>
              )) : <span className="text-sm text-muted">{NA}</span>}
            </div>
          </div>
        </Card>
        <UnsupportedPanel title="Chronic / Acute / Preventable Split" items={["Chronic disease share", "Acute disease share", "Preventable disease share"]} testid="ailment-chronic-unsupported" />
        <WellnessOpportunityLinks />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <UnsupportedPanel title="Ailment Trend & Lifecycle" items={["Ailment trend", "Disease lifecycle", "Recurring disease rate"]} testid="ailment-trend-unsupported" />
        <UnsupportedPanel title="Disease Risk & Demographics" items={["Disease risk score", "Demographic heatmap", "Disease waterfall"]} testid="ailment-risk-unsupported" />
        <UnsupportedPanel title="Wellness Impact" items={["Expected impact", "Preventive saving", "Clinical recommendation"]} testid="ailment-wellness-unsupported" />
      </div>

      <AilmentActionRail top={first} recurring={recurring} />

      <FourQuestions
        soWhat={first ? `${String(first.key)} is the leading returned ailment group at ${money(first.incurred)} (${share(first.incurred_share)} of incurred).` : "Ailment concentration is available once claims carry governed diagnosis groups."}
        why="Groups, incurred amounts, counts, averages, shares and recurring indicators come from the governed ailment metric. The page does not infer clinical taxonomy."
        next="Use the frequency and severity matrix to frame renewal and wellness discussions at aggregate level."
        trust={`Governed on ${status} data. Unsupported chronic, preventable, risk and clinical recommendation sections show ${NA}.`} />

      <EvidenceFooter status={status} evidence={a} onEvidence={() => setEv(true)} />
      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="Ailment evidence" evidence={ev ? a : null} />
    </div>
  );
}
