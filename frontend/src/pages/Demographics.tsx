import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtNumber, fmtShare, fmtValue } from "../lib/format";
import {
  SectionHeader, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { ChartFrame, KpiStat, BarV, Donut, SERIES } from "../components/ui/charts";

/** Demographics dashboard — governed, chart-led (Sprint 21). Every figure is from
 *  /metrics/demographics (member.age used directly; no DOB inference). No browser math;
 *  missing gender renders "Not available", missing ages are caveated. */
export function Demographics() {
  const demo = useQuery({ queryKey: ["m", "demographics"], queryFn: () => api.metric("demographics") });

  if (demo.isLoading) return <><SectionHeader title="Demographics" subtitle="Governed membership demographics" /><Skeleton rows={4} /></>;
  if (demo.isError) return <><SectionHeader title="Demographics" /><ErrorState onRetry={() => demo.refetch()} /></>;
  const d = demo.data;
  const status = d?.data_quality_status || "No Data";
  if (status === "No Data") return <><SectionHeader title="Demographics" /><EmptyState message="No activated member data for this tenant yet. Complete Data Onboarding to populate the Demographics dashboard." /></>;

  const v = d.value || {};
  const ageBars = (v.age_bands || []).map((b: any) => ({ label: b.band, value: b.count }));
  const gender = v.gender_distribution;
  const genderData = (gender || []).map((g: any, i: number) => ({ label: String(g.key), value: g.count, color: SERIES[i % SERIES.length] }));
  const relData = (v.relationship_distribution || []).slice(0, 8).map((r: any, i: number) => ({ label: String(r.key), value: r.count, color: SERIES[i % SERIES.length] }));

  return (
    <div className="space-y-5">
      <SectionHeader title="Demographics" subtitle="Governed, API-driven membership demographics (member.age)" right={<DataQualityBadge status={status} />} />
      <RestrictedBanner blocked={d.advisory_blocked} />
      <CaveatBanner caveats={d.caveats} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="demo-kpis">
        <KpiStat label="Members" value={fmtNumber(v.member_count)} sub={`${fmtNumber(v.employee_count)} employees · ${fmtNumber(v.dependent_count)} dependents`} badge={<DataQualityBadge status={status} />} testid="demo-kpi-members" />
        <KpiStat label="Senior share" value={v.senior_share != null ? fmtShare(v.senior_share) : "—"} sub={`Age ≥ ${fmtNumber(v.senior_definition_age)} · ${fmtNumber(v.senior_count)} members`} testid="demo-kpi-senior" />
        <KpiStat label="Average age" value={v.average_age != null ? fmtValue(v.average_age) : "Not available"} sub="From member.age (governed)" testid="demo-kpi-avgage" />
        <KpiStat label="Dependent ratio" value={v.dependent_ratio != null ? fmtValue(v.dependent_ratio) : "Not available"} sub="Dependents per employee" testid="demo-kpi-depratio" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartFrame title="Age band distribution" subtitle="Members by governed age band" status={status}
          evidence={d} evidenceTitle="Demographics evidence" testid="demo-age"
          empty={ageBars.every((b: any) => !b.value)} emptyMessage="No member ages in scope.">
          <BarV data={ageBars} format={(x) => fmtNumber(x)} />
        </ChartFrame>

        <ChartFrame title="Gender distribution" subtitle="Members by governed gender" status={status}
          evidence={d} evidenceTitle="Demographics evidence" testid="demo-gender"
          empty={!gender || genderData.length === 0} emptyTitle="Not available"
          emptyMessage="Gender is not captured for members in scope.">
          <Donut data={genderData} centerValue={fmtNumber(v.member_count)} centerLabel="members" />
        </ChartFrame>

        <ChartFrame title="Relationship mix" subtitle="Members by relationship to the employee" status={status}
          evidence={d} evidenceTitle="Demographics evidence" testid="demo-relationship"
          empty={relData.length === 0} emptyMessage="No relationship data in scope.">
          <Donut data={relData} centerValue={fmtNumber(v.member_count)} centerLabel="members" />
        </ChartFrame>
      </div>

      <FourQuestions
        soWhat={`${fmtNumber(v.member_count)} members; ${v.senior_share != null ? fmtShare(v.senior_share) : "—"} are seniors (age ≥ ${fmtNumber(v.senior_definition_age)}); dependent ratio ${v.dependent_ratio != null ? fmtValue(v.dependent_ratio) : "not available"}.`}
        why="Age bands, senior share, average age and the employee/dependent split are computed server-side from member.age and relationship — no browser math and no DOB inference."
        next="Use the age profile and senior share to frame the renewal risk and the wellness/preventive plan for older cohorts."
        trust={`Governed on ${status} data; formula and source shown in evidence. Members without age/gender are caveated and excluded, never fabricated.`} />
    </div>
  );
}
