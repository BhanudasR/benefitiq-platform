import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtPercent } from "../lib/format";
import {
  SectionHeader, Card, DecisionSummary, DataQualityBadge, CaveatBanner,
  RestrictedBanner, Skeleton, EmptyState, ErrorState,
} from "../components/ui/primitives";
import { EvidenceDrawer, LeverClassificationBadge } from "../components/ui/sandbox";

const DIMS: Array<{ k: string; label: string; fmt?: (v: any) => string }> = [
  { k: "expected_saving", label: "Expected saving", fmt: fmtCurrency },
  { k: "icr_impact_revised", label: "ICR impact (revised)", fmt: fmtPercent },
  { k: "employee_friction", label: "Employee friction" },
  { k: "implementation_feasibility", label: "Implementation feasibility" },
  { k: "renewal_defensibility", label: "Renewal defensibility" },
  { k: "data_reliability", label: "Data reliability" },
];

export function BalancedBenefitDesign() {
  const [ev, setEv] = useState(false);
  const q = useQuery({ queryKey: ["s", "balanced-design"], queryFn: () => api.simulation("balanced-design") });

  if (q.isLoading) return <><SectionHeader title="Balanced Benefit Design" subtitle="Governed lever scoring" /><Skeleton rows={4} /></>;
  if (q.isError) return <><SectionHeader title="Balanced Benefit Design" /><ErrorState onRetry={() => q.refetch()} /></>;
  const status = q.data?.data_quality_status || "No Data";
  const levers = q.data?.value?.levers || [];
  if (status === "No Data" || levers.length === 0)
    return <><SectionHeader title="Balanced Benefit Design" /><EmptyState message="No activated governed data yet. Load claims + policy data to score benefit-design levers." /></>;

  return (
    <div className="space-y-5">
      <SectionHeader title="Balanced Benefit Design" subtitle="Governed lever scoring — control renewal cost without employee dissatisfaction"
        right={<DataQualityBadge status={status} />} />
      <RestrictedBanner blocked={q.data.advisory_blocked} />
      <CaveatBanner caveats={q.data.caveats} />
      <DecisionSummary title="Lever trade-offs scored on governed data" points={[
        "Each lever is scored on expected saving, ICR impact, employee friction, feasibility, renewal defensibility and data reliability.",
        "Classification blends savings with employee impact — never savings alone.",
      ]} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {levers.map((l: any) => (
          <Card key={l.lever} className="p-4" >
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-ink capitalize">{String(l.lever).split("_").join(" ")}</div>
              <LeverClassificationBadge classification={l.classification} />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {DIMS.map((d) => (
                <div key={d.k} className="flex justify-between gap-2">
                  <dt className="text-muted">{d.label}</dt>
                  <dd className="text-ink">{d.fmt ? d.fmt(l[d.k]) : String(l[d.k] ?? "—")}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </div>
      <button className="text-xs font-medium text-brand hover:underline" onClick={() => setEv(true)}>View evidence →</button>
      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="Balanced design evidence" evidence={q.data} />
    </div>
  );
}
