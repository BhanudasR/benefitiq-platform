import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtPercent, fmtValue } from "../lib/format";
import {
  Card, DataQualityBadge, CaveatBanner, RestrictedBanner, Skeleton, EmptyState,
  ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { EvidenceDrawer } from "../components/ui/sandbox";
import {
  BarH, BarV, ChartFrame, Donut, Gauge, KpiStat, SERIES, Sparkline,
} from "../components/ui/charts";

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

function pct(v: number | null | undefined): string {
  return clean(fmtPercent(v));
}

function text(v: unknown): string {
  const rendered = fmtValue(v);
  return clean(rendered);
}

function TopContextBar({ status, onEvidence }: { status: string; onEvidence: () => void }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between" data-testid="exec-top-context">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Executive Summary</h1>
          <button className="text-xs font-semibold text-brand border border-line rounded-full px-2 py-0.5"
            onClick={onEvidence}>Evidence</button>
        </div>
        <p className="text-sm text-muted mt-1">360 snapshot of portfolio performance, risk and next actions</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-xl2 border border-line bg-card px-4 py-2 text-xs">
          <span className="text-muted">Last refresh: </span><span className="font-semibold text-ink">{NA}</span>
        </div>
        <div className="rounded-xl2 border border-line bg-card px-4 py-2">
          <div className="text-[11px] text-muted">Data Quality Score</div>
          <div className="flex items-center gap-2"><DataQualityBadge status={status} /></div>
        </div>
        <button className="rounded-xl2 bg-brand px-4 py-2 text-sm font-semibold text-white">Export</button>
      </div>
    </div>
  );
}

function InfoTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0 border-l border-line pl-4 first:border-l-0 first:pl-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

function PortfolioSnapshot({ portfolio, icr }: { portfolio: any; icr: any }) {
  const v = portfolio?.value || {};
  const iv = icr?.value || {};
  return (
    <Card className="p-5" >
      <div data-testid="exec-portfolio-snapshot" className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(220px,1.35fr),2fr]">
        <div className="flex gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brandSoft text-2xl font-black text-brand">BIQ</div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-brand">Portfolio Snapshot</div>
            <h2 className="mt-1 text-lg font-semibold text-ink">{text(v.client_name ?? v.client_id ?? "Selected Client")}</h2>
            <p className="mt-1 text-xs text-muted">Group medical insurance portfolio summary</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <InfoTile label="Policy No." value={text(v.policy_number)} sub={`Insurer: ${text(v.insurer_name ?? v.insurer_code)}`} />
          <InfoTile label="Policy Period" value={text(v.policy_period)} sub={`TPA: ${text(v.tpa_name ?? v.tpa_code)}`} />
          <InfoTile label="Annual Premium" value={money(v.total_premium ?? v.premium ?? iv.earned_premium)} sub={`Basis: ${text(v.premium_basis ?? icr?.premium_basis)}`} />
          <InfoTile label="Covered Lives" value={num(v.lives_covered ?? v.lives)} sub={`${num(v.employee_count)} employees`} />
          <InfoTile label="Average Age" value={v.average_age != null ? `${num(v.average_age)} Years` : NA} />
          <InfoTile label="Sum Insured" value={money(v.sum_insured)} />
          <InfoTile label="Renewal Due" value={text(v.renewal_due ?? v.days_to_renewal)} />
          <InfoTile label="Policy Status" value={text(v.policy_status)} />
        </div>
      </div>
    </Card>
  );
}

