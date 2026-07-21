import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtPercent } from "../lib/format";
import {
  SectionHeader, Card, DecisionSummary, DataQualityBadge,
  CaveatBanner, RestrictedBanner, Skeleton, EmptyState, ErrorState,
} from "../components/ui/primitives";
import { EvidenceDrawer } from "../components/ui/sandbox";
import { ChartFrame, KpiStat, Gauge, Donut, BarH, Sparkline, SERIES } from "../components/ui/charts";

/** Executive Summary — premium CXO dashboard (Sprint 19). Every value comes from the governed
 *  metric / simulation / module-overview APIs; the page performs NO arithmetic — it projects and
 *  formats API values and hands them to the SVG chart kit (which owns pixel geometry only). */
export function ExecutiveSummary() {
  const [ev, setEv] = useState(false);
  const portfolio = useQuery({ queryKey: ["m", "portfolio"], queryFn: () => api.metric("portfolio") });
  const claims = useQuery({ queryKey: ["m", "claims"], queryFn: () => api.metric("claims") });
  const icr = useQuery({ queryKey: ["m", "icr"], queryFn: () => api.metric("icr") });
  const trends = useQuery({ queryKey: ["m", "trends"], queryFn: () => api.metric("trends") });
  const ailment = useQuery({ queryKey: ["m", "ailment"], queryFn: () => api.metric("ailment") });
  // governed cross-module summary widgets (rendered defensively; "—" until available)
  const bench = useQuery({ queryKey: ["bm", "overview"], queryFn: () => api.benchmarking("overview") });
  const place = useQuery({ queryKey: ["pl", "overview"], queryFn: () => api.placement("overview") });
  const well = useQuery({ queryKey: ["w", "overview"], queryFn: () => api.wellness("overview") });
  const renew = useQuery({ queryKey: ["reco", "renewal"], queryFn: () => api.recommendation("renewal") });

  const loading = portfolio.isLoading || claims.isLoading || icr.isLoading;
  const error = portfolio.isError || claims.isError || icr.isError;
  if (loading) return <><SectionHeader title="Executive Summary" subtitle="Portfolio decision intelligence" /><Skeleton rows={4} /></>;
  if (error) return <><SectionHeader title="Executive Summary" /><ErrorState onRetry={() => { portfolio.refetch(); claims.refetch(); icr.refetch(); }} /></>;

  const p = portfolio.data, cl = claims.data, ic = icr.data;
  const status = ic?.data_quality_status || "No Data";
  if (status === "No Data") return <><SectionHeader title="Executive Summary" /><EmptyState message="No activated governed data for this tenant yet. Complete Data Onboarding to populate the Executive Summary." /></>;

  const iv = ic.value || {}, pv = (p?.value) || {}, clv = (cl?.value) || {};
  const series = (trends.data?.value?.series) || [];
  const icrTrend = series.map((s: any) => s.operational_icr).filter((x: any) => typeof x === "number");
  const drivers = ((ailment.data?.value?.top_ailments) || []).slice(0, 6)
    .map((a: any) => ({ label: String(a.key), value: a.incurred }));
  const statusSplit = clv.status_split || {};
  const mix = Object.keys(statusSplit).map((k, i) => ({ label: k, value: statusSplit[k], color: SERIES[i % SERIES.length] }));

  const points = [
    `Operational ICR is ${fmtPercent(iv.operational_icr)} on ${ic.premium_basis || "written"} premium basis.`,
    `Incurred claims ${fmtCurrency(iv.incurred)} against premium ${fmtCurrency(iv.earned_premium)}.`,
    `${fmtNumber(clv.claim_count)} claims across ${fmtNumber(pv.lives_covered)} lives covered.`,
  ];

  const Widget = ({ label, value, sub, q, to }: { label: string; value: React.ReactNode; sub?: string; q: any; to?: string }) => (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="text-lg font-semibold text-ink mt-1">{q?.isLoading ? "…" : (value ?? "—")}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </Card>
  );

  return (
    <div className="space-y-5">
      <SectionHeader title="Executive Summary" subtitle="Governed, API-driven portfolio intelligence"
        right={<DataQualityBadge status={status} />} />
      <RestrictedBanner blocked={ic.advisory_blocked} />
      <CaveatBanner caveats={ic.caveats} />

      {/* Hero KPI band */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="exec-kpi-band">
        <KpiStat label="Total Premium" value={fmtCurrency(pv.total_premium)} sub={`Basis: ${pv.premium_basis || "written"}`}
          badge={<DataQualityBadge status={status} />} testid="exec-kpi-premium" />
        <KpiStat label="Operational ICR" value={fmtPercent(iv.operational_icr)} sub="Incurred ÷ premium"
          trend={icrTrend} onEvidence={() => setEv(true)} testid="exec-kpi-icr" />
        <KpiStat label="Incurred Claims" value={fmtCurrency(iv.incurred)} sub="Paid + outstanding" testid="exec-kpi-incurred" />
        <KpiStat label="Lives Covered" value={fmtNumber(pv.lives_covered)} sub={`${fmtNumber(pv.employee_count)} employees`} testid="exec-kpi-lives" />
      </div>

      <DecisionSummary title={`Portfolio is ${status}`} points={points} />

      {/* Visual row: ICR gauge · claim-driver bar · claim mix donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartFrame title="Renewal health — Operational ICR" subtitle="Operational ICR is unchanged; scale 0–200%"
          status={status} caveats={ic.caveats} evidence={ic} evidenceTitle="ICR evidence" testid="exec-icr-gauge"
          empty={typeof iv.operational_icr !== "number"} emptyMessage="Operational ICR not available yet.">
          <Gauge value={iv.operational_icr} min={0} max={200} valueText={fmtPercent(iv.operational_icr)}
            label="Operational ICR" bands={[{ upTo: 100, color: "#16A34A" }, { upTo: 120, color: "#D97706" }]} />
        </ChartFrame>

        <ChartFrame title="Top claim drivers" subtitle="Incurred by ailment (governed)" status={ailment.data?.data_quality_status}
          caveats={ailment.data?.caveats} evidence={ailment.data} evidenceTitle="Ailment evidence" testid="exec-drivers"
          empty={drivers.length === 0} emptyMessage="No ailment data in scope yet.">
          <BarH data={drivers} format={(v) => fmtCurrency(v)} />
        </ChartFrame>

        <ChartFrame title="Claim status mix" subtitle="Governed claim status split" status={cl?.data_quality_status}
          caveats={cl?.caveats} evidence={cl} evidenceTitle="Claims evidence" testid="exec-mix"
          empty={mix.length === 0} emptyMessage="No claims in scope yet.">
          <Donut data={mix} centerValue={fmtNumber(clv.claim_count)} centerLabel="claims" />
        </ChartFrame>
      </div>

      {/* ICR trend */}
      <ChartFrame title="Operational ICR trend" subtitle="Per policy year (governed multi-year series)" status={trends.data?.data_quality_status}
        caveats={trends.data?.caveats} evidence={trends.data} evidenceTitle="Trend evidence" testid="exec-trend"
        empty={icrTrend.length < 2} emptyMessage="At least two policy years are needed for a trend.">
        <div className="flex items-center gap-6">
          <Sparkline values={icrTrend} width={280} height={60} />
          <div className="text-xs text-muted">
            {series.map((s: any) => (
              <div key={s.policy_year} className="flex gap-2"><span className="text-ink tabular-nums">{s.policy_year}</span>
                <span>{fmtPercent(s.operational_icr)}</span></div>
            ))}
          </div>
        </div>
      </ChartFrame>

      {/* Governed cross-module summary widgets */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="exec-widgets">
        <Widget label="Renewal recommendation" q={renew}
          value={renew.data ? String(renew.data.recommendation ?? "—") : "—"}
          sub={renew.data ? `Confidence ${String(renew.data.confidence ?? "—")}` : undefined} />
        <Widget label="Placement state" q={place}
          value={place.data ? String(place.data.placement_state ?? "—") : "—"}
          sub={place.data ? `Defence ${String(place.data.incumbent_defence_score ?? "—")}` : undefined} />
        <Widget label="Benchmark (comparable)" q={bench}
          value={bench.data ? `${fmtNumber(bench.data.features_comparable)} / ${fmtNumber(bench.data.features_total)}` : "—"}
          sub={bench.data ? `${fmtNumber(bench.data.peer_count)} peers` : undefined} />
        <Widget label="Wellness posture" q={well}
          value={well.data ? String(well.data.posture ?? well.data.summary ?? "—") : "—"} />
      </div>

      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="ICR evidence" evidence={ev ? ic : null} />
    </div>
  );
}
