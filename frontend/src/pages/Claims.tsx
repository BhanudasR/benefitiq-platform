import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtShare } from "../lib/format";
import {
  Card, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { ChartFrame, KpiStat, Donut, StackedBar, Sparkline, BarH, SERIES } from "../components/ui/charts";
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
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between" data-testid="claims-top-context">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Claims</h1>
          <button className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-brand"
            onClick={onEvidence}>Evidence</button>
        </div>
        <p className="mt-1 text-sm text-muted">Understand claim experience, cost drivers and governed action priorities</p>
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

function ClaimsInsightSummary({ status, claims, large }: { status: string; claims: any; large: any }) {
  return (
    <Card className="p-4 border-l-4 border-l-brand">
      <div data-testid="claims-insight-summary">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl2 bg-brandSoft text-sm font-black text-brand">AI</div>
          <div>
            <div className="text-sm font-semibold text-ink">Governed Claims Insight Summary</div>
            <p className="mt-1 text-sm leading-6 text-ink/80">
              Claims are shown from governed aggregate metrics only. Incurred claims are {money(claims.incurred)}
              across {num(claims.claim_count)} claims, with {num(large.large_claim_count)} large-claim review candidates.
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Claims status</div>
            <div className="mt-1 font-semibold text-ink">{status}</div>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Large claim share</div>
            <div className="mt-1 font-semibold text-ink">{share(large.large_claim_incurred_share)}</div>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Unsupported signals</div>
            <div className="mt-1 font-semibold text-ink">No fraud or claimant PII</div>
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
        <div className="mt-1 text-xs text-muted">Reference section retained without fabricated values</div>
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

function ClaimsAlertRail({ claims, large }: { claims: any; large: any }) {
  const alerts = [
    `Open claims: ${num(claims.open_claims)}`,
    `Large claim review candidates: ${num(large.large_claim_count)}`,
    `Outstanding amount: ${money(claims.outstanding)}`,
  ];
  const opportunities = [
    "Review outstanding claims",
    "Analyze large-claim aggregate drivers",
    "Open ailment intelligence for diagnosis-group drivers",
  ];
  const actions = [
    "Review large claims aggregate",
    "Check outstanding claim status mix",
    "Prepare claims narrative for renewal",
  ];
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3" data-testid="claims-action-rail">
      <Card className="p-4">
        <div data-testid="claims-alerts">
          <div className="text-sm font-semibold text-ink">Alerts</div>
          <div className="mt-3 space-y-2">
            {alerts.map((item) => <div key={item} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-bad">{item}</div>)}
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div data-testid="claims-opportunities">
          <div className="text-sm font-semibold text-ink">Opportunities</div>
          <div className="mt-3 space-y-2">
            {opportunities.map((item) => <div key={item} className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-good">{item}</div>)}
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div data-testid="claims-action-center">
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

function EvidenceFooter({ status, evidence, large, trends, onEvidence }: { status: string; evidence: any; large: any; trends: any; onEvidence: () => void }) {
  const sources = evidence?.source_tables || [];
  return (
    <Card className="p-4">
      <div data-testid="claims-evidence-footer" className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-ink">Evidence & Caveats</div>
          <div className="mt-1 text-xs text-muted">
            Claims renders governed aggregate APIs only. Unsupported fields render as {NA}; no raw claim numbers, member identifiers or hospital identifiers are shown.
          </div>
          {sources.length > 0 && <div className="mt-2 text-[11px] text-muted">Sources: {sources.join(", ")}</div>}
          <div className="mt-1 text-[11px] text-muted">Large-claim basis: {clean(large?.formula || NA)} · Trend basis: {clean(trends?.formula || NA)}</div>
        </div>
        <div className="flex items-center gap-3">
          <DataQualityBadge status={status} />
          <button onClick={onEvidence} className="text-xs font-semibold text-brand hover:underline">View evidence and formulas</button>
        </div>
      </div>
    </Card>
  );
}

export function Claims() {
  const [ev, setEv] = useState(false);
  const claims = useQuery({ queryKey: ["m", "claims"], queryFn: () => api.metric("claims") });
  const trends = useQuery({ queryKey: ["m", "trends"], queryFn: () => api.metric("trends") });
  const large = useQuery({ queryKey: ["m", "large-claims"], queryFn: () => api.metric("large-claims") });

  if (claims.isLoading) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv(true)} /><Skeleton rows={4} /></div>;
  if (claims.isError) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv(true)} /><ErrorState onRetry={() => claims.refetch()} /></div>;
  const cl = claims.data;
  const status = cl?.data_quality_status || "No Data";
  if (status === "No Data") return <div className="space-y-5"><TopContextBar status={status} onEvidence={() => setEv(true)} /><EmptyState message="No activated claims data for this tenant yet. Complete Data Onboarding to populate the Claims dashboard." /></div>;

  const v = cl.value || {};
  const tv = trends.data?.value || {};
  const series = tv.series || [];
  const incurredTrend = series.map((s: any) => s.incurred).filter((x: any) => typeof x === "number");
  const statusSplit = v.status_split || {};
  const mix = Object.keys(statusSplit).map((k, i) => ({ label: k, value: statusSplit[k], color: SERIES[i % SERIES.length] }));
  const lv = large.data?.value || {};
  const statusRows = Object.keys(statusSplit).map((k, i) => ({ label: k, value: statusSplit[k], color: SERIES[i % SERIES.length] }));

  return (
    <div className="space-y-5" data-testid="claims-master-screen">
      <TopContextBar status={status} onEvidence={() => setEv(true)} />
      <RestrictedBanner blocked={cl.advisory_blocked} />
      <CaveatBanner caveats={cl.caveats} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr,1fr]">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 [&_[data-testid=kpistat-value]]:break-words [&_[data-testid=kpistat-value]]:text-xl" data-testid="claims-kpis">
          <KpiStat label="Total Claims" value={num(v.claim_count)} sub={`${num(v.open_claims)} open claims`} badge={<DataQualityBadge status={status} />} testid="claims-kpi-count" />
          <KpiStat label="Claimed Amount" value={NA} sub="Backend supplied only" testid="claims-kpi-claimed" />
          <KpiStat label="Paid Amount" value={money(v.paid)} sub={`${num(v.closed_claims)} closed claims`} testid="claims-kpi-paid" />
          <KpiStat label="Outstanding" value={money(v.outstanding)} sub="Open exposure" testid="claims-kpi-outstanding" />
          <KpiStat label="Incurred Claims" value={money(v.incurred)} sub="Paid plus outstanding" testid="claims-kpi-incurred" />
          <KpiStat label="Claim Frequency" value={NA} sub="Backend supplied only" testid="claims-kpi-frequency" />
          <KpiStat label="Average Claim Size" value={money(v.average_claim_size)} sub="Governed metric" testid="claims-kpi-avg" />
          <KpiStat label="Unique Claimants" value={NA} sub="Backend supplied only" testid="claims-kpi-claimants" />
        </div>
        <ClaimsInsightSummary status={status} claims={v} large={lv} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr,1fr,0.9fr]">
        <ChartFrame title="Paid / Outstanding / Incurred Financial Visual" subtitle="Governed aggregate amount split" status={status}
          evidence={cl} evidenceTitle="Claims evidence" testid="claims-paid-outstanding"
          empty={typeof v.incurred !== "number"} emptyMessage="No claim amounts in scope.">
          <StackedBar rows={[{ label: "Incurred", segments: [
            { label: "Paid", value: v.paid, color: "#2563EB" },
            { label: "Outstanding", value: v.outstanding, color: "#D97706" }] }]}
            format={(x) => money(x)} />
        </ChartFrame>

        <ChartFrame title="Claim Trend" subtitle="Per policy year from trends API" status={trends.data?.data_quality_status}
          caveats={trends.data?.caveats} evidence={trends.data} evidenceTitle="Trend evidence" testid="claims-trend"
          empty={incurredTrend.length < 2} emptyMessage="At least two policy years are needed for a trend.">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <Sparkline values={incurredTrend} width={280} height={60} />
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted">
              {series.map((s: any) => (
                <div key={s.policy_year} className="flex gap-2">
                  <span className="text-ink tabular-nums">{String(s.policy_year)}</span>
                  <span>{money(s.incurred)}</span>
                </div>
              ))}
            </div>
          </div>
        </ChartFrame>

        <ChartFrame title="Claim Type Mix" subtitle="Cashless and reimbursement counts where provided" status={status}
          evidence={cl} evidenceTitle="Claims evidence" testid="claims-type"
          empty={!v.cashless_count && !v.reimbursement_count} emptyMessage="Claim-type split not available in scope.">
          <Donut data={[
            { label: "Cashless", value: v.cashless_count, color: "#16A34A" },
            { label: "Reimbursement", value: v.reimbursement_count, color: "#7C3AED" }]}
            centerValue={num(v.claim_count)} centerLabel="claims" />
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr,1fr,1fr]">
        <ChartFrame title="Status / Lifecycle Visual" subtitle="Backend-supported status split only" status={status}
          evidence={cl} evidenceTitle="Claims evidence" testid="claims-status"
          empty={mix.length === 0} emptyMessage="No claim status data.">
          <Donut data={mix} centerValue={num(v.claim_count)} centerLabel="claims" />
        </ChartFrame>

        <ChartFrame title="Large Claims Aggregate View" subtitle="Aggregate review candidates; raw identifiers hidden" status={large.data?.data_quality_status}
          caveats={large.data?.caveats} evidence={large.data} evidenceTitle="Large claims evidence" testid="claims-large-aggregate"
          empty={lv.large_claim_count == null} emptyMessage="Large claim aggregate is not available.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-line px-3 py-3"><div className="text-xs text-muted">Large Claims</div><div className="mt-1 text-xl font-semibold text-ink">{num(lv.large_claim_count)}</div></div>
            <div className="rounded-lg border border-line px-3 py-3"><div className="text-xs text-muted">Incurred</div><div className="mt-1 text-xl font-semibold text-ink">{money(lv.large_claim_incurred)}</div></div>
            <div className="rounded-lg border border-line px-3 py-3"><div className="text-xs text-muted">Share</div><div className="mt-1 text-xl font-semibold text-ink">{share(lv.large_claim_incurred_share)}</div></div>
          </div>
        </ChartFrame>

        <ChartFrame title="Status Driver Bars" subtitle="Status counts from claims metric" status={status}
          evidence={cl} evidenceTitle="Claims evidence" testid="claims-status-bars"
          empty={statusRows.length === 0} emptyMessage="Status distribution is not available.">
          <BarH data={statusRows} format={(x) => num(x)} />
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <UnsupportedPanel title="Frequency / Severity Visual" items={["Severity band", "Claim concentration score", "Frequency rate"]} testid="claims-frequency-severity" />
        <UnsupportedPanel title="Cost Pyramid & Anomaly Signals" items={["Cost pyramid", "Fraud/anomaly signals", "Top claimant concentration"]} testid="claims-unsupported-risk" />
        <UnsupportedPanel title="Claim Lifecycle Funnel" items={["Reported stage", "Approved stage", "Paid conversion"]} testid="claims-lifecycle-unsupported" />
      </div>

      <ClaimsAlertRail claims={v} large={lv} />

      <FourQuestions
        soWhat={`Incurred ${money(v.incurred)} across ${num(v.claim_count)} claims; ${num(lv.large_claim_count)} large claims are aggregate review candidates.`}
        why="Paid, outstanding, counts, average claim size, status split, claim type mix and large-claim flags are governed API values."
        next="Review outstanding exposure, large-claim aggregate signals and ailment drivers before building the renewal narrative."
        trust={`Governed on ${status} data. Unsupported reference sections show ${NA}; the master screen does not expose raw claim or member identifiers.`} />

      <EvidenceFooter status={status} evidence={cl} large={large.data} trends={trends.data} onEvidence={() => setEv(true)} />
      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="Claims evidence" evidence={ev ? cl : null} />
    </div>
  );
}
