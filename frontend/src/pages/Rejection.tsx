import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtShare, fmtValue } from "../lib/format";
import {
  Card, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { ChartFrame, KpiStat, Donut, Gauge, SERIES } from "../components/ui/charts";
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

function text(v: unknown): string {
  return clean(fmtValue(v));
}

function TopContextBar({ status, onEvidence }: { status: string; onEvidence: () => void }) {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between" data-testid="rej-top-context">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Rejection Analysis</h1>
          <button className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-brand"
            onClick={onEvidence}>Evidence</button>
        </div>
        <p className="mt-1 text-sm text-muted">Monitor aggregate repudiation patterns and operational prevention readiness</p>
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

function RejectionInsightSummary({ status, value }: { status: string; value: any }) {
  return (
    <Card className="p-4 border-l-4 border-l-brand">
      <div data-testid="rej-insight-summary">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl2 bg-brandSoft text-sm font-black text-brand">AI</div>
          <div>
            <div className="text-sm font-semibold text-ink">Governed Rejection Insight Summary</div>
            <p className="mt-1 text-sm leading-6 text-ink/80">
              Rejection Analysis is limited to aggregate claims with claim_status marked Repudiated.
              Reason, recoverability and appeal outcomes remain {NA} until governed source fields exist.
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Data status</div>
            <div className="mt-1 font-semibold text-ink">{status}</div>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Repudiated claims</div>
            <div className="mt-1 font-semibold text-ink">{num(value.rejection_count)}</div>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Recoverable value</div>
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
        <div className="mt-1 text-xs text-muted">Reference section retained without unsupported rejection inference</div>
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

function BasisPanel({ evidence }: { evidence: any }) {
  return (
    <Card className="p-4 border-l-4 border-l-amber-500">
      <div data-testid="rej-basis-panel">
        <div className="text-sm font-semibold text-ink">Repudiated Logic Basis</div>
        <p className="mt-2 text-sm leading-6 text-ink/80">
          This dashboard treats only governed claim_status values equal to Repudiated as rejection records.
          It does not infer rejection reason, avoidability, recoverability, appeal success, wrongful rejection or legal conclusion.
        </p>
        <div className="mt-3 rounded-lg border border-line bg-slate-50 px-3 py-2 text-xs text-muted">
          Formula: {text(evidence?.formula)}
        </div>
      </div>
    </Card>
  );
}

function PreventionActions() {
  const actions = [
    "Request structured rejection reason fields from insurer or TPA",
    "Compare repudiated count against claims operations register",
    "Prepare documentation checklist for high-volume rejection categories",
    "Track appeal or reversal outcome only after governed source linkage exists",
  ];
  return (
    <Card className="p-4">
      <div data-testid="rej-prevention-actions">
        <div className="text-sm font-semibold text-ink">Prevention Action List</div>
        <div className="mt-1 text-xs text-muted">Operational checklist only; no legal conclusion or advice</div>
        <div className="mt-3 space-y-2">
          {actions.map((item, index) => (
            <div key={item} className="flex gap-3 rounded-lg border border-line px-3 py-2 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand text-xs font-bold text-white">{fmtNumber(index + 1)}</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function RejectionActionRail({ value }: { value: any }) {
  const alerts = [
    `Rejection ratio: ${share(value.rejection_ratio)}`,
    `Rejected amount: ${money(value.rejection_amount)}`,
    `Rejection reasons: ${NA}`,
  ];
  const opportunities = [
    "Improve source capture for rejection reasons",
    "Create appeal outcome evidence linkage",
    "Use aggregate claim-type mix for operations review",
  ];
  const actions = [
    "Validate Repudiated status coding",
    "Request recoverability fields",
    "Prepare prevention checklist",
  ];
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3" data-testid="rej-action-rail">
      <Card className="p-4">
        <div data-testid="rej-alerts">
          <div className="text-sm font-semibold text-ink">Alerts</div>
          <div className="mt-3 space-y-2">
            {alerts.map((item) => <div key={item} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-bad">{item}</div>)}
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div data-testid="rej-opportunities">
          <div className="text-sm font-semibold text-ink">Opportunities</div>
          <div className="mt-3 space-y-2">
            {opportunities.map((item) => <div key={item} className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-good">{item}</div>)}
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div data-testid="rej-action-center">
          <div className="text-sm font-semibold text-ink">Action Center</div>
          <div className="mt-3 space-y-2">
            {actions.map((item, index) => (
              <div key={item} className="flex gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand text-xs font-bold text-white">{fmtNumber(index + 1)}</span>
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
      <div data-testid="rej-evidence-footer" className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-ink">Evidence & Caveats</div>
          <div className="mt-1 text-xs text-muted">
            Rejection Analysis is aggregate-only. Reason, recoverability, appeal success, repeat rejection and queue fields show as {NA}.
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

export function Rejection() {
  const [ev, setEv] = useState(false);
  const rej = useQuery({ queryKey: ["m", "rejection"], queryFn: () => api.metric("rejection") });

  if (rej.isLoading) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv(true)} /><Skeleton rows={4} /></div>;
  if (rej.isError) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv(true)} /><ErrorState onRetry={() => rej.refetch()} /></div>;
  const d = rej.data;
  const status = d?.data_quality_status || "No Data";
  if (status === "No Data") return <div className="space-y-5"><TopContextBar status={status} onEvidence={() => setEv(true)} /><EmptyState message="No activated claims data for this tenant yet. Complete Data Onboarding to populate the Rejection dashboard." /></div>;

  const v = d.value || {};
  const byType = (v.by_claim_type || []).map((t: any, i: number) => ({ label: String(t.key), value: t.count, color: SERIES[i % SERIES.length] }));

  return (
    <div className="space-y-5" data-testid="rej-master-screen">
      <TopContextBar status={status} onEvidence={() => setEv(true)} />
      <RestrictedBanner blocked={d.advisory_blocked} />
      <CaveatBanner caveats={d.caveats} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr,1fr]">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 [&_[data-testid=kpistat-value]]:break-words [&_[data-testid=kpistat-value]]:text-xl" data-testid="rej-kpis">
          <KpiStat label="Rejections" value={num(v.rejection_count)} sub={`of ${num(v.total_claims)} claims`} badge={<DataQualityBadge status={status} />} testid="rej-kpi-count" />
          <KpiStat label="Rejection Ratio" value={share(v.rejection_ratio)} sub="Repudiated status basis" testid="rej-kpi-ratio" />
          <KpiStat label="Rejected Amount" value={money(v.rejection_amount)} sub="Claimed amount of repudiated" testid="rej-kpi-amount" />
          <KpiStat label="Status Basis" value="Repudiated" sub="Governed claim status only" testid="rej-kpi-basis" />
          <KpiStat label="Recoverable Value" value={NA} sub="Backend supplied only" testid="rej-kpi-recoverable" />
          <KpiStat label="Avoidable Rejection" value={NA} sub="Backend supplied only" testid="rej-kpi-avoidable" />
          <KpiStat label="Appeal Success" value={NA} sub="Backend supplied only" testid="rej-kpi-appeal" />
          <KpiStat label="Repeat Rejection" value={NA} sub="Backend supplied only" testid="rej-kpi-repeat" />
        </div>
        <RejectionInsightSummary status={status} value={v} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr,0.9fr,1.2fr]">
        <ChartFrame title="Rejection Ratio" subtitle="Repudiated share of claims" status={status}
          evidence={d} evidenceTitle="Rejection evidence" testid="rej-gauge"
          empty={v.rejection_ratio == null} emptyMessage="No claims in scope.">
          <Gauge value={v.rejection_ratio} min={0} max={1}
            valueText={share(v.rejection_ratio)} label="Rejection ratio"
            bands={[{ upTo: 0.05, color: "#16A34A" }, { upTo: 0.15, color: "#D97706" }]} />
        </ChartFrame>

        <ChartFrame title="Claim-type Split" subtitle="Rejected claims by governed claim type" status={status}
          evidence={d} evidenceTitle="Rejection evidence" testid="rej-bytype"
          empty={byType.length === 0} emptyMessage="No rejected claims in scope.">
          <Donut data={byType} centerValue={num(v.rejection_count)} centerLabel="rejected" />
        </ChartFrame>

        <BasisPanel evidence={d} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <UnsupportedPanel title="Rejection Reasons" items={["Reason breakup", "Documentation gap", "Policy exclusion reason"]} testid="rej-reasons" />
        <UnsupportedPanel title="Recoverability & Appeals" items={["Recoverable value", "Appeal success", "Wrongful rejection"]} testid="rej-wrongful" />
        <UnsupportedPanel title="Repeat / Avoidable Rejection" items={["Repeat rejection", "Avoidable rejection", "Prevention value"]} testid="rej-repeat-unsupported" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr,1fr]">
        <UnsupportedPanel title="Relation / Ailment / Hospital Split" items={["Relation split", "Ailment split", "Hospital split"]} testid="rej-splits-unsupported" />
        <UnsupportedPanel title="Rejection Queue" items={["Claim-level queue", "Member-level queue", "Appeal owner"]} testid="rej-queue-unsupported" />
      </div>

      <PreventionActions />
      <RejectionActionRail value={v} />

      <FourQuestions
        soWhat={`${num(v.rejection_count)} of ${num(v.total_claims)} claims were repudiated (${share(v.rejection_ratio)}).`}
        why="Rejection uses only the governed Repudiated claim status; no reason, recoverability, appeal outcome or legal conclusion is invented."
        next="Where the ratio is elevated, request structured rejection reasons and appeal outcomes before deeper recovery analysis."
        trust={`Governed on ${status} data. Reasons, wrongful rejection, recoverability, appeal success and queue data are ${NA}.`} />

      <EvidenceFooter status={status} evidence={d} onEvidence={() => setEv(true)} />
      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="Rejection evidence" evidence={ev ? d : null} />
    </div>
  );
}
