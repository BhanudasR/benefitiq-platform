import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtPercent } from "../lib/format";
import {
  SectionHeader, KpiCard, DecisionSummary, DataQualityBadge, CaveatBanner,
  RestrictedBanner, Card, Skeleton, EmptyState, ErrorState,
} from "../components/ui/primitives";
import { EvidenceDrawer, MiniTrend } from "../components/ui/sandbox";

const ADJUSTED_LABEL = "Adjusted ICR / Defendable ICR view based on one-off claim review assumptions.";

export function RenewalIntelligence() {
  const [ev, setEv] = useState<{ title: string; data: any } | null>(null);
  const icr = useQuery({ queryKey: ["m", "icr"], queryFn: () => api.metric("icr") });
  const trends = useQuery({ queryKey: ["m", "trends"], queryFn: () => api.metric("trends") });
  const large = useQuery({ queryKey: ["m", "large-claims"], queryFn: () => api.metric("large-claims") });
  const adjusted = useQuery({ queryKey: ["s", "adjusted-icr"], queryFn: () => api.simulation("adjusted-icr") });

  if (icr.isLoading) return <><SectionHeader title="Renewal Intelligence" subtitle="Renewal defensibility & ICR" /><Skeleton rows={4} /></>;
  if (icr.isError) return <><SectionHeader title="Renewal Intelligence" /><ErrorState onRetry={() => icr.refetch()} /></>;
  const status = icr.data?.data_quality_status || "No Data";
  if (status === "No Data") return <><SectionHeader title="Renewal Intelligence" /><EmptyState message="No activated governed data yet. Complete Data Onboarding to build the renewal view." /></>;

  const iv = icr.data.value;
  const blocked = icr.data.advisory_blocked || adjusted.data?.advisory_blocked;
  const series = trends.data?.value?.series || [];
  const largeClaims = large.data?.value?.large_claims || [];
  const adj = adjusted.data?.value;

  return (
    <div className="space-y-5">
      <SectionHeader title="Renewal Intelligence" subtitle="Governed renewal defensibility & ICR"
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

      <EvidenceDrawer open={!!ev} onClose={() => setEv(null)} title={ev?.title} evidence={ev?.data || null} />
    </div>
  );
}
