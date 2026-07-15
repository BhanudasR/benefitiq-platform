import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtPercent } from "../lib/format";
import {
  SectionHeader, KpiCard, DecisionSummary, EvidencePanel, DataQualityBadge,
  CaveatBanner, RestrictedBanner, Skeleton, EmptyState, ErrorState,
} from "../components/ui/primitives";

export function ExecutiveSummary() {
  const [showEvidence, setShowEvidence] = useState(false);
  const portfolio = useQuery({ queryKey: ["m", "portfolio"], queryFn: () => api.metric("portfolio") });
  const claims = useQuery({ queryKey: ["m", "claims"], queryFn: () => api.metric("claims") });
  const icr = useQuery({ queryKey: ["m", "icr"], queryFn: () => api.metric("icr") });

  const loading = portfolio.isLoading || claims.isLoading || icr.isLoading;
  const error = portfolio.isError || claims.isError || icr.isError;
  if (loading) return <><SectionHeader title="Executive Summary" subtitle="Portfolio decision intelligence" /><Skeleton rows={4} /></>;
  if (error) return <><SectionHeader title="Executive Summary" /><ErrorState onRetry={() => { portfolio.refetch(); claims.refetch(); icr.refetch(); }} /></>;

  const p = portfolio.data, cl = claims.data, ic = icr.data;
  const status = ic?.data_quality_status || "No Data";
  if (status === "No Data") return <><SectionHeader title="Executive Summary" /><EmptyState message="No activated governed data for this tenant yet. Complete Data Onboarding to populate the Executive Summary." /></>;

  const iv = ic.value, pv = p.value, clv = cl.value;
  const points = [
    `Operational ICR is ${fmtPercent(iv.operational_icr)} on ${ic.premium_basis || "written"} premium basis.`,
    `Incurred claims ${fmtCurrency(iv.incurred)} against premium ${fmtCurrency(iv.earned_premium)}.`,
    `${fmtNumber(clv.claim_count)} claims across ${fmtNumber(pv.lives_covered)} lives covered.`,
  ];

  return (
    <div className="space-y-5">
      <SectionHeader title="Executive Summary" subtitle="Governed, API-driven portfolio intelligence"
        right={<DataQualityBadge status={status} />} />
      <RestrictedBanner blocked={ic.advisory_blocked} />
      <CaveatBanner caveats={ic.caveats} />
      <DecisionSummary title={`Portfolio is ${status}`} points={points} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Premium" value={fmtCurrency(pv.total_premium)}
          sub={`Basis: ${pv.premium_basis || "written"}`} badge={<DataQualityBadge status={status} />} />
        <KpiCard label="Operational ICR" value={fmtPercent(iv.operational_icr)}
          sub="Incurred ÷ premium" onEvidence={() => setShowEvidence((s) => !s)} />
        <KpiCard label="Incurred Claims" value={fmtCurrency(iv.incurred)} sub="Paid + outstanding" />
        <KpiCard label="Lives Covered" value={fmtNumber(pv.lives_covered)}
          sub={`${fmtNumber(pv.employee_count)} employees`} />
      </div>
      {showEvidence && <EvidencePanel evidence={ic} />}
    </div>
  );
}
