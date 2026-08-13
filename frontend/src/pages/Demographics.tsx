import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtNumber, fmtShare, fmtValue } from "../lib/format";
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
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between" data-testid="demo-top-context">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Demographics</h1>
          <button className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-brand"
            onClick={onEvidence}>Evidence</button>
        </div>
        <p className="mt-1 text-sm text-muted">Understand who is covered and where population exposure needs governed review</p>
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
      <div data-testid="demo-insight-summary">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl2 bg-brandSoft text-sm font-black text-brand">AI</div>
          <div>
            <div className="text-sm font-semibold text-ink">Governed Demographic Summary</div>
            <p className="mt-1 text-sm leading-6 text-ink/80">
              The covered population has {num(v.member_count)} members, {num(v.employee_count)} employees and {num(v.dependent_count)} dependents.
              Senior share is {share(v.senior_share)} using the backend senior definition of age {num(v.senior_definition_age)} and above.
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Data status</div>
            <div className="mt-1 font-semibold text-ink">{status}</div>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Missing age</div>
            <div className="mt-1 font-semibold text-ink">{num(v.missing_age)}</div>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Demographic health score</div>
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
        <div className="mt-1 text-xs text-muted">Reference section retained without unsupported demographic inference</div>
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

function PopulationSnapshot({ v }: { v: any }) {
  const cards = [
    ["Total Lives", num(v.member_count), "Members in scope"],
    ["Employees", num(v.employee_count), "Covered employees"],
    ["Dependents", num(v.dependent_count), "Covered dependents"],
    ["Average Age", v.average_age != null ? value(v.average_age) : NA, "From member.age"],
    ["Senior Members", num(v.senior_count), `Age ${num(v.senior_definition_age)} and above`],
    ["Senior Share", share(v.senior_share), "Members with age only"],
    ["Dependent Ratio", v.dependent_ratio != null ? value(v.dependent_ratio) : NA, "Dependents per employee"],
    ["Female Ratio", NA, "Backend supplied only"],
  ];
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 [&_[data-testid=kpistat-value]]:break-words [&_[data-testid=kpistat-value]]:text-xl" data-testid="demo-kpis">
      {cards.map(([label, val, sub], index) => (
        <KpiStat key={label} label={label} value={val} sub={sub}
          badge={index === 0 ? <DataQualityBadge status="Analytics Ready" /> : undefined}
          testid={{
            "Total Lives": "demo-kpi-members",
            "Senior Share": "demo-kpi-senior",
            "Average Age": "demo-kpi-avgage",
            "Dependent Ratio": "demo-kpi-depratio",
            "Female Ratio": "demo-kpi-female",
          }[label]} />
      ))}
    </div>
  );
}

