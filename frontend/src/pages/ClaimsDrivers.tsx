import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtPercent } from "../lib/format";
import {
  SectionHeader, KpiCard, DecisionSummary, DataQualityBadge, CaveatBanner,
  RestrictedBanner, Card, Skeleton, EmptyState, ErrorState,
} from "../components/ui/primitives";
import { EvidenceDrawer, MiniTrend } from "../components/ui/sandbox";

const pick = (o: any, keys: string[]) => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

/** Renewal › Claims Drivers — what is driving renewal cost: frequency vs severity,
 *  responsible cohorts and the top ailment/hospital contributors. Every number is
 *  read from the governed claims / ailment metric APIs — no browser-side math. */
export function ClaimsDrivers() {
  const [ev, setEv] = useState<{ title: string; data: any } | null>(null);
  const claims = useQuery({ queryKey: ["m", "claims"], queryFn: () => api.metric("claims") });
  const ailment = useQuery({ queryKey: ["m", "ailment"], queryFn: () => api.metric("ailment") });

  if (claims.isLoading) return <><SectionHeader title="Claims Drivers" subtitle="Frequency vs severity — what drives renewal cost" /><Skeleton rows={4} /></>;
  if (claims.isError) return <><SectionHeader title="Claims Drivers" /><ErrorState onRetry={() => claims.refetch()} /></>;

  const status = claims.data?.data_quality_status || "No Data";
  if (status === "No Data")
    return <><SectionHeader title="Claims Drivers" /><EmptyState message="No activated governed data yet. Complete Data Onboarding to surface claim cost drivers." /></>;

  const v = claims.data.value || {};
  const blocked = claims.data.advisory_blocked;
  const claimCount = pick(v, ["claim_count", "total_claims", "claims"]);
  const totalIncurred = pick(v, ["total_incurred", "incurred", "paid_plus_outstanding"]);
  const avgSeverity = pick(v, ["average_claim", "avg_severity", "mean_claim"]);
  const drivers = pick(ailment.data?.value, ["ailments", "top_ailments", "drivers"]) || [];
  const nameKey = drivers.length
    ? (["ailment", "name", "label", "diagnosis"].find((k) => drivers[0][k] !== undefined) || "ailment")
    : "ailment";

  return (
    <div className="space-y-5">
      <SectionHeader title="Claims Drivers" subtitle="Frequency vs severity — what drives renewal cost"
        right={<DataQualityBadge status={status} />} />
      <RestrictedBanner blocked={blocked} />
      <CaveatBanner caveats={claims.data.caveats} />
      <DecisionSummary title="Cost is a product of how often claims occur and how large they are" points={[
        "Frequency (claim count) and severity (average claim) are shown separately so the renewal story is not hidden behind a single average.",
        "Top ailment contributors below identify the cohorts and conditions responsible for the incurred spend.",
      ]} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Claim frequency" value={claimCount !== undefined ? fmtNumber(claimCount) : "—"}
          sub="Number of claims (governed)" badge={<DataQualityBadge status={status} />}
          onEvidence={() => setEv({ title: "Claims evidence", data: claims.data })} />
        <KpiCard label="Total incurred" value={totalIncurred !== undefined ? fmtCurrency(totalIncurred) : "—"}
          sub="Paid + outstanding" />
        <KpiCard label="Average severity" value={avgSeverity !== undefined ? fmtCurrency(avgSeverity) : "—"}
          sub="Mean claim size" />
      </div>

      {Array.isArray(drivers) && drivers.length > 0 ? (
        <Card className="p-4">
          <div className="text-sm font-medium mb-2">Top ailment contributors</div>
          <MiniTrend series={drivers} columns={[
            { key: nameKey, label: "Ailment" },
            { key: "claim_count", label: "Claims", fmt: (x) => (x !== undefined ? fmtNumber(x) : "—") },
            { key: "incurred", label: "Incurred", fmt: (x) => (x !== undefined ? fmtCurrency(x) : "—") },
            { key: "share", label: "Share", fmt: (x) => (x !== undefined ? fmtPercent(x) : "—") },
          ]} />
        </Card>
      ) : (
        <EmptyState title="Ailment breakdown pending"
          message="Load and activate ailment-level claims to rank the conditions driving renewal cost." />
      )}

      <EvidenceDrawer open={!!ev} onClose={() => setEv(null)} title={ev?.title} evidence={ev?.data || null} />
    </div>
  );
}
