import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtShare, fmtValue } from "../lib/format";
import {
  Card, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { ChartFrame, KpiStat, BarH, Donut, SERIES } from "../components/ui/charts";
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

function text(v: unknown): string {
  return clean(fmtValue(v));
}

function TopContextBar({ status, onEvidence }: { status: string; onEvidence: () => void }) {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between" data-testid="hospital-top-context">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Hospital Intelligence</h1>
          <button className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-brand"
            onClick={onEvidence}>Evidence</button>
        </div>
        <p className="mt-1 text-sm text-muted">Analyze aggregate provider performance, network use and governed opportunity signals</p>
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

function ProviderInsightSummary({ status, top, value }: { status: string; top: any; value: any }) {
  return (
    <Card className="p-4 border-l-4 border-l-brand">
      <div data-testid="hospital-insight-summary">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl2 bg-brandSoft text-sm font-black text-brand">AI</div>
          <div>
            <div className="text-sm font-semibold text-ink">Governed Provider Insight Summary</div>
            <p className="mt-1 text-sm leading-6 text-ink/80">
              Hospital Intelligence uses aggregate provider groups only. The leading returned provider is
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
            <div className="text-muted">Top concentration</div>
            <div className="mt-1 font-semibold text-ink">{share(value.top_hospital_concentration)}</div>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Negotiation value</div>
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
        <div className="mt-1 text-xs text-muted">Reference section retained without unsupported provider inference</div>
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

function ProviderPerformanceGrid({ providers }: { providers: any[] }) {
  return (
    <Card className="p-4">
      <div data-testid="hospital-provider-grid">
        <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-ink">Aggregate Provider Performance</div>
            <div className="text-xs text-muted">Provider-level aggregates only; no individual claim details</div>
          </div>
          <div className="text-[11px] font-semibold text-muted">Backend order retained</div>
        </div>
        {providers.length === 0 ? <div className="text-sm text-muted">{NA}</div> : (
          <div className="overflow-x-auto rounded-xl2 border border-line">
            <table className="min-w-[840px] w-full text-xs" data-testid="hospital-table">
              <thead className="bg-slate-50 text-muted">
                <tr>
                  {["Hospital", "Incurred", "Claims", "Avg Claim", "Incurred Share", "City", "Efficiency", "Action"].map((h) => (
                    <th key={h} className="px-3 py-3 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-card">
                {providers.slice(0, 10).map((t: any) => (
                  <tr key={t.key} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-semibold text-ink">{String(t.key)}</td>
                    <td className="px-3 py-3 tabular-nums">{money(t.incurred)}</td>
                    <td className="px-3 py-3 tabular-nums">{num(t.count)}</td>
                    <td className="px-3 py-3 tabular-nums">{money(t.average_claim_size)}</td>
                    <td className="px-3 py-3 tabular-nums">{share(t.incurred_share)}</td>
                    <td className="px-3 py-3 text-muted">Not available</td>
                    <td className="px-3 py-3 text-muted">Not available</td>
                    <td className="px-3 py-3 text-brand">Review aggregate</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

function HospitalActionRail({ value }: { value: any }) {
  const alerts = [
    `Top concentration: ${share(value.top_hospital_concentration)}`,
    `Non-network claims: ${num(value.non_network_count)}`,
    "Provider efficiency score: Not Available",
  ];
  const opportunities = [
    "Review high-incurred provider aggregates",
    "Assess network vs non-network usage",
    "Open settlement module for claims process context",
  ];
  const actions = [
    "Review top provider aggregates",
    "Prepare network steering discussion",
    "Request governed city and LOS data",
  ];
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3" data-testid="hospital-action-rail">
      <Card className="p-4">
        <div data-testid="hospital-alerts">
          <div className="text-sm font-semibold text-ink">Alerts</div>
          <div className="mt-3 space-y-2">
            {alerts.map((item) => <div key={item} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-bad">{item}</div>)}
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div data-testid="hospital-opportunities">
          <div className="text-sm font-semibold text-ink">Opportunities</div>
          <div className="mt-3 space-y-2">
            {opportunities.map((item) => <div key={item} className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-good">{item}</div>)}
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div data-testid="hospital-action-center">
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
      <div data-testid="hospital-evidence-footer" className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-ink">Evidence & Caveats</div>
          <div className="mt-1 text-xs text-muted">
            Hospital Intelligence renders governed provider aggregates only. Unsupported efficiency, geography, LOS, TPA and negotiation values show as {NA}.
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

export function Hospital() {
  const [ev, setEv] = useState(false);
  const hospital = useQuery({ queryKey: ["m", "hospital"], queryFn: () => api.metric("hospital") });

  if (hospital.isLoading) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv(true)} /><Skeleton rows={4} /></div>;
  if (hospital.isError) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv(true)} /><ErrorState onRetry={() => hospital.refetch()} /></div>;
  const h = hospital.data;
  const status = h?.data_quality_status || "No Data";
  if (status === "No Data") return <div className="space-y-5"><TopContextBar status={status} onEvidence={() => setEv(true)} /><EmptyState message="No activated hospital data for this tenant yet. Complete Data Onboarding to populate the Hospital dashboard." /></div>;

  const v = h.value || {};
  const tops = v.top_hospitals || [];
  const first = tops[0];
  const bars = tops.slice(0, 8).map((t: any, i: number) => ({ label: String(t.key), value: t.incurred, color: SERIES[i % SERIES.length] }));
  const noNetwork = !v.network_count && !v.non_network_count;

  return (
    <div className="space-y-5" data-testid="hospital-master-screen">
      <TopContextBar status={status} onEvidence={() => setEv(true)} />
      <RestrictedBanner blocked={h.advisory_blocked} />
      <CaveatBanner caveats={h.caveats} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr,1fr]">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 [&_[data-testid=kpistat-value]]:break-words [&_[data-testid=kpistat-value]]:text-xl" data-testid="hospital-kpis">
          <KpiStat label="Hospitals Used" value={num(tops.length)} sub="Distinct named providers" badge={<DataQualityBadge status={status} />} testid="hospital-kpi-count" />
          <KpiStat label="Top Concentration" value={share(v.top_hospital_concentration)} sub="Top provider share" testid="hospital-kpi-concentration" />
          <KpiStat label="Network Claims" value={num(v.network_count)} sub="Cashless-network claims" testid="hospital-kpi-network" />
          <KpiStat label="Non-network Claims" value={num(v.non_network_count)} sub="Out-of-network claims" testid="hospital-kpi-nonnetwork" />
          <KpiStat label="Avg Claim Size" value={first ? money(first.average_claim_size) : NA} sub="Leading returned provider" testid="hospital-kpi-avg" />
          <KpiStat label="High-cost Provider Index" value={NA} sub="Backend supplied only" testid="hospital-kpi-cost-index" />
          <KpiStat label="Network Leakage Amount" value={NA} sub="Backend supplied only" testid="hospital-kpi-leakage" />
          <KpiStat label="Hospital Risk Score" value={NA} sub="Backend supplied only" testid="hospital-kpi-risk-score" />
        </div>
        <ProviderInsightSummary status={status} top={first} value={v} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr,0.9fr,1fr]">
        <ChartFrame title="Top Providers by Incurred" subtitle="Governed incurred concentration" status={status}
          evidence={h} evidenceTitle="Hospital evidence" testid="hospital-top"
          empty={bars.length === 0} emptyMessage="No named hospitals in scope.">
          <BarH data={bars} format={(x) => money(x)} />
        </ChartFrame>

        <ChartFrame title="Network vs Non-network" subtitle="Governed provider split where available" status={status}
          evidence={h} evidenceTitle="Hospital evidence" testid="hospital-network"
          empty={noNetwork} emptyMessage="Network split not available in scope.">
          <Donut data={[
            { label: "Network", value: v.network_count, color: "#16A34A" },
            { label: "Non-network", value: v.non_network_count, color: "#DC2626" }]}
            centerLabel="claims" />
        </ChartFrame>

        <UnsupportedPanel title="Provider Cost Efficiency" items={["Efficiency score", "LOS benchmark", "Market average comparison"]} testid="hospital-efficiency-unsupported" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <ProviderPerformanceGrid providers={tops} />
        <div className="grid grid-cols-1 gap-4">
          <UnsupportedPanel title="Geography / City View" items={["City incurred", "State geography", "Provider location map"]} testid="hospital-geography-unsupported" />
          <UnsupportedPanel title="TPA / Settlement Performance" items={["Claims TAT", "Query rate", "Rework rate"]} testid="hospital-tpa-unsupported" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <UnsupportedPanel title="Negotiation Opportunity" items={["Provider negotiation value", "Package renegotiation value", "Network expansion value"]} testid="hospital-negotiation-unsupported" />
        <UnsupportedPanel title="LOS & Quality" items={["Average LOS", "Service quality index", "Service negligence"]} testid="hospital-los-unsupported" />
        <UnsupportedPanel title="Provider Drill-downs" items={["Ailment by hospital heatmap", "Tariff comparison", "Detailed city analysis"]} testid="hospital-drilldown-unsupported" />
      </div>

      <HospitalActionRail value={v} />

      <FourQuestions
        soWhat={first ? `${String(first.key)} is the leading returned provider at ${money(first.incurred)} (${share(v.top_hospital_concentration)} of incurred).` : "Hospital concentration is available once claims carry hospital names."}
        why="Providers are grouped from governed hospital_name. Incurred, averages, network counts and concentration are API values only."
        next="Use aggregate provider concentration and network split to prepare network steering and data-request discussions."
        trust={`Governed on ${status} data. Unsupported provider efficiency, geography, LOS, TPA and negotiation fields show ${NA}.`} />

      <EvidenceFooter status={status} evidence={h} onEvidence={() => setEv(true)} />
      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="Hospital evidence" evidence={ev ? h : null} />
    </div>
  );
}
