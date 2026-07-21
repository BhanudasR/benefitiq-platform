import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtShare } from "../lib/format";
import {
  SectionHeader, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { ChartFrame, KpiStat, Donut, StackedBar, Sparkline, SERIES } from "../components/ui/charts";

/** Claims dashboard — governed, chart-led (Sprint 19). Every figure is from /metrics/claims,
 *  /metrics/trends and /metrics/large-claims; no browser-side arithmetic. */
export function Claims() {
  const claims = useQuery({ queryKey: ["m", "claims"], queryFn: () => api.metric("claims") });
  const trends = useQuery({ queryKey: ["m", "trends"], queryFn: () => api.metric("trends") });
  const large = useQuery({ queryKey: ["m", "large-claims"], queryFn: () => api.metric("large-claims") });

  if (claims.isLoading) return <><SectionHeader title="Claims" subtitle="Governed claims analytics" /><Skeleton rows={4} /></>;
  if (claims.isError) return <><SectionHeader title="Claims" /><ErrorState onRetry={() => claims.refetch()} /></>;
  const cl = claims.data;
  const status = cl?.data_quality_status || "No Data";
  if (status === "No Data") return <><SectionHeader title="Claims" /><EmptyState message="No activated claims data for this tenant yet. Complete Data Onboarding to populate the Claims dashboard." /></>;

  const v = cl.value || {};
  const series = (trends.data?.value?.series) || [];
  const incurredTrend = series.map((s: any) => s.incurred).filter((x: any) => typeof x === "number");
  const statusSplit = v.status_split || {};
  const mix = Object.keys(statusSplit).map((k, i) => ({ label: k, value: statusSplit[k], color: SERIES[i % SERIES.length] }));
  const lv = large.data?.value || {};

  return (
    <div className="space-y-5">
      <SectionHeader title="Claims" subtitle="Governed, API-driven claims analytics" right={<DataQualityBadge status={status} />} />
      <RestrictedBanner blocked={cl.advisory_blocked} />
      <CaveatBanner caveats={cl.caveats} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="claims-kpis">
        <KpiStat label="Incurred" value={fmtCurrency(v.incurred)} sub="Paid + outstanding" badge={<DataQualityBadge status={status} />} testid="claims-kpi-incurred" />
        <KpiStat label="Claim Count" value={fmtNumber(v.claim_count)} sub={`${fmtNumber(v.open_claims)} open · ${fmtNumber(v.closed_claims)} closed`} testid="claims-kpi-count" />
        <KpiStat label="Average Claim" value={fmtCurrency(v.average_claim_size)} sub="Incurred ÷ count (governed)" testid="claims-kpi-avg" />
        <KpiStat label="Large Claims" value={fmtNumber(lv.large_claim_count)} sub={lv.large_claim_incurred_share != null ? `${fmtShare(lv.large_claim_incurred_share)} of incurred` : "indicator"} testid="claims-kpi-large" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartFrame title="Paid vs Outstanding" subtitle="Governed split of incurred" status={status}
          evidence={cl} evidenceTitle="Claims evidence" testid="claims-paid-outstanding"
          empty={typeof v.incurred !== "number"} emptyMessage="No claim amounts in scope.">
          <StackedBar rows={[{ label: "Incurred", segments: [
            { label: "Paid", value: v.paid, color: "#2563EB" },
            { label: "Outstanding", value: v.outstanding, color: "#D97706" }] }]}
            format={(x) => fmtCurrency(x)} />
        </ChartFrame>

        <ChartFrame title="Cashless vs Reimbursement" subtitle="Claim type split (where provided)" status={status}
          evidence={cl} evidenceTitle="Claims evidence" testid="claims-type"
          empty={!v.cashless_count && !v.reimbursement_count} emptyMessage="Claim-type split not available in scope.">
          <Donut data={[
            { label: "Cashless", value: v.cashless_count, color: "#16A34A" },
            { label: "Reimbursement", value: v.reimbursement_count, color: "#7C3AED" }]}
            centerValue={fmtNumber(v.claim_count)} centerLabel="claims" />
        </ChartFrame>

        <ChartFrame title="Claim status mix" subtitle="Governed status split" status={status}
          evidence={cl} evidenceTitle="Claims evidence" testid="claims-status"
          empty={mix.length === 0} emptyMessage="No claim status data.">
          <Donut data={mix} centerValue={fmtNumber(v.claim_count)} centerLabel="claims" />
        </ChartFrame>
      </div>

      <ChartFrame title="Incurred trend" subtitle="Per policy year (governed multi-year series)" status={trends.data?.data_quality_status}
        caveats={trends.data?.caveats} evidence={trends.data} evidenceTitle="Trend evidence" testid="claims-trend"
        empty={incurredTrend.length < 2} emptyMessage="At least two policy years are needed for a trend.">
        <div className="flex items-center gap-6">
          <Sparkline values={incurredTrend} width={280} height={60} />
          <div className="text-xs text-muted">{series.map((s: any) => (
            <div key={s.policy_year} className="flex gap-2"><span className="text-ink tabular-nums">{s.policy_year}</span>
              <span>{fmtCurrency(s.incurred)}</span></div>))}</div>
        </div>
      </ChartFrame>

      <FourQuestions
        soWhat={`Incurred ${fmtCurrency(v.incurred)} across ${fmtNumber(v.claim_count)} claims; ${fmtNumber(lv.large_claim_count)} large claims.`}
        why="Paid, outstanding, counts, average and large-claim flags are all governed API values — nothing is computed in the browser."
        next="Review the large-claim indicator and the status mix; open evidence for the reconciling source trail."
        trust={`Governed on ${status} data. Large-claim threshold and formula are shown in evidence; paid + outstanding = incurred.`} />
    </div>
  );
}
