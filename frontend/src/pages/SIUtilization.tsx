import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtNumber, fmtShare } from "../lib/format";
import {
  SectionHeader, Card, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { ChartFrame, KpiStat, BarV, BarH, Gauge } from "../components/ui/charts";

/** SI Utilization dashboard — governed, chart-led (Sprint 21). All figures from
 *  /metrics/si-utilization; utilization is computed in the BACKEND (member incurred /
 *  member sum insured). Aggregate only — no member-level rows. Missing SI / unlinked claims
 *  are caveated; family-floater absence renders "Not available". */
export function SIUtilization() {
  const si = useQuery({ queryKey: ["m", "si-utilization"], queryFn: () => api.metric("si-utilization") });

  if (si.isLoading) return <><SectionHeader title="SI Utilization" subtitle="Governed sum-insured utilization" /><Skeleton rows={4} /></>;
  if (si.isError) return <><SectionHeader title="SI Utilization" /><ErrorState onRetry={() => si.refetch()} /></>;
  const s = si.data;
  const status = s?.data_quality_status || "No Data";
  if (status === "No Data") return <><SectionHeader title="SI Utilization" /><EmptyState message="No activated member/SI data for this tenant yet. Complete Data Onboarding to populate the SI Utilization dashboard." /></>;

  const v = s.value || {};
  const siBars = (v.si_bands || []).map((b: any) => ({ label: b.band, value: b.count }));
  const utilBars = (v.utilization_bands || []).map((b: any) => ({ label: b.band, value: b.count }));
  // average_utilization is an API fraction (e.g. 0.35 = 35%). Passed straight to the gauge,
  // whose scale is the same fraction domain (0..1.5); the chart owns the geometry.
  const util = typeof v.average_utilization === "number" ? v.average_utilization : null;

  return (
    <div className="space-y-5">
      <SectionHeader title="SI Utilization" subtitle="Governed, API-driven sum-insured bands & utilization (backend-computed)" right={<DataQualityBadge status={status} />} />
      <RestrictedBanner blocked={s.advisory_blocked} />
      <CaveatBanner caveats={s.caveats} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="si-kpis">
        <KpiStat label="Members" value={fmtNumber(v.member_count)} sub="With governed sum insured" badge={<DataQualityBadge status={status} />} testid="si-kpi-members" />
        <KpiStat label="Average utilization" value={util != null ? fmtShare(util) : "Not available"} sub="Incurred ÷ SI (backend)" testid="si-kpi-avgutil" />
        <KpiStat label="Exhausted" value={fmtNumber(v.exhausted_count)} sub={v.exhausted_share != null ? `${fmtShare(v.exhausted_share)} of members` : "≥ 100% utilization"} deltaTone="bad" testid="si-kpi-exhausted" />
        <KpiStat label="Underinsured signal" value={fmtNumber(v.underinsured_signal_count)} sub="High/exhausted utilization" deltaTone="warn" testid="si-kpi-underins" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartFrame title="Average utilization" subtitle="Portfolio utilization (backend-computed)" status={status}
          evidence={s} evidenceTitle="SI utilization evidence" testid="si-gauge"
          empty={util == null} emptyMessage="No members with sum insured in scope.">
          <Gauge value={util} min={0} max={1.5}
            valueText={util != null ? fmtShare(util) : "—"} label="Avg utilization"
            bands={[{ upTo: 0.75, color: "#16A34A" }, { upTo: 1.0, color: "#D97706" }]} />
        </ChartFrame>

        <ChartFrame title="Sum-insured bands" subtitle="Members by governed SI band" status={status}
          evidence={s} evidenceTitle="SI utilization evidence" testid="si-bands"
          empty={siBars.every((b: any) => !b.value)} emptyMessage="No members with sum insured in scope.">
          <BarV data={siBars} format={(x) => fmtNumber(x)} />
        </ChartFrame>

        <ChartFrame title="Utilization bands" subtitle="Members by utilization level" status={status}
          evidence={s} evidenceTitle="SI utilization evidence" testid="si-util-bands"
          empty={utilBars.every((b: any) => !b.value)} emptyMessage="No utilization data in scope.">
          <BarH data={utilBars} format={(x) => fmtNumber(x)} />
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-testid="si-signals">
        <Card className="p-4 border-l-4 border-l-amber-400">
          <div className="text-xs uppercase tracking-wide text-muted">Underinsured signal</div>
          <div className="text-2xl font-semibold mt-1">{fmtNumber(v.underinsured_signal_count)}</div>
          <div className="text-xs text-muted mt-1">Members at ≥ 75% utilization — sum insured may be low</div>
        </Card>
        <Card className="p-4 border-l-4 border-l-brand">
          <div className="text-xs uppercase tracking-wide text-muted">Overinsured signal</div>
          <div className="text-2xl font-semibold mt-1">{fmtNumber(v.overinsured_signal_count)}</div>
          <div className="text-xs text-muted mt-1">Members at very low utilization — sum insured may be high</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Family floater</div>
          <div className="text-2xl font-semibold mt-1" data-testid="si-floater">{v.family_floater_available ? "Available" : "Not available"}</div>
          <div className="text-xs text-muted mt-1">Corporate floater SI presence in governed policy data</div>
        </Card>
      </div>

      <FourQuestions
        soWhat={`${fmtNumber(v.exhausted_count)} member(s) exhausted their SI (${v.exhausted_share != null ? fmtShare(v.exhausted_share) : "—"}); average utilization ${v.average_utilization != null ? fmtShare(v.average_utilization) : "not available"}.`}
        why="Utilization is member incurred ÷ member sum insured, computed server-side; SI and utilization bands are governed. Under/over-insured are utilization-vs-SI signals, not actuarial adequacy verdicts."
        next="Use exhausted and underinsured signals to inform SI adequacy and corporate-buffer discussions in Renewal Intelligence."
        trust={`Governed on ${status} data; formula and thresholds shown in evidence. Members without SI and claims not linked to a member are caveated, never silently dropped.`} />
    </div>
  );
}
