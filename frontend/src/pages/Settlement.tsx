import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtValue } from "../lib/format";
import {
  Card, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { ChartFrame, KpiStat, BarH, Donut, StackedBar, SERIES } from "../components/ui/charts";
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

function text(v: unknown): string {
  return clean(fmtValue(v));
}

function TopContextBar({ status, onEvidence }: { status: string; onEvidence: () => void }) {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between" data-testid="settle-top-context">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Settlement Intelligence</h1>
          <button className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-brand"
            onClick={onEvidence}>Evidence</button>
        </div>
        <p className="mt-1 text-sm text-muted">Monitor governed settlement status, paid and outstanding exposure and operational follow-ups</p>
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

function InsightSummary({ status, v }: { status: string; v: any }) {
  return (
    <Card className="p-4 border-l-4 border-l-brand">
      <div data-testid="settle-insight-summary">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl2 bg-brandSoft text-sm font-black text-brand">AI</div>
          <div>
            <div className="text-sm font-semibold text-ink">Governed Settlement Insight Summary</div>
            <p className="mt-1 text-sm leading-6 text-ink/80">
              Settlement Intelligence uses aggregate claim status and amount fields only.
              Closed claims are {num(v.closed_count)} of {num(v.claim_count)}, with paid value {money(v.paid)} and outstanding value {money(v.outstanding)}.
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Data status</div>
            <div className="mt-1 font-semibold text-ink">{status}</div>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Open and pending claims</div>
            <div className="mt-1 font-semibold text-ink">{num(v.open_count)}</div>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Settlement health score</div>
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
        <div className="mt-1 text-xs text-muted">Reference section retained without unsupported settlement inference</div>
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

function TatPanel({ reason }: { reason: string }) {
  return (
    <Card className="p-4 border-l-4 border-l-amber-500">
      <div data-testid="settle-tat">
        <div className="text-sm font-semibold text-ink">Reimbursement TAT</div>
        <div className="mt-2 text-2xl font-semibold text-ink">{NA}</div>
        <div className="mt-2 text-xs leading-5 text-muted">{reason || "Complete-document receipt and payment dates are required."}</div>
      </div>
    </Card>
  );
}

function ActionRail({ v }: { v: any }) {
  const alerts = [
    `Open and pending claims: ${num(v.open_count)}`,
    `Outstanding amount: ${money(v.outstanding)}`,
    `Reimbursement TAT: ${NA}`,
  ];
  const opportunities = [
    "Review aggregate open-claim status mix",
    "Request complete-document receipt and payment dates for TAT",
    "Improve bill-breakup capture for deduction analysis",
  ];
  const actions = [
    "Review pending status groups",
    "Prepare TPA data request for TAT and deficiency fields",
    "Open Rejection for repudiated-claim context",
  ];
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3" data-testid="settle-action-rail">
      <Card className="p-4">
        <div data-testid="settle-alerts">
          <div className="text-sm font-semibold text-ink">Settlement Risk Alerts</div>
          <div className="mt-3 space-y-2">
            {alerts.map((item) => <div key={item} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-bad">{item}</div>)}
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div data-testid="settle-opportunities">
          <div className="text-sm font-semibold text-ink">Opportunities</div>
          <div className="mt-3 space-y-2">
            {opportunities.map((item) => <div key={item} className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-good">{item}</div>)}
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div data-testid="settle-action-center">
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
      <div data-testid="settle-evidence-footer" className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-ink">Evidence & Caveats</div>
          <div className="mt-1 text-xs text-muted">
            Settlement uses aggregate claim status and amount fields. TAT, aging, query and deficiency, TPA scorecard, delayed-claim tables and employee friction show as {NA}.
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

export function Settlement() {
  const [ev, setEv] = useState(false);
  const st = useQuery({ queryKey: ["m", "settlement"], queryFn: () => api.metric("settlement") });

  if (st.isLoading) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv(true)} /><Skeleton rows={4} /></div>;
  if (st.isError) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv(true)} /><ErrorState onRetry={() => st.refetch()} /></div>;
  const d = st.data;
  const status = d?.data_quality_status || "No Data";
  if (status === "No Data") return <div className="space-y-5"><TopContextBar status={status} onEvidence={() => setEv(true)} /><EmptyState message="No activated claims data for this tenant yet. Complete Data Onboarding to populate the Settlement dashboard." /></div>;

  const v = d.value || {};
  const statusData = (v.status_distribution || []).map((s: any, i: number) => ({ label: String(s.key), value: s.count, color: SERIES[i % SERIES.length] }));
  const statusBars = (v.status_distribution || []).map((s: any, i: number) => ({ label: String(s.key), value: s.count, color: SERIES[i % SERIES.length] }));

  return (
    <div className="space-y-5" data-testid="settle-master-screen">
      <TopContextBar status={status} onEvidence={() => setEv(true)} />
      <RestrictedBanner blocked={d.advisory_blocked} />
      <CaveatBanner caveats={d.caveats} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr,1fr]">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 [&_[data-testid=kpistat-value]]:break-words [&_[data-testid=kpistat-value]]:text-xl" data-testid="settle-kpis">
          <KpiStat label="Total Claims" value={num(v.claim_count)} sub={`${num(v.closed_count)} closed; ${num(v.open_count)} open`} badge={<DataQualityBadge status={status} />} testid="settle-kpi-claims" />
          <KpiStat label="Paid" value={money(v.paid)} sub="Governed paid amount" testid="settle-kpi-paid" />
          <KpiStat label="Outstanding Amount" value={money(v.outstanding)} sub="Backend supplied" testid="settle-kpi-outstanding" />
          <KpiStat label="Pending Claims" value={num(v.open_count)} sub="Open claims" testid="settle-kpi-pending" />
          <KpiStat label="Settled Fully" value={num(v.settled_fully_count)} sub="Closed status basis" testid="settle-kpi-fully" />
          <KpiStat label="Partial Settlement Count" value={num(v.settled_partially_count)} sub="Count only, not ratio" testid="settle-kpi-partial" />
          <KpiStat label="Deduction" value={v.deduction_amount != null ? money(v.deduction_amount) : NA} sub={`Bill-breakup claims: ${num(v.bill_breakup_claims)}`} testid="settle-kpi-deduction" />
          <KpiStat label="Reimbursement TAT" value={NA} sub="Backend date fields absent" testid="settle-kpi-tat" />
          <KpiStat label="Paid Ratio" value={NA} sub="Backend supplied only" testid="settle-kpi-paid-ratio" />
          <KpiStat label="Query / Deficiency Rate" value={NA} sub="Backend supplied only" testid="settle-kpi-query-rate" />
          <KpiStat label="Settlement Health Score" value={NA} sub="Backend supplied only" testid="settle-kpi-health" />
          <KpiStat label="Employee Friction Score" value={NA} sub="Backend supplied only" testid="settle-kpi-friction" />
        </div>
        <InsightSummary status={status} v={v} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr,1fr,0.9fr]">
        <ChartFrame title="Claim Lifecycle / Status Funnel" subtitle="Claims by governed settlement status" status={status}
          evidence={d} evidenceTitle="Settlement evidence" testid="settle-status"
          empty={statusBars.length === 0} emptyMessage="No claim status data in scope.">
          <BarH data={statusBars} format={(x) => num(x)} />
        </ChartFrame>

        <ChartFrame title="Paid vs Outstanding" subtitle="Governed split of incurred" status={status}
          evidence={d} evidenceTitle="Settlement evidence" testid="settle-paid-outstanding"
          empty={typeof v.incurred !== "number"} emptyMessage="No claim amounts in scope.">
          <StackedBar rows={[{ label: "Incurred", segments: [
            { label: "Paid", value: v.paid, color: "#2563EB" },
            { label: "Outstanding", value: v.outstanding, color: "#D97706" }] }]}
            format={(x) => money(x)} />
        </ChartFrame>

        <ChartFrame title="Cashless / Reimbursement Mix" subtitle="Claim type split where provided" status={status}
          evidence={d} evidenceTitle="Settlement evidence" testid="settle-type"
          empty={!v.cashless_count && !v.reimbursement_count} emptyMessage="Claim-type split not available in scope.">
          <Donut data={[
            { label: "Cashless", value: v.cashless_count, color: "#16A34A" },
            { label: "Reimbursement", value: v.reimbursement_count, color: "#7C3AED" }]}
            centerValue={num(v.claim_count)} centerLabel="claims" />
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <TatPanel reason={String(v.tat?.reason || "")} />
        <UnsupportedPanel title="Pending Claims Aging" items={["0-7 days", "8-15 days", "30+ days"]} testid="settle-aging-unsupported" />
        <UnsupportedPanel title="Query / Deficiency Analysis" items={["Query rate", "Deficiency reason", "Repeat document query"]} testid="settle-query-unsupported" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <UnsupportedPanel title="TPA Performance Scorecard" items={["TPA score", "Branch TAT", "Service quality index"]} testid="settle-tpa-unsupported" />
        <UnsupportedPanel title="Delayed Claims Table" items={["Claim-level table", "Claim numbers", "Employee/member names"]} testid="settle-delayed-unsupported" />
        <UnsupportedPanel title="Employee Experience Impact" items={["Employee friction score", "Service quality review", "Legal conclusion"]} testid="settle-experience-unsupported" />
      </div>

      <ActionRail v={v} />

      <FourQuestions
        soWhat={`${num(v.open_count)} claims are open/pending; paid is ${money(v.paid)} and outstanding is ${money(v.outstanding)}.`}
        why="Status mix, paid/outstanding, cashless/reimbursement and deduction are governed API values. TAT is not computed without complete-document receipt and payment dates."
        next="Review open status groups and request governed TAT, aging, query and TPA fields before any service-quality scorecard."
        trust={`Governed on ${status} data. TAT, aging, TPA scorecard, delayed claim table and employee friction remain ${NA}.`} />

      <EvidenceFooter status={status} evidence={d} onEvidence={() => setEv(true)} />
      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="Settlement evidence" evidence={ev ? d : null} />
    </div>
  );
}
