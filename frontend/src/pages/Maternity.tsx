import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber } from "../lib/format";
import {
  SectionHeader, Card, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { ChartFrame, KpiStat, Donut } from "../components/ui/charts";

/** Maternity dashboard — governed, chart-led (Sprint 22). Figures from /metrics/maternity;
 *  maternity is identified by a conservative governed rule on diagnosis_code_l1. Limit / newborn
 *  come from confirmed benefit terms only. No fabricated maternity flag, no medical advice. */
export function Maternity() {
  const mat = useQuery({ queryKey: ["m", "maternity"], queryFn: () => api.metric("maternity") });

  if (mat.isLoading) return <><SectionHeader title="Maternity" subtitle="Governed maternity analytics" /><Skeleton rows={4} /></>;
  if (mat.isError) return <><SectionHeader title="Maternity" /><ErrorState onRetry={() => mat.refetch()} /></>;
  const d = mat.data;
  const status = d?.data_quality_status || "No Data";
  if (status === "No Data") return <><SectionHeader title="Maternity" /><EmptyState message="No activated claims data for this tenant yet. Complete Data Onboarding to populate the Maternity dashboard." /></>;

  const v = d.value || {};
  const splitData = v.split_available
    ? [{ label: "Normal delivery", value: v.normal_count, color: "#16A34A" }, { label: "C-section", value: v.csection_count, color: "#7C3AED" }]
    : [];

  return (
    <div className="space-y-5">
      <SectionHeader title="Maternity" subtitle="Governed, API-driven maternity analytics (conservative identification)" right={<DataQualityBadge status={status} />} />
      <RestrictedBanner blocked={d.advisory_blocked} />
      <CaveatBanner caveats={d.caveats} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="mat-kpis">
        <KpiStat label="Maternity claims" value={fmtNumber(v.maternity_claim_count)} sub={`of ${fmtNumber(v.total_claims_in_scope)} claims in scope`} badge={<DataQualityBadge status={status} />} testid="mat-kpi-count" />
        <KpiStat label="Maternity incurred" value={fmtCurrency(v.incurred)} sub="Paid + outstanding (governed)" testid="mat-kpi-incurred" />
        <KpiStat label="Average claim" value={v.average_claim_size != null ? fmtCurrency(v.average_claim_size) : "Not available"} sub="Incurred ÷ maternity claims" testid="mat-kpi-avg" />
        <KpiStat label="Excluded (no diagnosis)" value={fmtNumber(v.excluded_no_diagnosis)} sub="Not counted as maternity" testid="mat-kpi-excluded" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartFrame title="Normal vs C-section" subtitle="Only where clearly distinguishable" status={status}
          evidence={d} evidenceTitle="Maternity evidence" testid="mat-split"
          empty={!v.split_available || splitData.length === 0} emptyTitle="Not available"
          emptyMessage="Normal vs C-section is not clearly distinguishable in the diagnosis data.">
          <Donut data={splitData} centerValue={fmtNumber(v.maternity_claim_count)} centerLabel="maternity" />
        </ChartFrame>

        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Maternity limit</div>
          <div className="text-2xl font-semibold text-ink mt-1" data-testid="mat-limit">{v.maternity_limit != null ? fmtCurrency(v.maternity_limit) : "Not available"}</div>
          <div className="text-xs text-muted mt-1">From a confirmed benefit term only</div>
        </Card>

        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Newborn cover</div>
          <div className="text-2xl font-semibold text-ink mt-1" data-testid="mat-newborn">{v.newborn_cover != null ? fmtCurrency(v.newborn_cover) : "Not available"}</div>
          <div className="text-xs text-muted mt-1">From a confirmed benefit term only</div>
        </Card>
      </div>

      <Card className="p-4 border-l-4 border-l-brand">
        <div className="text-xs font-semibold uppercase tracking-wide text-brand mb-1">Identification rule</div>
        <div className="text-sm text-ink" data-testid="mat-rule">{String(v.identification_rule || "")}</div>
      </Card>

      <FourQuestions
        soWhat={`${fmtNumber(v.maternity_claim_count)} maternity claim(s) identified; incurred ${fmtCurrency(v.incurred)}.`}
        why="Maternity is identified by a conservative governed rule on the diagnosis field (keyword / ICD-O); non-matching and undiagnosed claims are excluded, never inferred. Limits come from confirmed benefit terms only."
        next="Compare maternity incurred against the confirmed maternity limit and newborn cover when available; feed gaps into Renewal Intelligence."
        trust={`Governed on ${status} data; the identification rule and sources are shown in evidence. This is not medical advice.`} />
    </div>
  );
}
