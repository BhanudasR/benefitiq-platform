import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtPercent } from "../lib/format";
import {
  SectionHeader, Card, DecisionSummary, DataQualityBadge, CaveatBanner,
  RestrictedBanner, Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { EvidenceDrawer, MiniTrend } from "../components/ui/sandbox";

const pick = (o: any, keys: string[]) => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

/** Renewal › Placement Trigger / Next Best Action — should we go to market or defend
 *  the incumbent, and what is the single next best broker action. The trigger call is
 *  a governed backend output; this screen composes the governed evidence (ICR,
 *  adjusted ICR, large-claim review) behind it. No browser-side decision math. */
export function PlacementTrigger() {
  const [ev, setEv] = useState<{ title: string; data: any } | null>(null);
  const icr = useQuery({ queryKey: ["m", "icr"], queryFn: () => api.metric("icr") });
  const large = useQuery({ queryKey: ["m", "large-claims"], queryFn: () => api.metric("large-claims") });
  const adjusted = useQuery({ queryKey: ["s", "adjusted-icr"], queryFn: () => api.simulation("adjusted-icr") });

  if (icr.isLoading) return <><SectionHeader title="Placement Trigger / Next Best Action" subtitle="Governed placement decision" /><Skeleton rows={4} /></>;
  if (icr.isError) return <><SectionHeader title="Placement Trigger / Next Best Action" /><ErrorState onRetry={() => icr.refetch()} /></>;

  const status = icr.data?.data_quality_status || "No Data";
  if (status === "No Data")
    return <><SectionHeader title="Placement Trigger / Next Best Action" /><EmptyState message="No activated governed data yet. Complete Data Onboarding to build the placement decision." /></>;

  const iv = icr.data.value || {};
  const adj = adjusted.data?.value;
  const largeClaims = large.data?.value?.large_claims || [];
  const blocked = icr.data.advisory_blocked || adjusted.data?.advisory_blocked;
  const adjLine = adj ? `; Adjusted / Defendable ICR ${fmtPercent(adj.adjusted_icr)} once one-off claims are set aside` : "";

  // governed placement fields — displayed only if the backend supplies them
  const pv = icr.data.value || {};
  const triggered = pick(pv, ["placement_recommended", "trigger_placement"]);
  const triggerReason = pick(pv, ["placement_reason", "trigger_reason"]);
  const incumbentVsRfq = pick(pv, ["incumbent_vs_rfq", "placement_route"]);
  const nextBestAction = pick(pv, ["next_best_action", "recommended_action"]);
  const hasGovernedTrigger = triggered !== undefined || nextBestAction !== undefined;

  return (
    <div className="space-y-5">
      <SectionHeader title="Placement Trigger / Next Best Action" subtitle="Governed placement decision — defend or go to market"
        right={<DataQualityBadge status={status} />} />
      <RestrictedBanner blocked={blocked} />
      <CaveatBanner caveats={icr.data.caveats} />

      <DecisionSummary title="Should this renewal trigger a placement?" points={[
        `Operational ICR ${fmtPercent(iv.operational_icr)}${adjLine}.`,
        largeClaims.length > 0
          ? `${largeClaims.length} large claim(s) flagged for one-off review — these strengthen an incumbent-defence conversation before going to market.`
          : "No large one-off claims flagged; the loss ratio is broad-based rather than event-driven.",
      ]} />

      <Card className="p-5 border-l-4 border-l-brand">
        <div className="text-xs font-semibold uppercase tracking-wide text-brand mb-1">Placement decision</div>
        {hasGovernedTrigger ? (
          <>
            <h3 className="text-base font-semibold text-ink">
              {triggered !== undefined ? (triggered ? "Trigger placement — go to market" : "Do not trigger — defend the incumbent") : "Governed placement recommendation"}
            </h3>
            {incumbentVsRfq && <div className="text-sm text-ink mt-1">Route: <b>{String(incumbentVsRfq)}</b></div>}
            {triggerReason && <p className="text-sm text-muted mt-1">{String(triggerReason)}</p>}
            {nextBestAction && (
              <div className="mt-3 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-good">Next best broker action: </span>
                <span className="text-ink">{String(nextBestAction)}</span>
              </div>
            )}
          </>
        ) : (
          <>
            <h3 className="text-base font-semibold text-ink">Governed trigger pending placement endpoint</h3>
            <p className="text-sm text-muted mt-1 max-w-2xl">
              Whether to trigger placement, defend the incumbent or run an RFQ is a governed backend output,
              not a browser calculation. The insurer-negotiation evidence below is live now; the explicit
              trigger and next best action surface once the placement endpoint returns them.
            </p>
          </>
        )}
      </Card>

      {largeClaims.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-medium mb-2">Insurer negotiation evidence — large one-off claims</div>
          <MiniTrend series={largeClaims} columns={[
            { key: "claim_number", label: "Claim" },
            { key: "policy_year", label: "Year" },
            { key: "incurred", label: "Incurred", fmt: fmtCurrency },
            { key: "one_off_review_candidate", label: "One-off candidate", fmt: (v) => (v ? "Yes" : "—") },
          ]} />
        </Card>
      )}

      <FourQuestions
        soWhat={hasGovernedTrigger ? "A governed placement decision is available below." : "Whether to defend the incumbent or go to market is a governed backend decision; the evidence for it is live now."}
        why={largeClaims.length > 0 ? `${largeClaims.length} large one-off claim(s) strengthen an incumbent-defence case before any RFQ.` : "Loss experience is broad-based rather than event-driven, which shapes the placement approach."}
        next="Use the large-claim evidence to defend the incumbent first; trigger an RFQ only if the governed decision recommends it."
        trust={`Evidence from governed ICR, adjusted-ICR and large-claims APIs on ${status} data. The placement trigger is never computed in the browser — a pending-state is shown until the backend provides it.`} />

      <button className="text-xs font-medium text-brand hover:underline"
        onClick={() => setEv({ title: "Placement evidence", data: icr.data })}>
        View evidence &amp; caveats →
      </button>
      <EvidenceDrawer open={!!ev} onClose={() => setEv(null)} title={ev?.title} evidence={ev?.data || null} />
    </div>
  );
}
