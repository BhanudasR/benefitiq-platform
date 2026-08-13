import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtShare, fmtValue } from "../lib/format";
import {
  Card, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { ChartFrame, KpiStat, BarH, BarV, Gauge, Donut, SERIES } from "../components/ui/charts";
import { EvidenceDrawer } from "../components/ui/sandbox";

const NA = "Not Available";

function clean(v: string): string {
  return v === "-" || v === "—" ? NA : v;
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

function value(v: unknown): string {
  return clean(fmtValue(v));
}

function TopContextBar({ status, onEvidence }: { status: string; onEvidence: () => void }) {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between" data-testid="si-top-context">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">SI Utilization Intelligence</h1>
          <button className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-brand"
            onClick={onEvidence}>Evidence</button>
        </div>
        <p className="mt-1 text-sm text-muted">Evaluate sum insured utilization patterns and exposure signals using governed backend values</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-xl2 border border-line bg-card px-4 py-2 text-xs">
          <span className="text-muted">Policy year: </span><span className="font-semibold text-ink">{NA}</span>
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

function InsightSummary({ status, v }: { status: string; v: any }) {
  return (
    <Card className="p-4 border-l-4 border-l-brand">
      <div data-testid="si-insight-summary">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl2 bg-brandSoft text-sm font-black text-brand">AI</div>
          <div>
            <div className="text-sm font-semibold text-ink">Governed SI Utilization Summary</div>
            <p className="mt-1 text-sm leading-6 text-ink/80">
              Average utilization is {share(v.average_utilization)} across members with governed sum insured.
              Exhausted members are {num(v.exhausted_count)}. Underinsured and overinsured labels are utilization signals only.
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Data status</div>
            <div className="mt-1 font-semibold text-ink">{status}</div>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Missing SI</div>
            <div className="mt-1 font-semibold text-ink">{num(v.missing_si)}</div>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">SI adequacy verdict</div>
            <div className="mt-1 font-semibold text-ink">{NA}</div>
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
        <div className="mt-1 text-xs text-muted">Reference section retained without unsupported adequacy or actuarial inference</div>
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

function SignalCards({ v }: { v: any }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" data-testid="si-signals">
      <Card className="p-4 border-l-4 border-l-amber-400">
        <div className="text-xs uppercase tracking-wide text-muted">Underinsured utilization signal</div>
        <div className="mt-1 text-2xl font-semibold text-ink">{num(v.underinsured_signal_count)}</div>
        <div className="mt-1 text-xs text-muted">High or exhausted utilization signal only; not an adequacy verdict</div>
      </Card>
      <Card className="p-4 border-l-4 border-l-brand">
        <div className="text-xs uppercase tracking-wide text-muted">Overinsured utilization signal</div>
        <div className="mt-1 text-2xl font-semibold text-ink">{num(v.overinsured_signal_count)}</div>
        <div className="mt-1 text-xs text-muted">Very low utilization signal only; not an actuarial recommendation</div>
      </Card>
      <Card className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted">Family floater</div>
        <div className="mt-1 text-2xl font-semibold text-ink" data-testid="si-floater">{v.family_floater_available ? "Available" : NA}</div>
        <div className="mt-1 text-xs text-muted">Corporate floater SI presence in governed policy data</div>
      </Card>
    </div>
  );
}

function ActionRail({ v }: { v: any }) {
  const alerts = [
    `Exhausted members: ${num(v.exhausted_count)}`,
    `Missing SI records: ${num(v.missing_si)}`,
    `Unlinked claims: ${num(v.unlinked_claims)}`,
  ];
  const opportunities = [
    "Review high-utilization SI bands",
    "Improve member sum insured completeness",
    "Request governed top-up opportunity model before sizing value",
  ];
  const actions = [
    "Review utilization band distribution",
    "Validate unlinked claim caveats",
    "Open Renewal Intelligence for approved benefit design workflow",
  ];
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3" data-testid="si-action-rail">
      <Card className="p-4">
        <div data-testid="si-alerts">
          <div className="text-sm font-semibold text-ink">Key Alerts</div>
          <div className="mt-3 space-y-2">
            {alerts.map((item) => <div key={item} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-bad">{item}</div>)}
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div data-testid="si-opportunities">
          <div className="text-sm font-semibold text-ink">Opportunities</div>
          <div className="mt-3 space-y-2">
            {opportunities.map((item) => <div key={item} className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-good">{item}</div>)}
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div data-testid="si-action-center">
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
      <div data-testid="si-evidence-footer" className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-ink">Evidence & Caveats</div>
          <div className="mt-1 text-xs text-muted">
            SI Utilization uses backend-computed member utilization. Underinsured and overinsured are utilization signals only; unsupported adequacy, top-up and buffer values show as {NA}.
          </div>
          {sources.length > 0 && <div className="mt-2 text-[11px] text-muted">Sources: {sources.join(", ")}</div>}
          <div className="mt-1 text-[11px] text-muted">Formula: {value(evidence?.formula)}</div>
        </div>
        <div className="flex items-center gap-3">
          <DataQualityBadge status={status} />
          <button onClick={onEvidence} className="text-xs font-semibold text-brand hover:underline">View evidence and formulas</button>
        </div>
      </div>
    </Card>
  );
}

export function SIUtilization() {
  const [ev, setEv] = useState(false);
  const si = useQuery({ queryKey: ["m", "si-utilization"], queryFn: () => api.metric("si-utilization") });

  if (si.isLoading) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv(true)} /><Skeleton rows={4} /></div>;
  if (si.isError) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv(true)} /><ErrorState onRetry={() => si.refetch()} /></div>;
  const s = si.data;
  const status = s?.data_quality_status || "No Data";
  if (status === "No Data") return <div className="space-y-5"><TopContextBar status={status} onEvidence={() => setEv(true)} /><EmptyState message="No activated member/SI data for this tenant yet. Complete Data Onboarding to populate the SI Utilization dashboard." /></div>;

  const v = s.value || {};
  const siBars = (v.si_bands || []).map((b: any, i: number) => ({ label: b.band, value: b.count, color: SERIES[i % SERIES.length] }));
  const utilBars = (v.utilization_bands || []).map((b: any, i: number) => ({ label: b.band, value: b.count, color: SERIES[i % SERIES.length] }));
  const util = typeof v.average_utilization === "number" ? v.average_utilization : null;

  return (
    <div className="space-y-5" data-testid="si-master-screen">
      <TopContextBar status={status} onEvidence={() => setEv(true)} />
      <RestrictedBanner blocked={s.advisory_blocked} />
      <CaveatBanner caveats={s.caveats} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr,1fr]">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 [&_[data-testid=kpistat-value]]:break-words [&_[data-testid=kpistat-value]]:text-xl" data-testid="si-kpis">
          <KpiStat label="Members with SI" value={num(v.member_count)} sub="Governed member records" badge={<DataQualityBadge status={status} />} testid="si-kpi-members" />
          <KpiStat label="Average Utilization" value={util != null ? share(util) : NA} sub="Backend computed" testid="si-kpi-avgutil" />
          <KpiStat label="Exhausted" value={num(v.exhausted_count)} sub={v.exhausted_share != null ? share(v.exhausted_share) : "At or above 100%"} deltaTone="bad" testid="si-kpi-exhausted" />
          <KpiStat label="High Utilization" value={num(v.high_utilization_count)} sub="Backend threshold" deltaTone="warn" testid="si-kpi-highutil" />
          <KpiStat label="Underinsured Signal" value={num(v.underinsured_signal_count)} sub="Signal only" deltaTone="warn" testid="si-kpi-underins" />
          <KpiStat label="Overinsured Signal" value={num(v.overinsured_signal_count)} sub="Signal only" testid="si-kpi-overins" />
          <KpiStat label="SI Adequacy Score" value={NA} sub="Backend supplied only" testid="si-kpi-adequacy" />
          <KpiStat label="Top-up Opportunity" value={NA} sub="Backend supplied only" testid="si-kpi-topup" />
        </div>
        <InsightSummary status={status} v={v} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.8fr,1fr,1fr]">
        <ChartFrame title="Overall SI Utilization" subtitle="Backend-computed member utilization" status={status}
          evidence={s} evidenceTitle="SI utilization evidence" testid="si-gauge"
          empty={util == null} emptyMessage="No members with sum insured in scope.">
          <Gauge value={util} min={0} max={1.5}
            valueText={util != null ? share(util) : NA} label="Avg utilization"
            bands={[{ upTo: 0.75, color: "#16A34A" }, { upTo: 1.0, color: "#D97706" }]} />
        </ChartFrame>

        <ChartFrame title="SI Structure" subtitle="Members by governed sum insured band" status={status}
          evidence={s} evidenceTitle="SI utilization evidence" testid="si-bands"
          empty={siBars.every((b: any) => !b.value)} emptyMessage="No members with sum insured in scope.">
          <BarV data={siBars} format={(x) => num(x)} />
        </ChartFrame>

        <ChartFrame title="SI Utilization Distribution" subtitle="Members by utilization level" status={status}
          evidence={s} evidenceTitle="SI utilization evidence" testid="si-util-bands"
          empty={utilBars.every((b: any) => !b.value)} emptyMessage="No utilization data in scope.">
          <Donut data={utilBars} centerValue={num(v.member_count)} centerLabel="members" />
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr,1fr]">
        <ChartFrame title="Utilization Bands" subtitle="Governed utilization distribution" status={status}
          evidence={s} evidenceTitle="SI utilization evidence" testid="si-util-band-bars"
          empty={utilBars.every((b: any) => !b.value)} emptyMessage="No utilization data in scope.">
          <BarH data={utilBars} format={(x) => num(x)} />
        </ChartFrame>
        <SignalCards v={v} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <UnsupportedPanel title="Band / Designation Analysis" items={["Designation", "Band-wise incurred", "Band recommendation"]} testid="si-band-designation-unsupported" />
        <UnsupportedPanel title="Trend & Near Exhaustion" items={["Monthly trend", "Near exhaustion trend", "Year-on-year movement"]} testid="si-trend-unsupported" />
        <UnsupportedPanel title="Corporate Buffer Utilization" items={["Buffer utilized", "Available buffer", "Band-wise buffer usage"]} testid="si-buffer-unsupported" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <UnsupportedPanel title="Top Families by Utilization" items={["Family-level table", "Family exhausted status", "Family utilization percent"]} testid="si-family-unsupported" />
        <UnsupportedPanel title="Ailments Driving Exhaustion" items={["Ailment exhaustion", "Incurred by ailment", "Clinical recommendation"]} testid="si-ailment-unsupported" />
        <UnsupportedPanel title="Adequacy / Top-up Opportunity" items={["SI adequacy verdict", "Top-up opportunity value", "Actuarial recommendation"]} testid="si-adequacy-unsupported" />
      </div>

      <ActionRail v={v} />

      <FourQuestions
        soWhat={`${num(v.exhausted_count)} member(s) exhausted SI; average utilization is ${util != null ? share(util) : NA}; high utilization signal count is ${num(v.high_utilization_count)}.`}
        why="Utilization is computed in the backend from member incurred and member sum insured. Underinsured and overinsured are utilization signals only, never final adequacy decisions."
        next="Use exhausted and high-utilization signals to frame governed SI review, then request backend-supported top-up or buffer modelling before valuing any opportunity."
        trust={`Governed on ${status} data. Missing SI and unlinked claims are caveated, and unsupported adequacy, top-up, family and ailment fields show ${NA}.`} />

      <EvidenceFooter status={status} evidence={s} onEvidence={() => setEv(true)} />
      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="SI utilization evidence" evidence={ev ? s : null} />
    </div>
  );
}