function DetailGrid({ v }: { v: any }) {
  const rows = [
    ["Members without age", num(v.missing_age), "Excluded from age metrics"],
    ["Members without gender", num(v.missing_gender), "Excluded from gender distribution"],
    ["Parent risk score", NA, "Backend supplied only"],
    ["Aging risk score", NA, "Backend supplied only"],
  ];
  return (
    <Card className="p-4">
      <div data-testid="demo-risk-summary">
        <div className="text-sm font-semibold text-ink">Demographic Risk Summary</div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {rows.map(([label, val, sub]) => (
            <div key={label} className="rounded-lg border border-line px-3 py-2">
              <div className="text-xs text-muted">{label}</div>
              <div className="mt-1 text-lg font-semibold text-ink">{val}</div>
              <div className="mt-1 text-[11px] text-muted">{sub}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function ActionRail({ v }: { v: any }) {
  const alerts = [
    `Missing age records: ${num(v.missing_age)}`,
    `Missing gender records: ${num(v.missing_gender)}`,
    `Senior share: ${share(v.senior_share)}`,
  ];
  const opportunities = [
    "Improve demographic source completeness",
    "Use age band mix in renewal discussion",
    "Route SI adequacy questions to SI Utilization",
  ];
  const actions = [
    "Review member age completeness",
    "Check relationship mix against policy definition",
    "Open Employee & Family for relationship consumption",
  ];
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3" data-testid="demo-action-rail">
      <Card className="p-4">
        <div data-testid="demo-alerts">
          <div className="text-sm font-semibold text-ink">Alerts</div>
          <div className="mt-3 space-y-2">
            {alerts.map((item) => <div key={item} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-bad">{item}</div>)}
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div data-testid="demo-opportunities">
          <div className="text-sm font-semibold text-ink">Opportunities</div>
          <div className="mt-3 space-y-2">
            {opportunities.map((item) => <div key={item} className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-good">{item}</div>)}
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div data-testid="demo-action-center">
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
      <div data-testid="demo-evidence-footer" className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-ink">Evidence & Caveats</div>
          <div className="mt-1 text-xs text-muted">
            Demographics uses member_master aggregates only. Unsupported health score, geography, parent risk and trend fields show as {NA}.
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

export function Demographics() {
  const [ev, setEv] = useState(false);
  const demo = useQuery({ queryKey: ["m", "demographics"], queryFn: () => api.metric("demographics") });

  if (demo.isLoading) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv(true)} /><Skeleton rows={4} /></div>;
  if (demo.isError) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv(true)} /><ErrorState onRetry={() => demo.refetch()} /></div>;
  const d = demo.data;
  const status = d?.data_quality_status || "No Data";
  if (status === "No Data") return <div className="space-y-5"><TopContextBar status={status} onEvidence={() => setEv(true)} /><EmptyState message="No activated member data for this tenant yet. Complete Data Onboarding to populate the Demographics dashboard." /></div>;

  const v = d.value || {};
  const ageBars = (v.age_bands || []).map((b: any, i: number) => ({ label: b.band, value: b.count, color: SERIES[i % SERIES.length] }));
  const gender = v.gender_distribution;
  const genderData = (gender || []).map((g: any, i: number) => ({ label: String(g.key), value: g.count, color: SERIES[i % SERIES.length] }));
  const relData = (v.relationship_distribution || []).slice(0, 8).map((r: any, i: number) => ({ label: String(r.key), value: r.count, color: SERIES[i % SERIES.length] }));

  return (
    <div className="space-y-5" data-testid="demo-master-screen">
      <TopContextBar status={status} onEvidence={() => setEv(true)} />
      <RestrictedBanner blocked={d.advisory_blocked} />
      <CaveatBanner caveats={d.caveats} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr,1fr]">
        <PopulationSnapshot v={v} />
        <InsightSummary status={status} v={v} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr,0.9fr,0.9fr]">
        <ChartFrame title="Age Distribution" subtitle="Members by governed age band" status={status}
          evidence={d} evidenceTitle="Demographics evidence" testid="demo-age"
          empty={ageBars.every((b: any) => !b.value)} emptyMessage="No member ages in scope.">
          <BarH data={ageBars} format={(x) => num(x)} />
        </ChartFrame>

        <ChartFrame title="Relationship Mix" subtitle="Members by relationship" status={status}
          evidence={d} evidenceTitle="Demographics evidence" testid="demo-relationship"
          empty={relData.length === 0} emptyMessage="No relationship data in scope.">
          <Donut data={relData} centerValue={num(v.member_count)} centerLabel="members" />
        </ChartFrame>

        <ChartFrame title="Gender Mix" subtitle="Members by governed gender" status={status}
          evidence={d} evidenceTitle="Demographics evidence" testid="demo-gender"
          empty={!gender || genderData.length === 0} emptyTitle={NA}
          emptyMessage="Gender is not captured for members in scope.">
          <Donut data={genderData} centerValue={num(v.member_count)} centerLabel="members" />
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr,1fr,1fr]">
        <DetailGrid v={v} />
        <UnsupportedPanel title="Family Composition" items={["Average family size", "Families with parents", "Two-member families"]} testid="demo-family-composition" />
        <UnsupportedPanel title="Geography Snapshot" items={["Top states", "Top cities", "Concentration alert"]} testid="demo-geography-unsupported" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <UnsupportedPanel title="Demographic Health Score" items={["Health score", "Aging risk score", "Parent risk score"]} testid="demo-health-score-unsupported" />
        <UnsupportedPanel title="Trend Analysis" items={["Age trend", "Gender trend", "Family trend"]} testid="demo-trend-unsupported" />
        <UnsupportedPanel title="Wellness Linkage" items={["Wellness recommendation", "Preventive program value", "Risk cohort score"]} testid="demo-wellness-unsupported" />
      </div>

      <ActionRail v={v} />

      <FourQuestions
        soWhat={`${num(v.member_count)} members; ${share(v.senior_share)} are seniors using age ${num(v.senior_definition_age)} and above; dependent ratio ${v.dependent_ratio != null ? value(v.dependent_ratio) : NA}.`}
        why="Age bands, senior share, average age and employee/dependent split are backend values from member.age and relationship. No DOB inference or browser KPI math is used."
        next="Use age profile and relationship mix to guide renewal discussion, then open Employee & Family and SI Utilization for consumption and exposure follow-through."
        trust={`Governed on ${status} data. Missing age and gender are caveated, and unsupported risk/geography/wellness fields show ${NA}.`} />

      <EvidenceFooter status={status} evidence={d} onEvidence={() => setEv(true)} />
      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="Demographics evidence" evidence={ev ? d : null} />
    </div>
  );
}
