import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtShare } from "../lib/format";
import {
  SectionHeader, Card, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { ChartFrame, KpiStat, BarH, Donut, Quadrant, SERIES } from "../components/ui/charts";

/** Ailment dashboard — governed, chart-led (Sprint 19). All figures from /metrics/ailment
 *  (grouped by diagnosis_code_l1 only). No diagnosis advice, no fabricated taxonomy, no math. */
export function Ailment() {
  const ailment = useQuery({ queryKey: ["m", "ailment"], queryFn: () => api.metric("ailment") });

  if (ailment.isLoading) return <><SectionHeader title="Ailment" subtitle="Governed ailment analytics" /><Skeleton rows={4} /></>;
  if (ailment.isError) return <><SectionHeader title="Ailment" /><ErrorState onRetry={() => ailment.refetch()} /></>;
  const a = ailment.data;
  const status = a?.data_quality_status || "No Data";
  if (status === "No Data") return <><SectionHeader title="Ailment" /><EmptyState message="No activated ailment data for this tenant yet. Complete Data Onboarding to populate the Ailment dashboard." /></>;

  const tops = (a.value?.top_ailments) || [];
  const bars = tops.slice(0, 8).map((t: any) => ({ label: String(t.key), value: t.incurred }));
  const share = tops.slice(0, 6).map((t: any, i: number) => ({ label: String(t.key), value: t.incurred, color: SERIES[i % SERIES.length] }));
  const quad = tops.slice(0, 10).map((t: any) => ({ label: String(t.key), x: t.count, y: t.average_claim_size }));
  const recurring = tops.filter((t: any) => t.recurring_indicator);

  return (
    <div className="space-y-5">
      <SectionHeader title="Ailment" subtitle="Governed, API-driven ailment analytics (diagnosis group L1)" right={<DataQualityBadge status={status} />} />
      <RestrictedBanner blocked={a.advisory_blocked} />
      <CaveatBanner caveats={a.caveats} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="ailment-kpis">
        <KpiStat label="Ailment groups" value={fmtNumber(tops.length)} sub="Distinct diagnosis_code_l1" badge={<DataQualityBadge status={status} />} testid="ailment-kpi-groups" />
        <KpiStat label="Top ailment" value={tops[0] ? String(tops[0].key) : "—"} sub={tops[0] ? fmtCurrency(tops[0].incurred) : undefined} testid="ailment-kpi-top" />
        <KpiStat label="Top share" value={tops[0]?.incurred_share != null ? fmtShare(tops[0].incurred_share) : "—"} sub="of incurred (governed)" testid="ailment-kpi-share" />
        <KpiStat label="Recurring groups" value={fmtNumber(recurring.length)} sub="claim_count > 1" testid="ailment-kpi-recurring" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartFrame title="Top ailments by incurred" subtitle="Governed incurred by diagnosis group" status={status}
          evidence={a} evidenceTitle="Ailment evidence" testid="ailment-top"
          empty={bars.length === 0} emptyMessage="No ailment groups in scope.">
          <BarH data={bars} format={(x) => fmtCurrency(x)} />
        </ChartFrame>

        <ChartFrame title="Frequency × severity" subtitle="x = claim count · y = average claim size (governed)" status={status}
          evidence={a} evidenceTitle="Ailment evidence" testid="ailment-quadrant"
          empty={quad.length === 0} emptyMessage="Not enough ailment data for a quadrant.">
          <Quadrant points={quad} xLabel="Frequency (count)" yLabel="Severity (avg)" format={(x) => fmtNumber(x)} />
        </ChartFrame>

        <ChartFrame title="Ailment share" subtitle="Incurred concentration (top groups)" status={status}
          evidence={a} evidenceTitle="Ailment evidence" testid="ailment-share"
          empty={share.length === 0} emptyMessage="No ailment groups in scope.">
          <Donut data={share} centerValue={fmtNumber(tops.length)} centerLabel="groups" />
        </ChartFrame>
      </div>

      {recurring.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-medium mb-2">Recurring ailment groups ({fmtNumber(recurring.length)})</div>
          <div className="flex flex-wrap gap-2" data-testid="ailment-recurring">
            {recurring.slice(0, 20).map((t: any) => (
              <span key={t.key} className="text-[11px] px-2 py-0.5 rounded-full border border-line bg-slate-50 text-ink">
                {String(t.key)} · {fmtNumber(t.count)}×</span>))}
          </div>
        </Card>
      )}

      <FourQuestions
        soWhat={tops[0] ? `${String(tops[0].key)} is the top ailment group at ${fmtCurrency(tops[0].incurred)} (${tops[0].incurred_share != null ? fmtShare(tops[0].incurred_share) : "—"} of incurred).` : "Ailment concentration is available once claims carry diagnosis codes."}
        why="Groups are formed only from the governed diagnosis_code_l1; incurred, counts, averages and recurrence come from the API — no browser math and no clinical inference."
        next="Use the frequency × severity quadrant to separate high-frequency vs high-severity groups for the renewal and wellness discussion."
        trust={`Governed on ${status} data; grouping and recurrence formulae are shown in evidence. This is not diagnosis advice.`} />
    </div>
  );
}
