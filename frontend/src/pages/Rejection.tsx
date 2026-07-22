import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtShare } from "../lib/format";
import {
  SectionHeader, Card, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { ChartFrame, KpiStat, Donut, Gauge, SERIES } from "../components/ui/charts";

/** Rejection dashboard — governed, chart-led (Sprint 22). Figures from /metrics/rejection.
 *  Rejection = claim_status 'Repudiated' only. Top reasons and wrongful-rejection are governed
 *  "Not available" (no reason / reprocessing field on the canonical claim). No browser math. */
export function Rejection() {
  const rej = useQuery({ queryKey: ["m", "rejection"], queryFn: () => api.metric("rejection") });

  if (rej.isLoading) return <><SectionHeader title="Rejection" subtitle="Governed rejection analytics" /><Skeleton rows={4} /></>;
  if (rej.isError) return <><SectionHeader title="Rejection" /><ErrorState onRetry={() => rej.refetch()} /></>;
  const d = rej.data;
  const status = d?.data_quality_status || "No Data";
  if (status === "No Data") return <><SectionHeader title="Rejection" /><EmptyState message="No activated claims data for this tenant yet. Complete Data Onboarding to populate the Rejection dashboard." /></>;

  const v = d.value || {};
  const byType = (v.by_claim_type || []).map((t: any, i: number) => ({ label: String(t.key), value: t.count, color: SERIES[i % SERIES.length] }));

  return (
    <div className="space-y-5">
      <SectionHeader title="Rejection" subtitle="Governed, API-driven rejection analytics (Repudiated only)" right={<DataQualityBadge status={status} />} />
      <RestrictedBanner blocked={d.advisory_blocked} />
      <CaveatBanner caveats={d.caveats} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="rej-kpis">
        <KpiStat label="Rejections" value={fmtNumber(v.rejection_count)} sub={`of ${fmtNumber(v.total_claims)} claims`} badge={<DataQualityBadge status={status} />} testid="rej-kpi-count" />
        <KpiStat label="Rejection ratio" value={v.rejection_ratio != null ? fmtShare(v.rejection_ratio) : "—"} sub="Repudiated ÷ total" testid="rej-kpi-ratio" />
        <KpiStat label="Rejected amount" value={v.rejection_amount != null ? fmtCurrency(v.rejection_amount) : "Not available"} sub="Claimed amount of repudiated" testid="rej-kpi-amount" />
        <KpiStat label="Status basis" value="Repudiated" sub="Governed claim status only" testid="rej-kpi-basis" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartFrame title="Rejection ratio" subtitle="Repudiated share of claims" status={status}
          evidence={d} evidenceTitle="Rejection evidence" testid="rej-gauge"
          empty={v.rejection_ratio == null} emptyMessage="No claims in scope.">
          <Gauge value={v.rejection_ratio} min={0} max={1}
            valueText={v.rejection_ratio != null ? fmtShare(v.rejection_ratio) : "—"} label="Rejection ratio"
            bands={[{ upTo: 0.05, color: "#16A34A" }, { upTo: 0.15, color: "#D97706" }]} />
        </ChartFrame>

        <ChartFrame title="Rejections by claim type" subtitle="Cashless vs reimbursement (governed)" status={status}
          evidence={d} evidenceTitle="Rejection evidence" testid="rej-bytype"
          empty={byType.length === 0} emptyMessage="No rejected claims in scope.">
          <Donut data={byType} centerValue={fmtNumber(v.rejection_count)} centerLabel="rejected" />
        </ChartFrame>

        <Card className="p-4 border-l-4 border-l-slate-300">
          <div className="text-xs uppercase tracking-wide text-muted">Rejection reasons</div>
          <div className="text-lg font-semibold text-ink mt-1" data-testid="rej-reasons">Not available</div>
          <div className="text-xs text-muted mt-1">The canonical claim has no rejection-reason field.</div>
          <div className="text-xs uppercase tracking-wide text-muted mt-4">Wrongful rejection</div>
          <div className="text-lg font-semibold text-ink mt-1" data-testid="rej-wrongful">Not available</div>
          <div className="text-xs text-muted mt-1">{"No governed reprocessing / reversal linkage exists."}</div>
        </Card>
      </div>

      <FourQuestions
        soWhat={`${fmtNumber(v.rejection_count)} of ${fmtNumber(v.total_claims)} claims were repudiated (${v.rejection_ratio != null ? fmtShare(v.rejection_ratio) : "—"}).`}
        why="Rejection uses only the governed 'Repudiated' claim status; no rejection classification is invented, and reasons are shown as Not available because the field is absent."
        next="Where the ratio is elevated, request the insurer's rejection reasons and reconsideration outcomes to enable deeper analysis in a future sprint."
        trust={`Governed on ${status} data; formula and sources in evidence. Reasons and wrongful-rejection are Not available, never fabricated.`} />
    </div>
  );
}
