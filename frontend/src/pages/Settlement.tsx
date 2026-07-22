import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtShare } from "../lib/format";
import {
  SectionHeader, Card, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { ChartFrame, KpiStat, Donut, StackedBar, SERIES } from "../components/ui/charts";

/** Settlement dashboard — governed, chart-led (Sprint 22). Figures from /metrics/settlement.
 *  Reimbursement TAT is a governed "Not available" (canonical claim lacks receipt/payment
 *  dates); no browser math. */
export function Settlement() {
  const st = useQuery({ queryKey: ["m", "settlement"], queryFn: () => api.metric("settlement") });

  if (st.isLoading) return <><SectionHeader title="Settlement" subtitle="Governed settlement analytics" /><Skeleton rows={4} /></>;
  if (st.isError) return <><SectionHeader title="Settlement" /><ErrorState onRetry={() => st.refetch()} /></>;
  const d = st.data;
  const status = d?.data_quality_status || "No Data";
  if (status === "No Data") return <><SectionHeader title="Settlement" /><EmptyState message="No activated claims data for this tenant yet. Complete Data Onboarding to populate the Settlement dashboard." /></>;

  const v = d.value || {};
  const statusData = (v.status_distribution || []).map((s: any, i: number) => ({ label: String(s.key), value: s.count, color: SERIES[i % SERIES.length] }));

  return (
    <div className="space-y-5">
      <SectionHeader title="Settlement" subtitle="Governed, API-driven claim settlement analytics" right={<DataQualityBadge status={status} />} />
      <RestrictedBanner blocked={d.advisory_blocked} />
      <CaveatBanner caveats={d.caveats} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="settle-kpis">
        <KpiStat label="Claims" value={fmtNumber(v.claim_count)} sub={`${fmtNumber(v.closed_count)} closed · ${fmtNumber(v.open_count)} open`} badge={<DataQualityBadge status={status} />} testid="settle-kpi-claims" />
        <KpiStat label="Settled fully" value={fmtNumber(v.settled_fully_count)} sub={`${fmtNumber(v.settled_partially_count)} partial · ${fmtNumber(v.repudiated_count)} repudiated`} testid="settle-kpi-fully" />
        <KpiStat label="Paid" value={fmtCurrency(v.paid)} sub={`Outstanding ${fmtCurrency(v.outstanding)}`} testid="settle-kpi-paid" />
        <KpiStat label="Deduction" value={v.deduction_amount != null ? fmtCurrency(v.deduction_amount) : "Not available"} sub={`Bill-breakup claims: ${fmtNumber(v.bill_breakup_claims)}`} testid="settle-kpi-deduction" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartFrame title="Settlement status mix" subtitle="Claims by governed settlement status" status={status}
          evidence={d} evidenceTitle="Settlement evidence" testid="settle-status"
          empty={statusData.length === 0} emptyMessage="No claim status data in scope.">
          <Donut data={statusData} centerValue={fmtNumber(v.claim_count)} centerLabel="claims" />
        </ChartFrame>

        <ChartFrame title="Paid vs outstanding" subtitle="Governed split of incurred" status={status}
          evidence={d} evidenceTitle="Settlement evidence" testid="settle-paid-outstanding"
          empty={typeof v.incurred !== "number"} emptyMessage="No claim amounts in scope.">
          <StackedBar rows={[{ label: "Incurred", segments: [
            { label: "Paid", value: v.paid, color: "#2563EB" },
            { label: "Outstanding", value: v.outstanding, color: "#D97706" }] }]}
            format={(x) => fmtCurrency(x)} />
        </ChartFrame>

        <ChartFrame title="Cashless vs reimbursement" subtitle="Claim type split (where provided)" status={status}
          evidence={d} evidenceTitle="Settlement evidence" testid="settle-type"
          empty={!v.cashless_count && !v.reimbursement_count} emptyMessage="Claim-type split not available in scope.">
          <Donut data={[
            { label: "Cashless", value: v.cashless_count, color: "#16A34A" },
            { label: "Reimbursement", value: v.reimbursement_count, color: "#7C3AED" }]}
            centerValue={fmtNumber(v.claim_count)} centerLabel="claims" />
        </ChartFrame>
      </div>

      <Card className="p-4 border-l-4 border-l-slate-300">
        <div className="text-xs uppercase tracking-wide text-muted">Reimbursement TAT</div>
        <div className="text-lg font-semibold text-ink mt-1" data-testid="settle-tat">Not available</div>
        <div className="text-xs text-muted mt-1">{String(v.tat?.reason || "")}</div>
      </Card>

      <FourQuestions
        soWhat={`${fmtNumber(v.closed_count)} of ${fmtNumber(v.claim_count)} claims are closed; paid ${fmtCurrency(v.paid)}, outstanding ${fmtCurrency(v.outstanding)}.`}
        why="Status mix, paid/outstanding, cashless/reimbursement and deduction are governed API values — no browser math."
        next="Review the outstanding and partially-settled share; TAT will be enabled once receipt/payment dates are ingested."
        trust={`Governed on ${status} data; formula and sources in evidence. TAT is Not available (required canonical date fields are absent), never fabricated.`} />
    </div>
  );
}