function ExecutiveAiPanel({ status, icr, renewal, nba }: { status: string; icr: any; renewal: any; nba: any }) {
  const iv = icr?.value || {};
  return (
    <Card className="p-4 border-l-4 border-l-brand">
      <div data-testid="exec-ai-summary">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl2 bg-brandSoft text-sm font-black text-brand">AI</div>
          <div>
            <div className="text-sm font-semibold text-ink">Executive AI Summary</div>
            <p className="mt-1 text-sm leading-6 text-ink/80">
              Portfolio status is {text(status)} with operational ICR at {pct(iv.operational_icr)}.
              Renewal stance and next action are shown only when returned by governed recommendation APIs.
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Renewal stance</div>
            <div className="mt-1 font-semibold text-ink">{text(renewal?.recommendation)}</div>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Readiness</div>
            <div className="mt-1 font-semibold text-ink">{text(renewal?.renewal_readiness_score ?? renewal?.readiness_score)}</div>
          </div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
            <div className="text-muted">Next action</div>
            <div className="mt-1 font-semibold text-ink">{text(nba?.recommended_next_action ?? nba?.action ?? nba?.recommendation)}</div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function RiskCenter({ renewal, large, dq }: { renewal: any; large: any; dq: any }) {
  const risks = [
    text(renewal?.recommendation ? `Renewal stance: ${renewal.recommendation}` : undefined),
    text(large?.value?.large_claim_count != null ? `Large claims: ${num(large.value.large_claim_count)}` : undefined),
    text(dq?.value?.gating_reason),
  ].filter((item) => item !== NA);
  return (
    <Card className="p-4">
      <div data-testid="exec-risk-center">
        <div className="text-sm font-semibold text-ink">Risk Center</div>
        <div className="mt-3 space-y-2">
          {risks.length ? risks.map((r, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-sm">
              <span className="mt-1 h-2 w-2 rounded-full bg-bad" />
              <span>{r}</span>
            </div>
          )) : <div className="text-sm text-muted">{NA}</div>}
        </div>
      </div>
    </Card>
  );
}

function OpportunityCenter({ wellness, benchmark, simulation }: { wellness: any; benchmark: any; simulation: any }) {
  const opportunities = [
    text(wellness?.summary ?? wellness?.posture),
    benchmark?.features_comparable != null ? `Benchmark comparable features: ${num(benchmark.features_comparable)}` : NA,
    simulation?.value?.portfolio_saving != null ? `Potential savings: ${money(simulation.value.portfolio_saving)}` : NA,
  ].filter((item) => item !== NA);
  return (
    <Card className="p-4">
      <div data-testid="exec-opportunity-center">
        <div className="text-sm font-semibold text-ink">Opportunity Center</div>
        <div className="mt-3 space-y-2">
          {opportunities.length ? opportunities.map((o, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-good">
              <span className="mt-1 h-2 w-2 rounded-full bg-good" />
              <span>{o}</span>
            </div>
          )) : <div className="text-sm text-muted">{NA}</div>}
        </div>
      </div>
    </Card>
  );
}

function ActionCenter({ nba, renewal }: { nba: any; renewal: any }) {
  const actions = [
    text(nba?.recommended_next_action ?? nba?.action ?? nba?.recommendation),
    text(renewal?.recommended_next_action ?? renewal?.next_best_action),
    text(renewal?.recommendation ? `Prepare ${renewal.recommendation} renewal story` : undefined),
  ].filter((item) => item !== NA);
  return (
    <Card className="p-4">
      <div data-testid="exec-action-center">
        <div className="text-sm font-semibold text-ink">Next Best Action</div>
        <div className="mt-3 space-y-2">
          {actions.length ? actions.map((a, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand text-xs font-bold text-white">{num(i + 1)}</span>
              <span>{a}</span>
            </div>
          )) : <div className="text-sm text-muted">{NA}</div>}
        </div>
      </div>
    </Card>
  );
}

function NavigationHub() {
  const links = [
    "Claims Intelligence", "Ailment Intelligence", "Settlement Intelligence", "Benefits Intelligence",
    "Benchmarking", "Renewal Intelligence", "Placement Intelligence", "Wellness Intelligence", "Ask BenefitIQ",
  ];
  return (
    <Card className="p-4">
      <div data-testid="exec-navigation-hub">
        <div className="text-sm font-semibold text-ink">Navigation Hub</div>
        <div className="mt-1 text-xs text-muted">Jump to detailed analysis after reviewing the executive surface</div>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-9">
          {links.map((label, index) => (
            <div key={label} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink">
              <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-md bg-brandSoft text-[10px] text-brand">{num(index + 1)}</span>
              {label}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function EvidenceFooter({ status, evidence, onEvidence }: { status: string; evidence: any; onEvidence: () => void }) {
  const sources = evidence?.source_tables || [];
  return (
    <Card className="p-4">
      <div data-testid="exec-evidence-footer" className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-ink">Evidence & Caveats</div>
          <div className="mt-1 text-xs text-muted">
            All critical values are rendered from governed APIs. Missing or unsupported values show as {NA}.
          </div>
          {sources.length > 0 && <div className="mt-2 text-[11px] text-muted">Sources: {sources.join(", ")}</div>}
        </div>
        <div className="flex items-center gap-3">
          <DataQualityBadge status={status} />
          <button onClick={onEvidence} className="text-xs font-semibold text-brand hover:underline">View evidence and formulas</button>
        </div>
      </div>
    </Card>
  );
}

export function ExecutiveSummary() {
  const [ev, setEv] = useState(false);
  const portfolio = useQuery({ queryKey: ["m", "portfolio"], queryFn: () => api.metric("portfolio") });
  const claims = useQuery({ queryKey: ["m", "claims"], queryFn: () => api.metric("claims") });
  const icr = useQuery({ queryKey: ["m", "icr"], queryFn: () => api.metric("icr") });
  const trends = useQuery({ queryKey: ["m", "trends"], queryFn: () => api.metric("trends") });
  const ailment = useQuery({ queryKey: ["m", "ailment"], queryFn: () => api.metric("ailment") });
  const demographics = useQuery({ queryKey: ["m", "demographics"], queryFn: () => api.metric("demographics") });
  const relation = useQuery({ queryKey: ["m", "relation"], queryFn: () => api.metric("relation") });
  const large = useQuery({ queryKey: ["m", "large-claims"], queryFn: () => api.metric("large-claims") });
  const dq = useQuery({ queryKey: ["dq", "overview"], queryFn: () => api.dataQuality("overview") });
  const benchmark = useQuery({ queryKey: ["bm", "overview"], queryFn: () => api.benchmarking("overview") });
  const wellness = useQuery({ queryKey: ["w", "overview"], queryFn: () => api.wellness("overview") });
  const renewal = useQuery({ queryKey: ["reco", "renewal"], queryFn: () => api.recommendation("renewal") });
  const nba = useQuery({ queryKey: ["reco", "next-best-action"], queryFn: () => api.recommendation("next-best-action") });
  const simulation = useQuery({ queryKey: ["s", "scenario"], queryFn: () => api.simulation("scenario") });

  const loading = portfolio.isLoading || claims.isLoading || icr.isLoading;
  const error = portfolio.isError || claims.isError || icr.isError;
  if (loading) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv(true)} /><Skeleton rows={5} /></div>;
  if (error) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv(true)} /><ErrorState onRetry={() => { portfolio.refetch(); claims.refetch(); icr.refetch(); }} /></div>;

  const p = portfolio.data;
  const cl = claims.data;
  const ic = icr.data;
  const status = ic?.data_quality_status || p?.data_quality_status || "No Data";
  if (status === "No Data") {
    return (
      <div className="space-y-5">
        <TopContextBar status={status} onEvidence={() => setEv(true)} />
        <EmptyState message="No activated governed data for this tenant yet. Complete Data Onboarding to populate the Executive Summary." />
      </div>
    );
  }

  const iv = ic?.value || {};
  const pv = p?.value || {};
  const clv = cl?.value || {};
  const dv = demographics.data?.value || {};
  const relv = relation.data?.value || {};
  const series = trends.data?.value?.series || [];
  const icrTrend = series.map((s: any) => s.operational_icr).filter((x: any) => typeof x === "number");
  const driverRows = (ailment.data?.value?.top_ailments || []).slice(0, 6)
    .map((a: any) => ({ label: String(a.key), value: a.incurred }));
  const statusSplit = clv.status_split || {};
  const mix = Object.keys(statusSplit).map((k, i) => ({ label: k, value: statusSplit[k], color: SERIES[i] }));
  const ageRows = (dv.age_bands || dv.age_distribution || []).slice(0, 5)
    .map((a: any) => ({ label: String(a.label ?? a.key ?? a.age_band), value: a.count ?? a.members ?? a.lives }));
  const relationMix = (relv.groups || []).slice(0, 5)
    .map((r: any, i: number) => ({ label: String(r.key), value: r.count ?? r.claim_count ?? r.incurred, color: SERIES[i] }));
  const financialRows = [
    { label: "Premium", value: pv.total_premium ?? pv.premium ?? iv.earned_premium, color: "#2563EB" },
    { label: "Paid", value: clv.paid ?? iv.paid, color: "#16A34A" },
    { label: "Outstanding", value: clv.outstanding ?? iv.outstanding, color: "#D97706" },
    { label: "Incurred", value: iv.incurred ?? clv.incurred, color: "#7C3AED" },
  ];
  const hasFinancial = financialRows.some((r) => typeof r.value === "number");

  return (
    <div className="space-y-5" data-testid="exec-master-screen">
      <TopContextBar status={status} onEvidence={() => setEv(true)} />
      <RestrictedBanner blocked={ic?.advisory_blocked} />
      <CaveatBanner caveats={ic?.caveats} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.55fr,0.95fr]">
        <PortfolioSnapshot portfolio={p} icr={ic} />
        <ExecutiveAiPanel status={status} icr={ic} renewal={renewal.data} nba={nba.data} />
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-6 [&_[data-testid=kpistat-value]]:break-words [&_[data-testid=kpistat-value]]:text-xl" data-testid="exec-kpi-band">
        <KpiStat label="Operational ICR" value={pct(iv.operational_icr)} sub={`Basis: ${text(ic?.premium_basis ?? pv.premium_basis)}`}
          badge={<DataQualityBadge status={status} />} onEvidence={() => setEv(true)} testid="exec-kpi-icr" />
        <KpiStat label="Projected ICR" value={pct(iv.projected_icr ?? renewal.data?.projected_icr)} sub="Backend supplied only" testid="exec-kpi-projected" />
        <KpiStat label="Incidence Ratio" value={pct(clv.incidence_ratio)} sub="Backend supplied only" testid="exec-kpi-incidence" />
        <KpiStat label="Average Claim Size" value={money(clv.average_claim_size)} sub={`${num(clv.claim_count)} claims`} testid="exec-kpi-avg" />
        <KpiStat label="Renewal Readiness" value={text(renewal.data?.renewal_readiness_score ?? renewal.data?.readiness_score)} sub={text(renewal.data?.recommendation)} testid="exec-kpi-readiness" />
        <KpiStat label="Data Quality" value={text(dq.data?.value?.weighted_dq_score ?? status)} sub="Governed trust layer" testid="exec-kpi-dq" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr,1fr,1fr]">
        <ChartFrame title="Financial / ICR Visual" subtitle="Premium, paid, outstanding and incurred from governed APIs"
          status={status} evidence={ic} evidenceTitle="Financial evidence" testid="exec-financial-visual"
          empty={!hasFinancial} emptyMessage="Financial bridge fields are not available from the current backend response.">
          <BarV data={financialRows} format={(v) => money(v)} />
        </ChartFrame>

        <ChartFrame title="Portfolio Health Score" subtitle="Operational ICR gauge; score is backend supplied when available"
          status={status} evidence={ic} evidenceTitle="ICR evidence" testid="exec-icr-gauge"
          empty={typeof iv.operational_icr !== "number"} emptyMessage="Operational ICR is not available.">
          <Gauge value={iv.operational_icr} min={0} max={200} valueText={pct(iv.operational_icr)}
            label="Operational ICR" bands={[{ upTo: 100, color: "#16A34A" }, { upTo: 120, color: "#D97706" }]} />
        </ChartFrame>

        <ChartFrame title="Claims Snapshot" subtitle="Claim status and type signals" status={cl?.data_quality_status}
          caveats={cl?.caveats} evidence={cl} evidenceTitle="Claims evidence" testid="exec-claims-snapshot"
          empty={mix.length === 0} emptyMessage="Claim status split is not available.">
          <Donut data={mix} centerValue={num(clv.claim_count)} centerLabel="claims" />
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartFrame title="Claims Driver Section" subtitle="Top cost drivers by incurred amount" status={ailment.data?.data_quality_status}
          caveats={ailment.data?.caveats} evidence={ailment.data} evidenceTitle="Ailment evidence" testid="exec-drivers"
          empty={driverRows.length === 0} emptyMessage="Top claim drivers are not available.">
          <BarH data={driverRows} format={(v) => money(v)} />
        </ChartFrame>

        <Card className="p-4">
          <div data-testid="exec-population-snapshot">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-semibold text-ink">Population Snapshot</div>
                <div className="text-xs text-muted mt-0.5">Demographic and relation exposure from governed APIs</div>
              </div>
              <DataQualityBadge status={demographics.data?.data_quality_status || relation.data?.data_quality_status || status} />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartFrame title="Age Distribution" status={demographics.data?.data_quality_status}
                empty={ageRows.length === 0} emptyMessage="Age distribution is not available.">
                <BarH data={ageRows} format={(v) => num(v)} />
              </ChartFrame>
              <ChartFrame title="Relation Mix" status={relation.data?.data_quality_status}
                empty={relationMix.length === 0} emptyMessage="Relation mix is not available.">
                <Donut data={relationMix} centerValue={num(pv.lives_covered ?? pv.lives)} centerLabel="lives" />
              </ChartFrame>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <RiskCenter renewal={renewal.data} large={large.data} dq={dq.data} />
        <OpportunityCenter wellness={wellness.data} benchmark={benchmark.data} simulation={simulation.data} />
        <ActionCenter nba={nba.data} renewal={renewal.data} />
      </div>

      <NavigationHub />

      <ChartFrame title="Operational ICR Trend" subtitle="Per policy year; backend values only"
        status={trends.data?.data_quality_status} caveats={trends.data?.caveats} evidence={trends.data}
        evidenceTitle="Trend evidence" testid="exec-trend"
        empty={icrTrend.length < 2} emptyMessage="At least two policy years are needed for a trend.">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <Sparkline values={icrTrend} width={280} height={60} />
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted">
            {series.map((s: any) => (
              <div key={s.policy_year} className="flex gap-2">
                <span className="text-ink tabular-nums">{text(s.policy_year)}</span>
                <span>{pct(s.operational_icr)}</span>
              </div>
            ))}
          </div>
        </div>
      </ChartFrame>

      <FourQuestions
        soWhat={`Portfolio status is ${status}; operational ICR is ${pct(iv.operational_icr)} across ${num(clv.claim_count)} claims.`}
        why="The screen composes governed API values from portfolio, ICR, claims, trends, ailments, demographics, recommendations, wellness, benchmarking and data quality."
        next={text(nba.data?.recommended_next_action ?? renewal.data?.recommended_next_action ?? renewal.data?.recommendation)}
        trust={`No KPI is calculated in the browser. Unsupported backend fields render as ${NA}, and evidence/caveats are available from the footer.`} />

      <EvidenceFooter status={status} evidence={ic} onEvidence={() => setEv(true)} />
      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="Executive Summary evidence" evidence={ev ? ic : null} />
    </div>
  );
}
