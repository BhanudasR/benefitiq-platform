import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtShare } from "../lib/format";
import {
  SectionHeader, Card, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { ChartFrame, KpiStat, BarH, Donut, SERIES } from "../components/ui/charts";

/** Employee & Family dashboard — governed, chart-led (Sprint 20). Every figure comes from
 *  /metrics/relation (claims grouped by member relationship). No browser-side arithmetic;
 *  fields the API does not provide render "Not available". */
export function EmployeeFamily() {
  const relation = useQuery({ queryKey: ["m", "relation"], queryFn: () => api.metric("relation") });

  if (relation.isLoading) return <><SectionHeader title="Employee & Family" subtitle="Governed relationship analytics" /><Skeleton rows={4} /></>;
  if (relation.isError) return <><SectionHeader title="Employee & Family" /><ErrorState onRetry={() => relation.refetch()} /></>;
  const r = relation.data;
  const status = r?.data_quality_status || "No Data";
  if (status === "No Data") return <><SectionHeader title="Employee & Family" /><EmptyState message="No activated claims/member data for this tenant yet. Complete Data Onboarding to populate the Employee & Family dashboard." /></>;

  const v = r.value || {};
  const groups = (v.groups || []).filter((g: any) => g.key !== "Unknown");
  const bars = groups.map((g: any) => ({ label: String(g.key), value: g.incurred }));
  const share = groups.slice(0, 8).map((g: any, i: number) => ({ label: String(g.key), value: g.incurred, color: SERIES[i % SERIES.length] }));
  const top = groups[0];

  return (
    <div className="space-y-5">
      <SectionHeader title="Employee & Family" subtitle="Governed, API-driven consumption by member relationship" right={<DataQualityBadge status={status} />} />
      <RestrictedBanner blocked={r.advisory_blocked} />
      <CaveatBanner caveats={r.caveats} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="ef-kpis">
        <KpiStat label="Relationships" value={fmtNumber(groups.length)} sub="Distinct member relationships" badge={<DataQualityBadge status={status} />} testid="ef-kpi-relations" />
        <KpiStat label="Top consumer" value={top ? String(top.key) : "—"} sub={top ? fmtCurrency(top.incurred) : undefined} testid="ef-kpi-top" />
        <KpiStat label="Top share" value={top?.incurred_share != null ? fmtShare(top.incurred_share) : "—"} sub="of incurred (governed)" testid="ef-kpi-topshare" />
        <KpiStat label="Parent claim share" value={v.parent_claim_share != null ? fmtShare(v.parent_claim_share) : "Not available"} sub="Father + Mother of incurred" testid="ef-kpi-parent" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartFrame title="Incurred by relationship" subtitle="Governed incurred per member relationship" status={status}
          evidence={r} evidenceTitle="Relationship evidence" testid="ef-bars"
          empty={bars.length === 0} emptyMessage="No relationship groups in scope.">
          <BarH data={bars} format={(x) => fmtCurrency(x)} />
        </ChartFrame>

        <ChartFrame title="Relationship share" subtitle="Incurred concentration by relationship" status={status}
          evidence={r} evidenceTitle="Relationship evidence" testid="ef-donut"
          empty={share.length === 0} emptyMessage="No relationship groups in scope.">
          <Donut data={share} centerValue={fmtNumber(groups.length)} centerLabel="relations" />
        </ChartFrame>

        <Card className="p-4">
          <div className="text-sm font-medium mb-2">Relationship drilldown</div>
          {groups.length === 0 ? <div className="text-sm text-muted">No relationship groups in scope.</div>
            : <div className="overflow-x-auto"><table className="w-full text-sm" data-testid="ef-table">
                <thead><tr className="text-left text-muted border-b border-line">
                  <th className="py-1.5 pr-4 font-medium">Relationship</th><th className="py-1.5 pr-4 font-medium">Claims</th>
                  <th className="py-1.5 pr-4 font-medium">Incurred</th><th className="py-1.5 pr-4 font-medium">Avg</th>
                  <th className="py-1.5 pr-4 font-medium">Share</th></tr></thead>
                <tbody>{groups.slice(0, 10).map((g: any) => (
                  <tr key={g.key} className="border-b border-line/60">
                    <td className="py-2 pr-4 text-ink">{String(g.key)}</td>
                    <td className="py-2 pr-4">{fmtNumber(g.count)}</td>
                    <td className="py-2 pr-4">{fmtCurrency(g.incurred)}</td>
                    <td className="py-2 pr-4">{fmtCurrency(g.average_claim_size)}</td>
                    <td className="py-2 pr-4">{g.incurred_share != null ? fmtShare(g.incurred_share) : "—"}</td>
                  </tr>))}</tbody></table></div>}
        </Card>
      </div>

      <FourQuestions
        soWhat={top ? `${String(top.key)} is the largest consumer at ${fmtCurrency(top.incurred)} (${top.incurred_share != null ? fmtShare(top.incurred_share) : "—"} of incurred); parent share ${v.parent_claim_share != null ? fmtShare(v.parent_claim_share) : "not available"}.` : "Relationship consumption is available once claims are linked to member relationships."}
        why="Claims are grouped by the governed member relationship; incurred, counts, averages and shares are API values — no browser math and no fabricated relationships."
        next="Use the relationship split and parent-claim share to inform parent co-pay and dependant-cover decisions in Renewal Intelligence."
        trust={`Governed on ${status} data; grouping and parent-share formula shown in evidence. Unlinked claims are surfaced as a caveat, never merged in.`} />
    </div>
  );
}
