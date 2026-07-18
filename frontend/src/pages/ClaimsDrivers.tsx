import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtPercent, fmtShare, fmtValue } from "../lib/format";
import {
  SectionHeader, KpiCard, DecisionSummary, DataQualityBadge, CaveatBanner,
  RestrictedBanner, Card, Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { EvidenceDrawer, MiniTrend } from "../components/ui/sandbox";

/** Renewal › Claims Drivers — governed demo-parity view of what is driving renewal
 *  pressure: frequency vs severity, paid-vs-outstanding movement, large-claim effect,
 *  relation / hospital / ailment concentration. Every figure is rendered straight from
 *  the governed metric APIs (claims, large-claims, relation, hospital, ailment, icr,
 *  trends). No relation/hospital/ailment insight is computed in the browser. */

// A governed dimension table section: renders the API rows, or a premium empty/caveat state.
function DimensionSection({ title, subtitle, q, rows, columns, footer, testid }: {
  title: string; subtitle?: string; q: any; rows: any[];
  columns: Array<{ key: string; label: string; fmt?: (v: any) => string }>;
  footer?: React.ReactNode; testid?: string;
}) {
  const status = q.data?.data_quality_status;
  return (
    <Card className="p-4" >
      <div className="flex items-center justify-between mb-2">
        <div><div className="text-sm font-medium">{title}</div>
          {subtitle && <div className="text-xs text-muted">{subtitle}</div>}</div>
        {status && <DataQualityBadge status={status} />}
      </div>
      {q.isLoading ? <Skeleton rows={2} /> :
        q.isError ? <ErrorState onRetry={() => q.refetch()} /> :
        rows.length === 0 ? <EmptyState title="Not available in scope"
          message="This governed breakdown has no rows for the current data. It will populate once the underlying claims carry this dimension." /> :
        <div data-testid={testid}>
          <MiniTrend series={rows} columns={columns} />
          {footer}
        </div>}
      <CaveatBanner caveats={q.data?.caveats} />
    </Card>
  );
}

export function ClaimsDrivers() {
  const [ev, setEv] = useState<{ title: string; data: any } | null>(null);
  const claims = useQuery({ queryKey: ["m", "claims"], queryFn: () => api.metric("claims") });
  const icr = useQuery({ queryKey: ["m", "icr"], queryFn: () => api.metric("icr") });
  const trends = useQuery({ queryKey: ["m", "trends"], queryFn: () => api.metric("trends") });
  const large = useQuery({ queryKey: ["m", "large-claims"], queryFn: () => api.metric("large-claims") });
  const relation = useQuery({ queryKey: ["m", "relation"], queryFn: () => api.metric("relation") });
  const hospital = useQuery({ queryKey: ["m", "hospital"], queryFn: () => api.metric("hospital") });
  const ailment = useQuery({ queryKey: ["m", "ailment"], queryFn: () => api.metric("ailment") });

  if (claims.isLoading) return <><SectionHeader title="Claims Drivers" subtitle="What is driving renewal cost" /><Skeleton rows={4} /></>;
  if (claims.isError) return <><SectionHeader title="Claims Drivers" /><ErrorState onRetry={() => claims.refetch()} /></>;

  const status = claims.data?.data_quality_status || "No Data";
  if (status === "No Data")
    return <><SectionHeader title="Claims Drivers" /><EmptyState message="No activated governed data yet. Complete Data Onboarding to surface claim cost drivers." /></>;

  const c = claims.data.value || {};
  const blocked = claims.data.advisory_blocked;
  const largeVal = large.data?.value;
  const yoy = (trends.data?.value?.yoy || []).slice(-1)[0];
  const rel = relation.data?.value;
  const hosp = hospital.data?.value;
  const ail = ailment.data?.value;

  const statusSplit = c.status_split
    ? Object.entries(c.status_split).map(([k, v]) => ({ status: k, count: v })) : [];

  return (
    <div className="space-y-5">
      <SectionHeader title="Claims Drivers" subtitle="Frequency vs severity, movement, and the cohorts driving renewal risk"
        right={<DataQualityBadge status={status} />} />
      <RestrictedBanner blocked={blocked} />
      <CaveatBanner caveats={claims.data.caveats} />
      <DecisionSummary title="Renewal cost is frequency times severity — shown separately, never hidden in one average" points={[
        `Frequency: ${fmtNumber(c.claim_count)} claims. Severity: ${fmtCurrency(c.average_claim_size)} average claim.`,
        `Incurred ${fmtCurrency(c.incurred)} (paid ${fmtCurrency(c.paid)} + outstanding ${fmtCurrency(c.outstanding)}).`,
      ]} />

      {/* Frequency vs severity */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Claim frequency" value={fmtNumber(c.claim_count)} sub="Number of claims"
          badge={<DataQualityBadge status={status} />}
          onEvidence={() => setEv({ title: "Claims evidence", data: claims.data })} />
        <KpiCard label="Average severity" value={fmtCurrency(c.average_claim_size)} sub="Mean claim size" />
        <KpiCard label="Total incurred" value={fmtCurrency(c.incurred)} sub="Paid plus outstanding" />
      </div>

      {/* Paid vs outstanding movement */}
      <Card className="p-4">
        <div className="text-sm font-medium mb-2">Paid vs outstanding movement</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><div className="text-xs text-muted">Paid</div><div className="text-xl font-semibold">{fmtCurrency(c.paid)}</div></div>
          <div><div className="text-xs text-muted">Outstanding</div><div className="text-xl font-semibold">{fmtCurrency(c.outstanding)}</div></div>
          <div><div className="text-xs text-muted">Paid : outstanding ratio</div><div className="text-xl font-semibold">{fmtValue(c.paid_outstanding_ratio)}</div></div>
        </div>
        {yoy && (
          <p className="text-xs text-muted mt-2">
            Year-on-year: paid {fmtPercent(yoy.paid_pct)}, incurred {fmtPercent(yoy.incurred_pct)}, claim count {fmtPercent(yoy.claim_count_pct)} (from governed trends).
          </p>
        )}
      </Card>

      {/* Large-claim effect */}
      {largeVal && (
        <Card className="p-4 border-l-4 border-l-amber-400">
          <div className="text-sm font-medium mb-2">Large-claim effect</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div><div className="text-xs text-muted">Large claims</div><div className="text-xl font-semibold" data-testid="cd-large-count">{fmtNumber(largeVal.large_claim_count)}</div></div>
            <div><div className="text-xs text-muted">Large-claim incurred</div><div className="text-xl font-semibold">{fmtCurrency(largeVal.large_claim_incurred)}</div></div>
            <div><div className="text-xs text-muted">Share of incurred</div><div className="text-xl font-semibold">{fmtShare(largeVal.large_claim_incurred_share)}</div></div>
          </div>
        </Card>
      )}

      {/* Claim type + status split */}
      <Card className="p-4">
        <div className="text-sm font-medium mb-2">Claim type and status split</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
          <div><div className="text-xs text-muted">Cashless</div><div className="text-lg font-semibold">{fmtNumber(c.cashless_count)}</div></div>
          <div><div className="text-xs text-muted">Reimbursement</div><div className="text-lg font-semibold">{fmtNumber(c.reimbursement_count)}</div></div>
          <div><div className="text-xs text-muted">Open</div><div className="text-lg font-semibold">{fmtNumber(c.open_claims)}</div></div>
          <div><div className="text-xs text-muted">Closed</div><div className="text-lg font-semibold">{fmtNumber(c.closed_claims)}</div></div>
        </div>
        {statusSplit.length > 0 && (
          <MiniTrend series={statusSplit} columns={[
            { key: "status", label: "Claim status" },
            { key: "count", label: "Claims", fmt: (v) => fmtNumber(v) },
          ]} />
        )}
      </Card>

      {/* Relation-wise impact */}
      <DimensionSection title="Relation-wise impact" subtitle="Who is driving the spend — self, spouse, children, parents"
        q={relation} rows={rel?.groups || []} testid="cd-relation"
        columns={[
          { key: "key", label: "Relation" },
          { key: "count", label: "Claims", fmt: (v) => fmtNumber(v) },
          { key: "incurred", label: "Incurred", fmt: (v) => fmtCurrency(v) },
          { key: "incurred_share", label: "Share", fmt: (v) => fmtShare(v) },
        ]}
        footer={rel?.parent_claim_share != null && (
          <p className="text-xs text-muted mt-2">Parent (Father + Mother) share of incurred: <b>{fmtShare(rel.parent_claim_share)}</b>.</p>
        )} />

      {/* Hospital concentration */}
      <DimensionSection title="Hospital concentration" subtitle="Where cost is concentrated, and network vs non-network"
        q={hospital} rows={hosp?.top_hospitals || []} testid="cd-hospital"
        columns={[
          { key: "key", label: "Hospital" },
          { key: "count", label: "Claims", fmt: (v) => fmtNumber(v) },
          { key: "incurred", label: "Incurred", fmt: (v) => fmtCurrency(v) },
          { key: "incurred_share", label: "Share", fmt: (v) => fmtShare(v) },
        ]}
        footer={hosp && (
          <p className="text-xs text-muted mt-2">
            Top-hospital concentration: <b>{fmtShare(hosp.top_hospital_concentration)}</b>. Network {fmtNumber(hosp.network_count)}, non-network {fmtNumber(hosp.non_network_count)}.
          </p>
        )} />

      {/* Ailment cost drivers */}
      <DimensionSection title="Ailment cost drivers" subtitle="Conditions responsible for incurred spend; recurring flagged"
        q={ailment} rows={ail?.top_ailments || []} testid="cd-ailment"
        columns={[
          { key: "key", label: "Ailment" },
          { key: "count", label: "Claims", fmt: (v) => fmtNumber(v) },
          { key: "incurred", label: "Incurred", fmt: (v) => fmtCurrency(v) },
          { key: "incurred_share", label: "Share", fmt: (v) => fmtShare(v) },
          { key: "recurring_indicator", label: "Recurring", fmt: (v) => (v ? "Yes" : "—") },
        ]} />

      <DecisionSummary title="What is driving renewal risk" points={[
        rel?.groups?.length ? `Highest-cost relation cohort: ${rel.groups[0].key} (${fmtShare(rel.groups[0].incurred_share)} of incurred).` : "Relation concentration not yet available.",
        hosp?.top_hospitals?.length ? `Cost is concentrated — top hospital holds ${fmtShare(hosp.top_hospital_concentration)} of incurred.` : "Hospital concentration not yet available.",
        ail?.top_ailments?.length ? `Leading ailment driver: ${ail.top_ailments[0].key} (${fmtShare(ail.top_ailments[0].incurred_share)}).` : "Ailment drivers not yet available.",
      ]} />

      <FourQuestions
        soWhat={`${fmtNumber(c.claim_count)} claims at ${fmtCurrency(c.average_claim_size)} average are pushing incurred to ${fmtCurrency(c.incurred)} — the renewal-pressure base.`}
        why="Drivers are broken out by frequency vs severity, relation, hospital and ailment so the cause is visible, not averaged away."
        next="Take the top relation/hospital/ailment drivers into the Savings Sandbox and Balanced Benefit Design to test targeted levers."
        trust={`Every number is from governed metric APIs (claims, large-claims, relation, hospital, ailment, trends); data quality ${status}. Missing dimensions show an explicit empty state, never a fabricated zero.`} />

      <button className="text-xs font-medium text-brand hover:underline"
        onClick={() => setEv({ title: "Claims driver evidence", data: claims.data })}>View evidence →</button>
      <EvidenceDrawer open={!!ev} onClose={() => setEv(null)} title={ev?.title} evidence={ev?.data || null} />
    </div>
  );
}
