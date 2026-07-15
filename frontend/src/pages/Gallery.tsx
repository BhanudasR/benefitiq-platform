import React from "react";
import {
  SectionHeader, KpiCard, DecisionSummary, EvidencePanel, DataQualityBadge,
  CaveatBanner, RestrictedBanner, SourceEvidenceChip, Skeleton, EmptyState, ErrorState,
} from "../components/ui/primitives";

/** Component gallery — a preview of the premium design-system primitives. */
export function Gallery() {
  const evidence = {
    formula: "operational_icr = incurred / earned_premium x 100",
    numerator: 1620000, denominator: 2200000, premium_basis: "written",
    reliability: "medium", data_quality_status: "Conditional",
    source_tables: ["claim", "policy_version"],
    caveats: ["Written premium used as earned premium unavailable (basis='written')."],
  };
  return (
    <div className="space-y-5">
      <SectionHeader title="Component Gallery" subtitle="Premium design-system primitives" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Operational ICR" value="73.64%" sub="Incurred ÷ premium"
          badge={<DataQualityBadge status="Conditional" />} onEvidence={() => {}} />
        <KpiCard label="Total Premium" value="₹22,00,000" sub="Basis: written" />
        <KpiCard label="Lives Covered" value="1,240" sub="980 employees" />
      </div>
      <DecisionSummary title="Portfolio is Conditional" points={["ICR 73.64% on written premium.", "3 quarantined rows under review."]} />
      <RestrictedBanner blocked />
      <CaveatBanner caveats={evidence.caveats} />
      <div><SourceEvidenceChip label="claim" /><SourceEvidenceChip label="policy_version" /></div>
      <EvidencePanel evidence={evidence} />
      <Skeleton rows={2} />
      <div className="grid grid-cols-2 gap-4"><EmptyState /><ErrorState onRetry={() => {}} /></div>
    </div>
  );
}
