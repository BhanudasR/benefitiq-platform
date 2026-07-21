import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtShare } from "../lib/format";
import {
  SectionHeader, Card, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { ChartFrame, KpiStat, BarH, Donut } from "../components/ui/charts";

/** Hospital dashboard — governed, chart-led (Sprint 19). All figures from /metrics/hospital.
 *  Hospital city/location is not provided by the API, so it is shown as "Not available" —
 *  never fabricated. No browser-side arithmetic. */
export function Hospital() {
  const hospital = useQuery({ queryKey: ["m", "hospital"], queryFn: () => api.metric("hospital") });

  if (hospital.isLoading) return <><SectionHeader title="Hospital" subtitle="Governed hospital analytics" /><Skeleton rows={4} /></>;
  if (hospital.isError) return <><SectionHeader title="Hospital" /><ErrorState onRetry={() => hospital.refetch()} /></>;
  const h = hospital.data;
  const status = h?.data_quality_status || "No Data";
  if (status === "No Data") return <><SectionHeader title="Hospital" /><EmptyState message="No activated hospital data for this tenant yet. Complete Data Onboarding to populate the Hospital dashboard." /></>;

  const v = h.value || {};
  const tops = v.top_hospitals || [];
  const bars = tops.slice(0, 8).map((t: any) => ({ label: String(t.key), value: t.incurred }));
  const noNetwork = !v.network_count && !v.non_network_count;

  return (
    <div className="space-y-5">
      <SectionHeader title="Hospital" subtitle="Governed, API-driven hospital / provider analytics" right={<DataQualityBadge status={status} />} />
      <RestrictedBanner blocked={h.advisory_blocked} />
      <CaveatBanner caveats={h.caveats} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="hospital-kpis">
        <KpiStat label="Hospitals" value={fmtNumber(tops.length)} sub="Distinct named providers" badge={<DataQualityBadge status={status} />} testid="hospital-kpi-count" />
        <KpiStat label="Top concentration" value={v.top_hospital_concentration != null ? fmtShare(v.top_hospital_concentration) : "—"} sub="Top provider share of incurred" testid="hospital-kpi-concentration" />
        <KpiStat label="Network" value={fmtNumber(v.network_count)} sub="Cashless-network claims" testid="hospital-kpi-network" />
        <KpiStat label="Non-network" value={fmtNumber(v.non_network_count)} sub="Out-of-network claims" testid="hospital-kpi-nonnetwork" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartFrame title="Top hospitals by incurred" subtitle="Governed incurred concentration" status={status}
          evidence={h} evidenceTitle="Hospital evidence" testid="hospital-top"
          empty={bars.length === 0} emptyMessage="No named hospitals in scope.">
          <BarH data={bars} format={(x) => fmtCurrency(x)} />
        </ChartFrame>

        <ChartFrame title="Network vs non-network" subtitle="Governed provider split (where provided)" status={status}
          evidence={h} evidenceTitle="Hospital evidence" testid="hospital-network"
          empty={noNetwork} emptyMessage="Network split not available in scope.">
          <Donut data={[
            { label: "Network", value: v.network_count, color: "#16A34A" },
            { label: "Non-network", value: v.non_network_count, color: "#DC2626" }]}
            centerLabel="network split" />
        </ChartFrame>

        <Card className="p-4">
          <div className="text-sm font-medium mb-2">Top providers (avg claim size)</div>
          {tops.length === 0 ? <div className="text-sm text-muted">No named hospitals in scope.</div>
            : <div className="overflow-x-auto"><table className="w-full text-sm" data-testid="hospital-table">
                <thead><tr className="text-left text-muted border-b border-line">
                  <th className="py-1.5 pr-4 font-medium">Hospital</th><th className="py-1.5 pr-4 font-medium">Incurred</th>
                  <th className="py-1.5 pr-4 font-medium">Avg claim</th><th className="py-1.5 pr-4 font-medium">City</th></tr></thead>
                <tbody>{tops.slice(0, 8).map((t: any) => (
                  <tr key={t.key} className="border-b border-line/60">
                    <td className="py-2 pr-4 text-ink truncate">{String(t.key)}</td>
                    <td className="py-2 pr-4">{fmtCurrency(t.incurred)}</td>
                    <td className="py-2 pr-4">{fmtCurrency(t.average_claim_size)}</td>
                    <td className="py-2 pr-4 text-xs text-muted">Not available</td>
                  </tr>))}</tbody></table>
              <div className="text-[11px] text-muted mt-2">{"City / location is not provided by the governed hospital feed."}</div></div>}
        </Card>
      </div>

      <FourQuestions
        soWhat={tops[0] ? `${String(tops[0].key)} is the top provider at ${fmtCurrency(tops[0].incurred)} (${v.top_hospital_concentration != null ? fmtShare(v.top_hospital_concentration) : "—"} of incurred).` : "Hospital concentration is available once claims carry hospital names."}
        why="Providers are grouped from the governed hospital_name field; incurred, averages, network flags and concentration are API values — no browser math."
        next="Use provider concentration and the network split to inform network steering and placement negotiation."
        trust={`Governed on ${status} data; grouping and concentration formula are shown in evidence. Missing hospital names are excluded (see caveats).`} />
    </div>
  );
}
