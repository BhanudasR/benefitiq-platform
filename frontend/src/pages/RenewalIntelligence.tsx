import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtPercent, fmtNumber, fmtShare } from "../lib/format";
import {
  SectionHeader, KpiCard, DecisionSummary, DataQualityBadge, CaveatBanner,
  RestrictedBanner, Card, Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { EvidenceDrawer, MiniTrend } from "../components/ui/sandbox";

const ADJUSTED_LABEL = "Adjusted ICR / Defendable ICR view based on one-off claim review assumptions.";

export function RenewalIntelligence() {
  const [ev, setEv] = useState<{ title: string; data: any } | null>(null);
  const icr = useQuery({ queryKey: ["m", "icr"], queryFn: () => api.metric("icr") });
  const trends = useQuery({ queryKey: ["m", "trends"], queryFn: () => api.metric("trends") });
  const large = useQuery({ queryKey: ["m", "large-claims"], queryFn: () => api.metric("large-claims") });
  const adjusted = useQuery({ queryKey: ["s", "adjusted-icr"], queryFn: () => api.simulation("adjusted-icr") });

  if (icr.isLoading) return <><SectionHeader title="Overview" subtitle="Renewal defensibility & ICR" /><Skeleton rows={4} /></>;
  if (icr.isError) return <><SectionHeader title="Overview" /><ErrorState onRetry={() => icr.refetch()} /></>;
  const status = icr.data?.data_quality_status || "No Data";
  if (status === "No Data") return <><SectionHeader title="Overview" /><EmptyState message="No activated governed data yet. Complete Data Onboarding to build the renewal view." /></>;

  const iv = icr.data.value;
  const blocked = icr.data.advisory_blocked || adjusted.data?.advisory_blocked;
  const series = trends.data?.value?.series || [];
  const largeVal = large.data?.value;
  const largeClaims = largeVal?.large_claims || [];
  const adj = adjusted.data?.value;
  const latestYoy = (trends.data?.value?.yoy || []).slice(-1)[0];

  const largeLine = largeVal && largeVal.large_claim_count
    ? `; ${fmtNumber(largeVal.large_claim_count)} large one-off claim(s) contribute ${fmtShare(largeVal.large_claim_incurred_share)} of incurred`
    : "";
  const whyText = `Incurred is paid plus outstanding over ${icr.data.premium_basis || "written"} premium${largeLine}.`;
  const nextText = latestYoy && latestYoy.icr_pct != null
    ? `ICR moved ${fmtPercent(latestYoy.icr_pct)} year-on-year — review Claims Drivers, then test levers in the Sandbox before setting the renewal stance.`
    : "Review Claims Drivers, then test savings levers in the Sandbox before setting the renewal stance.";

  return (
    <div className="space-y-5">
      <SectionHeader title="Overview" subtitle="Governed renewal defensibility & ICR — operational vs adjusted, trend and large-claim impact"
        right={<DataQualityBadge status={status} />} />
      <RestrictedBanner blocked={blocked} />
      <CaveatBanner caveats={icr.data.caveats} />
      <DecisionSummary title={`Portfolio ICR is ${status}`} points={[
        `Operational ICR ${fmtPercent(iv.operational_icr)} on ${icr.data.premium_basis || "written"} premium basis.`,
        `Paid ICR ${fmtPercent(iv.paid_icr)} and Outstanding ICR ${fmtPercent(iv.outstanding_icr)}.`,
      ]} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Operational ICR" value={fmtPercent(iv.operational_icr)}
          sub={`Basis: ${icr.data.premium_basis || "written"}`} badge={<DataQualityBadge status={status} />}
          onEvidence={() => setEv({ title: "ICR evidence", data: icr.data })} />
        <KpiCard label="Paid ICR" value={fmtPercent(iv.paid_icr)} sub="Paid claims over premium" />
        <KpiCard label="Outstanding ICR" value={fmtPercent(iv.outstanding_icr)} sub="Outstanding over premium" />
      </div>

      {series.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-medium mb-2">Year-on-year trend</div>
          <MiniTrend series={series} columns={[
            { key: "policy_year", label: "Year" },
            { key: "premium", label: "Premium", fmt: fmtCurrency },
            { key: "incurred", label: "Incurred", fmt: fmtCurrency },
            { key: "operational_icr", label: "ICR", fmt: fmtPercent },
          ]} />
        </Card>
      )}

      {adj && (
        <Card className="p-5 border-l-4 border-l-amber-400">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-warn">{"Adjusted / Defendable ICR"}</div>
            <button className="text-xs font-medium text-brand hover:underline"
              onClick={() => setEv({ title: "Adjusted ICR evidence", data: adjusted.data })}>View evidence →</button>
          </div>
          <p className="text-xs text-muted mt-1" data-testid="adjusted-label">{adj.adjusted_label || ADJUSTED_LABEL}</p>
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div><div className="text-xs text-muted">Operational ICR (unchanged)</div>
              <div className="text-xl font-semibold" data-testid="op-icr">{fmtPercent(adj.operational_icr)}</div></div>
            <div><div className="text-xs text-muted">{"Adjusted / Defendable ICR"}</div>
              <div className="text-xl font-semibold text-warn" data-testid="adjusted-icr">{fmtPercent(adj.adjusted_icr)}</div></div>
          </div>
        </Card>
      )}

      {largeVal && (
        <Card className="p-4 border-l-4 border-l-amber-400">
          <div className="text-sm font-medium mb-2">{"Large-claim / one-off impact on renewal"}</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div><div className="text-xs text-muted">Large claims</div>
              <div className="text-xl font-semibold" data-testid="large-count">{fmtNumber(largeVal.large_claim_count)}</div>
              <div className="text-xs text-muted mt-0.5">at or above {fmtCurrency(largeVal.threshold)} ({largeVal.threshold_source})</div></div>
            <div><div className="text-xs text-muted">Large-claim incurred</div>
              <div className="text-xl font-semibold">{fmtCurrency(largeVal.large_claim_incurred)}</div></div>
            <div><div className="text-xs text-muted">Share of total incurred</div>
              <div className="text-xl font-semibold" data-testid="large-share">{fmtShare(largeVal.large_claim_incurred_share)}</div></div>
          </div>
          <p className="text-xs text-muted mt-2">{"One-off review candidates only — they remain in Operational ICR. See the Adjusted / Defendable view above for the one-off-excluded scenario."}</p>
        </Card>
      )}

      {largeClaims.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-medium mb-2">Large claims — one-off review candidates</div>
          <MiniTrend series={largeClaims} columns={[
            { key: "claim_number", label: "Claim" },
            { key: "policy_year", label: "Year" },
            { key: "incurred", label: "Incurred", fmt: fmtCurrency },
            { key: "one_off_review_candidate", label: "One-off candidate", fmt: (v) => (v ? "Yes" : "—") },
          ]} />
        </Card>
      )}

      <FourQuestions
        soWhat={`Portfolio ICR is ${status} at ${fmtPercent(iv.operational_icr)} operational — this frames the renewal ask.`}
        why={whyText}
        next={nextText}
        trust={`All figures from governed metric APIs (ICR, trends, large-claims); data quality ${status}. Use "View evidence" for formula, numerator, denominator and sources.`} />

      <EvidenceDrawer open={!!ev} onClose={() => setEv(null)} title={ev?.title} evidence={ev?.data || null} />
    </div>
  );
}
