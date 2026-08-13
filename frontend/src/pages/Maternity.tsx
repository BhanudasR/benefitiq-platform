import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtValue } from "../lib/format";
import {
  Card, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { ChartFrame, KpiStat, Donut, BarH, SERIES } from "../components/ui/charts";
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
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between" data-testid="mat-top-context">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Maternity Intelligence</h1>
          <button className="rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-brand"
            onClick={onEvidence}>Evidence</button>
        </div>
        <p className="mt-1 text-sm text-muted">Track governed maternity claim identification, delivery split and policy-term context</p>
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
      <div data-testid="mat-insight-summary">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl2 bg-brandSoft text-sm font-black text-brand">AI</div>
          <div>
            <div className="text-sm font-semibold text-ink">Governed Maternity Insight Summary</div>
            <p className="mt-1 text-sm leading-6 text-ink/80">
              Maternity Intelligence uses a conservative diagnosis keyword or ICD-O identification rule.
              Identified maternity claims are {num(v.maternity_claim_count)}, with governed incurred value {money(v.incurred)}.
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Data status</div>
            <div className="mt-1 font-semibold text-ink">{status}</div>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Excluded no diagnosis</div>
            <div className="mt-1 font-semibold text-ink">{num(v.excluded_no_diagnosis)}</div>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Cap adequacy</div>
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
        <div className="mt-1 text-xs text-muted">Reference section retained without unsupported maternity inference</div>
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

function PolicyTermPanel({ v }: { v: any }) {
  return (
    <Card className="p-4">
      <div data-testid="mat-term-panel">
        <div className="text-sm font-semibold text-ink">Maternity Limit and Newborn Cover Terms</div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-line px-3 py-2">
            <div className="text-xs text-muted">Maternity limit term</div>
            <div className="mt-1 text-xl font-semibold text-ink" data-testid="mat-limit">{v.maternity_limit != null ? money(v.maternity_limit) : NA}</div>
            <div className="mt-1 text-[11px] text-muted">Policy term context only, not cap adequacy</div>
          </div>
          <div className="rounded-lg border border-line px-3 py-2">
            <div className="text-xs text-muted">Newborn cover term</div>
            <div className="mt-1 text-xl font-semibold text-ink" data-testid="mat-newborn">{v.newborn_cover != null ? money(v.newborn_cover) : NA}</div>
            <div className="mt-1 text-[11px] text-muted">Benefit term only, not newborn claims</div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function IdentificationPanel({ rule }: { rule: string }) {
  return (
    <Card className="p-4 border-l-4 border-l-brand">
      <div data-testid="mat-rule">
        <div className="text-sm font-semibold text-ink">Identification Basis</div>
        <p className="mt-2 text-sm leading-6 text-ink/80">{rule}</p>
        <div className="mt-3 rounded-lg border border-line bg-slate-50 px-3 py-2 text-xs text-muted">
          Conservative matching only; no clinical interpretation or inference.
        </div>
      </div>
    </Card>
  );
}

function ExcludedPanel({ v }: { v: any }) {
  return (
    <Card className="p-4 border-l-4 border-l-amber-500">
      <div data-testid="mat-excluded-panel">
        <div className="text-sm font-semibold text-ink">Excluded and No Diagnosis Caveat</div>
        <div className="mt-2 text-2xl font-semibold text-ink">{num(v.excluded_no_diagnosis)}</div>
        <div className="mt-1 text-xs text-muted">Claims without diagnosis are excluded from maternity identification, never inferred.</div>
      </div>
    </Card>
  );
}

function ActionRail({ v }: { v: any }) {
  const alerts = [
    `Maternity claims: ${num(v.maternity_claim_count)}`,
    `Excluded no diagnosis: ${num(v.excluded_no_diagnosis)}`,
    `Cap adequacy: ${NA}`,
  ];
  const opportunities = [
    "Review confirmed maternity benefit terms",
    "Request city, hospital and trend fields before provider/package review",
    "Route cap adequacy questions to governed benefit modelling when available",
  ];
  const actions = [
    "Review identification rule and caveats",
    "Confirm maternity limit and newborn cover terms",
    "Prepare governed data request for hospital/city distribution",
  ];
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3" data-testid="mat-action-rail">
      <Card className="p-4">
        <div data-testid="mat-alerts">
          <div className="text-sm font-semibold text-ink">Alerts</div>
          <div className="mt-3 space-y-2">
            {alerts.map((item) => <div key={item} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-bad">{item}</div>)}
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div data-testid="mat-opportunities">
          <div className="text-sm font-semibold text-ink">Opportunities</div>
          <div className="mt-3 space-y-2">
            {opportunities.map((item) => <div key={item} className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-good">{item}</div>)}
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div data-testid="mat-action-center">
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
      <div data-testid="mat-evidence-footer" className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-ink">Evidence & Caveats</div>
          <div className="mt-1 text-xs text-muted">
            Maternity uses conservative diagnosis matching and confirmed benefit terms. Shortfall, cap adequacy, newborn claims, top hospitals, city distribution, trends and package value show as {NA}.
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

export function Maternity() {
  const [ev, setEv] = useState(false);
  const mat = useQuery({ queryKey: ["m", "maternity"], queryFn: () => api.metric("maternity") });

  if (mat.isLoading) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv(true)} /><Skeleton rows={4} /></div>;
  if (mat.isError) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv(true)} /><ErrorState onRetry={() => mat.refetch()} /></div>;
  const d = mat.data;
  const status = d?.data_quality_status || "No Data";
  if (status === "No Data") return <div className="space-y-5"><TopContextBar status={status} onEvidence={() => setEv(true)} /><EmptyState message="No activated claims data for this tenant yet. Complete Data Onboarding to populate the Maternity dashboard." /></div>;

  const v = d.value || {};
  const splitData = v.split_available
    ? [{ label: "Normal delivery", value: v.normal_count, color: "#16A34A" }, { label: "C-section", value: v.csection_count, color: "#7C3AED" }]
    : [];
  const splitBars = v.split_available
    ? [{ label: "Normal delivery", value: v.normal_count, color: "#16A34A" }, { label: "C-section", value: v.csection_count, color: "#7C3AED" }]
    : [];

  return (
    <div className="space-y-5" data-testid="mat-master-screen">
      <TopContextBar status={status} onEvidence={() => setEv(true)} />
      <RestrictedBanner blocked={d.advisory_blocked} />
      <CaveatBanner caveats={d.caveats} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr,1fr]">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 [&_[data-testid=kpistat-value]]:break-words [&_[data-testid=kpistat-value]]:text-xl" data-testid="mat-kpis">
          <KpiStat label="Maternity Claims" value={num(v.maternity_claim_count)} sub={`of ${num(v.total_claims_in_scope)} claims in scope`} badge={<DataQualityBadge status={status} />} testid="mat-kpi-count" />
          <KpiStat label="Maternity Incurred" value={money(v.incurred)} sub="Paid plus outstanding" testid="mat-kpi-incurred" />
          <KpiStat label="Average Maternity Cost" value={v.average_claim_size != null ? money(v.average_claim_size) : NA} sub="Backend supplied" testid="mat-kpi-avg" />
          <KpiStat label="Normal Delivery Count" value={v.split_available ? num(v.normal_count) : NA} sub="When distinguishable" testid="mat-kpi-normal" />
          <KpiStat label="C-section Count" value={v.split_available ? num(v.csection_count) : NA} sub="When distinguishable" testid="mat-kpi-csection" />
          <KpiStat label="Maternity Limit Term" value={v.maternity_limit != null ? money(v.maternity_limit) : NA} sub="Policy term context" testid="mat-kpi-limit-term" />
          <KpiStat label="Newborn Cover Term" value={v.newborn_cover != null ? money(v.newborn_cover) : NA} sub="Benefit term, not claims" testid="mat-kpi-newborn-term" />
          <KpiStat label="Excluded No Diagnosis" value={num(v.excluded_no_diagnosis)} sub="Never inferred" testid="mat-kpi-excluded" />
          <KpiStat label="Limit Utilization" value={NA} sub="Backend supplied only" testid="mat-kpi-limit-util" />
          <KpiStat label="Shortfall" value={NA} sub="Backend supplied only" testid="mat-kpi-shortfall" />
          <KpiStat label="Cap Adequacy" value={NA} sub="Backend supplied only" testid="mat-kpi-cap-adequacy" />
          <KpiStat label="Newborn Claims" value={NA} sub="Backend supplied only" testid="mat-kpi-newborn-claims" />
        </div>
        <InsightSummary status={status} v={v} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr,1fr,1fr]">
        <ChartFrame title="Delivery Type Split" subtitle="Only where clearly distinguishable" status={status}
          evidence={d} evidenceTitle="Maternity evidence" testid="mat-split"
          empty={!v.split_available || splitData.length === 0} emptyTitle={NA}
          emptyMessage="Normal vs C-section is not clearly distinguishable in the diagnosis data.">
          <Donut data={splitData} centerValue={num(v.maternity_claim_count)} centerLabel="maternity" />
        </ChartFrame>

        <ChartFrame title="Normal vs C-section Counts" subtitle="Governed split where available" status={status}
          evidence={d} evidenceTitle="Maternity evidence" testid="mat-split-bars"
          empty={!v.split_available || splitBars.length === 0} emptyTitle={NA}
          emptyMessage="Delivery type split is not available in scope.">
          <BarH data={splitBars} format={(x) => num(x)} />
        </ChartFrame>

        <PolicyTermPanel v={v} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <IdentificationPanel rule={String(v.identification_rule || "")} />
        <ExcludedPanel v={v} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <UnsupportedPanel title="Cap Adequacy & Shortfall" items={["Cap adequacy", "Shortfall", "Claims above cap"]} testid="mat-cap-unsupported" />
        <UnsupportedPanel title="Top Maternity Hospitals" items={["Top hospitals", "Hospital incurred", "Package negotiation value"]} testid="mat-hospital-unsupported" />
        <UnsupportedPanel title="City / Hospital Distribution" items={["City distribution", "Hospital distribution", "Provider comparison"]} testid="mat-city-unsupported" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <UnsupportedPanel title="Maternity Cost Trend" items={["Monthly trend", "Year-on-year movement", "Cost trend"]} testid="mat-trend-unsupported" />
        <UnsupportedPanel title="Utilization by Relation / Age" items={["Relation utilization", "Age band utilization", "Cohort view"]} testid="mat-relation-age-unsupported" />
        <UnsupportedPanel title="Newborn Claim Impact" items={["Newborn claims", "NICU impact", "Newborn incurred"]} testid="mat-newborn-impact-unsupported" />
      </div>

      <ActionRail v={v} />

      <FourQuestions
        soWhat={`${num(v.maternity_claim_count)} maternity claim(s) were identified; incurred value is ${money(v.incurred)}.`}
        why="Maternity is identified by a conservative governed diagnosis rule. Limits and newborn cover are benefit terms, not cap adequacy or newborn claim impact."
        next="Review confirmed benefit terms and request hospital, city, trend and cap fields before any package or adequacy analysis."
        trust={`Governed on ${status} data. This dashboard avoids clinical interpretation; unsupported shortfall, cap adequacy, newborn claims and hospital distribution remain ${NA}.`} />

      <EvidenceFooter status={status} evidence={d} onEvidence={() => setEv(true)} />
      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="Maternity evidence" evidence={ev ? d : null} />
    </div>
  );
}
