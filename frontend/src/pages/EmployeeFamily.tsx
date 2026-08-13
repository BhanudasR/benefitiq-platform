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
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between" data-testid="ef-top-context">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Employee & Family Intelligence</h1>
          <button className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-brand"
            onClick={onEvidence}>Evidence</button>
        </div>
        <p className="mt-1 text-sm text-muted">Understand aggregate relationship consumption without exposing member or family identifiers</p>
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

function InsightSummary({ status, top, v }: { status: string; top: any; v: any }) {
  return (
    <Card className="p-4 border-l-4 border-l-brand">
      <div data-testid="ef-insight-summary">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl2 bg-brandSoft text-sm font-black text-brand">AI</div>
          <div>
            <div className="text-sm font-semibold text-ink">Governed Relationship Insight Summary</div>
            <p className="mt-1 text-sm leading-6 text-ink/80">
              Relationship consumption is grouped from governed member relationship linkage.
              The leading returned relationship is {top ? String(top.key) : NA} with incurred value {top ? money(top.incurred) : NA}.
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Data status</div>
            <div className="mt-1 font-semibold text-ink">{status}</div>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Parent claim share</div>
            <div className="mt-1 font-semibold text-ink">{share(v.parent_claim_share)}</div>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Family risk score</div>
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
        <div className="mt-1 text-xs text-muted">Reference section retained without unsupported family-level inference</div>
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

function RelationshipGrid({ groups }: { groups: any[] }) {
  return (
    <Card className="p-4">
      <div data-testid="ef-table">
        <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-ink">Aggregate Relationship Drilldown</div>
            <div className="text-xs text-muted">Relationship-level aggregates only; no member, employee or family identifiers</div>
          </div>
          <div className="text-[11px] font-semibold text-muted">Backend order retained</div>
        </div>
        {groups.length === 0 ? <div className="text-sm text-muted">{NA}</div> : (
          <div className="overflow-x-auto rounded-xl2 border border-line">
            <table className="min-w-[760px] w-full text-xs">
              <thead className="bg-slate-50 text-muted">
                <tr>
                  {["Relationship", "Claims", "Incurred", "Paid", "Average Claim", "Incurred Share", "Family-level Detail"].map((h) => (
                    <th key={h} className="px-3 py-3 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-card">
                {groups.slice(0, 10).map((g: any) => (
                  <tr key={g.key} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-semibold text-ink">{String(g.key)}</td>
                    <td className="px-3 py-3 tabular-nums">{num(g.count)}</td>
                    <td className="px-3 py-3 tabular-nums">{money(g.incurred)}</td>
                    <td className="px-3 py-3 tabular-nums">{money(g.paid)}</td>
                    <td className="px-3 py-3 tabular-nums">{money(g.average_claim_size)}</td>
                    <td className="px-3 py-3 tabular-nums">{share(g.incurred_share)}</td>
                    <td className="px-3 py-3 text-muted">{NA}</td>
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

function ActionRail({ v }: { v: any }) {
  const alerts = [
    `Parent claim share: ${share(v.parent_claim_share)}`,
    `Family experience score: ${NA}`,
    `Repeat claimants: ${NA}`,
  ];
  const opportunities = [
    "Use parent share in renewal benefit discussion",
    "Request governed family-size and repeat-claimant source fields",
    "Route SI exposure questions to SI Utilization",
  ];
  const actions = [
    "Review relationship consumption mix",
    "Check Unknown relationship caveats",
    "Open Renewal Intelligence for benefit design options",
  ];
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3" data-testid="ef-action-rail">
      <Card className="p-4">
        <div data-testid="ef-alerts">
          <div className="text-sm font-semibold text-ink">Alerts</div>
          <div className="mt-3 space-y-2">
            {alerts.map((item) => <div key={item} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-bad">{item}</div>)}
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div data-testid="ef-opportunities">
          <div className="text-sm font-semibold text-ink">Opportunities</div>
          <div className="mt-3 space-y-2">
            {opportunities.map((item) => <div key={item} className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-good">{item}</div>)}
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div data-testid="ef-action-center">
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
      <div data-testid="ef-evidence-footer" className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-ink">Evidence & Caveats</div>
          <div className="mt-1 text-xs text-muted">
            Employee & Family uses aggregate relationship groups only. Family IDs, repeat claimants, risk scores and experience score show as {NA}.
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

export function EmployeeFamily() {
  const [ev, setEv] = useState(false);
  const relation = useQuery({ queryKey: ["m", "relation"], queryFn: () => api.metric("relation") });

  if (relation.isLoading) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv(true)} /><Skeleton rows={4} /></div>;
  if (relation.isError) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv(true)} /><ErrorState onRetry={() => relation.refetch()} /></div>;
  const r = relation.data;
  const status = r?.data_quality_status || "No Data";
  if (status === "No Data") return <div className="space-y-5"><TopContextBar status={status} onEvidence={() => setEv(true)} /><EmptyState message="No activated claims/member data for this tenant yet. Complete Data Onboarding to populate the Employee & Family dashboard." /></div>;

  const v = r.value || {};
  const groups = (v.groups || []).filter((g: any) => g.key !== "Unknown");
  const bars = groups.map((g: any, i: number) => ({ label: String(g.key), value: g.incurred, color: SERIES[i % SERIES.length] }));
  const claimBars = groups.map((g: any, i: number) => ({ label: String(g.key), value: g.count, color: SERIES[i % SERIES.length] }));
  const shareData = groups.slice(0, 8).map((g: any, i: number) => ({ label: String(g.key), value: g.incurred, color: SERIES[i % SERIES.length] }));
  const top = groups[0];

  return (
    <div className="space-y-5" data-testid="ef-master-screen">
      <TopContextBar status={status} onEvidence={() => setEv(true)} />
      <RestrictedBanner blocked={r.advisory_blocked} />
      <CaveatBanner caveats={r.caveats} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr,1fr]">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 [&_[data-testid=kpistat-value]]:break-words [&_[data-testid=kpistat-value]]:text-xl" data-testid="ef-kpis">
          <KpiStat label="Relationships" value={num(groups.length)} sub="Distinct member relationships" badge={<DataQualityBadge status={status} />} testid="ef-kpi-relations" />
          <KpiStat label="Top Consumer" value={top ? String(top.key) : NA} sub={top ? money(top.incurred) : NA} testid="ef-kpi-top" />
          <KpiStat label="Top Share" value={top?.incurred_share != null ? share(top.incurred_share) : NA} sub="of incurred" testid="ef-kpi-topshare" />
          <KpiStat label="Parent Claim Share" value={share(v.parent_claim_share)} sub="Father plus Mother incurred" testid="ef-kpi-parent" />
          <KpiStat label="Claiming Members" value={NA} sub="Backend supplied only" testid="ef-kpi-claiming-members" />
          <KpiStat label="Claimant Ratio" value={NA} sub="Backend supplied only" testid="ef-kpi-claimant-ratio" />
          <KpiStat label="Family Experience" value={NA} sub="Backend supplied only" testid="ef-kpi-family-experience" />
          <KpiStat label="Family Risk Score" value={NA} sub="Backend supplied only" testid="ef-kpi-family-risk" />
        </div>
        <InsightSummary status={status} top={top} v={v} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr,0.9fr,1fr]">
        <ChartFrame title="Claims by Member Category" subtitle="Incurred by governed relationship" status={status}
          evidence={r} evidenceTitle="Relationship evidence" testid="ef-bars"
          empty={bars.length === 0} emptyMessage="No relationship groups in scope.">
          <BarH data={bars} format={(x) => money(x)} />
        </ChartFrame>

        <ChartFrame title="Relationship Share" subtitle="Incurred concentration" status={status}
          evidence={r} evidenceTitle="Relationship evidence" testid="ef-donut"
          empty={shareData.length === 0} emptyMessage="No relationship groups in scope.">
          <Donut data={shareData} centerValue={num(groups.length)} centerLabel="relations" />
        </ChartFrame>

        <ChartFrame title="Relation-wise Claim Count" subtitle="Aggregate claim counts by relationship" status={status}
          evidence={r} evidenceTitle="Relationship evidence" testid="ef-claim-counts"
          empty={claimBars.length === 0} emptyMessage="No relationship claims in scope.">
          <BarH data={claimBars} format={(x) => num(x)} />
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <RelationshipGrid groups={groups} />
        <div className="grid grid-cols-1 gap-4">
          <UnsupportedPanel title="High-risk Families" items={["Family risk score", "High-risk family count", "Family-level reason"]} testid="ef-high-risk-unsupported" />
          <UnsupportedPanel title="Repeat Claimants" items={["Members with repeat claims", "Repeat claimant incurred", "Average repeat claims"]} testid="ef-repeat-unsupported" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <UnsupportedPanel title="Parent Claim Impact" items={["Parent risk score", "Parent age band impact", "Parent claim trend"]} testid="ef-parent-impact-unsupported" />
        <UnsupportedPanel title="Family Concentration" items={["Family size grid", "Top family table", "Concentration by family size"]} testid="ef-family-concentration-unsupported" />
        <UnsupportedPanel title="Employee Experience Impact" items={["Delayed or query claims", "Out-of-pocket impact", "Experience score"]} testid="ef-experience-unsupported" />
      </div>

      <ActionRail v={v} />

      <FourQuestions
        soWhat={top ? `${String(top.key)} is the largest relationship group by incurred at ${money(top.incurred)}; parent claim share is ${share(v.parent_claim_share)}.` : "Relationship consumption is available once claims are linked to member relationships."}
        why="Claims are grouped by governed member relationship. Counts, incurred, averages and shares are backend values; no browser math or family-level inference is used."
        next="Use relationship mix and parent claim share for renewal benefit discussion, with any family-level scoring deferred until governed source fields exist."
        trust={`Governed on ${status} data. Unknown relationship caveats are surfaced, and family identifiers, risk scores and repeat claimant fields show ${NA}.`} />

      <EvidenceFooter status={status} evidence={r} onEvidence={() => setEv(true)} />
      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="Relationship evidence" evidence={ev ? r : null} />
    </div>
  );
}
