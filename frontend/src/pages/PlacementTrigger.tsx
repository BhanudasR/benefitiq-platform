import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtPercent, fmtShare } from "../lib/format";
import {
  SectionHeader, Card, DecisionSummary, DataQualityBadge, CaveatBanner,
  RestrictedBanner, Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { EvidenceDrawer, MiniTrend } from "../components/ui/sandbox";

const TRIGGER_STYLE: Record<string, string> = {
  yes: "bg-red-50 text-bad border-red-200",
  no: "bg-green-50 text-good border-green-200",
  review: "bg-amber-50 text-warn border-amber-200",
};

/** Renewal › Placement Trigger / Next Best Action — single-sourced from the governed
 *  /recommendations/placement-trigger engine (Sprint 10). The trigger decision, scores,
 *  reason, negotiation evidence and next best action are all rendered from the API.
 *  No decision is computed in the browser. */
export function PlacementTrigger() {
  const [ev, setEv] = useState(false);
  const q = useQuery({ queryKey: ["reco", "placement-trigger"], queryFn: () => api.recommendation("placement-trigger") });

  if (q.isLoading) return <><SectionHeader title="Placement Trigger / Next Best Action" subtitle="Governed placement decision" /><Skeleton rows={4} /></>;
  if (q.isError) return <><SectionHeader title="Placement Trigger / Next Best Action" /><ErrorState onRetry={() => q.refetch()} /></>;

  const d = q.data || {};
  const status = d.data_quality_status || "No Data";
  if (status === "No Data")
    return <><SectionHeader title="Placement Trigger / Next Best Action" /><EmptyState title="Placement decision pending governed data"
      message="No activated governed data yet. Complete Data Onboarding to generate the placement decision." /></>;

  const triggered = String(d.placement_triggered ?? "review");
  const ne = d.negotiation_evidence || {};
  const oneOff: any[] = ne.one_off_claims || [];
  const reasoning: any[] = d.reasoning || [];
  const nba = d.next_best_action;
  const scorePart = d.confidence_score != null ? ` · score ${d.confidence_score}` : "";
  const confLine = `Confidence ${d.confidence} · reliability ${d.reliability}${scorePart}.`;

  return (
    <div className="space-y-5">
      <SectionHeader title="Placement Trigger / Next Best Action" subtitle="Governed placement decision — defend or go to market"
        right={<DataQualityBadge status={status} />} />
      <RestrictedBanner blocked={d.advisory_blocked} />
      <CaveatBanner caveats={d.caveats} />

      <DecisionSummary title={String(d.recommendation)} points={[d.summary || "Governed placement decision.", confLine]} />

      {/* Trigger decision + scores */}
      <Card className="p-5 border-l-4 border-l-brand">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand">Placement decision</div>
          <span data-testid="pt-triggered"
            className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full border ${TRIGGER_STYLE[triggered] || "bg-slate-100 text-muted border-line"}`}>
            {triggered}
          </span>
        </div>
        <h3 className="text-base font-semibold text-ink mt-1">{String(d.recommendation)}</h3>
        {d.trigger_reason && <p className="text-sm text-muted mt-1" data-testid="pt-reason">{String(d.trigger_reason)}</p>}
        <div className="grid grid-cols-2 gap-4 mt-3">
          <div><div className="text-xs text-muted">Incumbent defence score</div>
            <div className="text-xl font-semibold" data-testid="pt-defence">{d.incumbent_defence_score != null ? String(d.incumbent_defence_score) : "—"}</div></div>
          <div><div className="text-xs text-muted">RFQ readiness</div>
            <div className="text-xl font-semibold" data-testid="pt-rfq">{d.rfq_readiness != null ? String(d.rfq_readiness) : "—"}</div></div>
        </div>
        <div className="mt-3 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-good">Next best action: </span>
          <span className="text-ink" data-testid="pt-nba">{nba ? String(nba.explanation) : "—"}</span>
        </div>
      </Card>

      {/* Negotiation evidence */}
      <Card className="p-4" >
        <div className="text-sm font-medium mb-2">Insurer negotiation evidence</div>
        <div data-testid="pt-negotiation-evidence" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><div className="text-xs text-muted">Operational ICR</div>
            <div className="text-lg font-semibold" data-testid="pt-op-icr">{fmtPercent(ne.operational_icr ?? d.operational_icr)}</div></div>
          <div><div className="text-xs text-muted">{"Adjusted / Defendable ICR"}</div>
            <div className="text-lg font-semibold text-warn" data-testid="pt-adj-icr">{fmtPercent(ne.adjusted_icr ?? d.adjusted_icr)}</div></div>
          <div><div className="text-xs text-muted">Large one-off share</div>
            <div className="text-lg font-semibold">{fmtShare(ne.large_claim_incurred_share)}</div></div>
        </div>
        {oneOff.length > 0 && (
          <div className="mt-3">
            <MiniTrend series={oneOff} columns={[
              { key: "claim_number", label: "Claim" },
              { key: "policy_year", label: "Year" },
              { key: "incurred", label: "Incurred", fmt: fmtCurrency },
              { key: "one_off_review_candidate", label: "One-off candidate", fmt: (v) => (v ? "Yes" : "—") },
            ]} />
          </div>
        )}
        {ne.note && <p className="text-xs text-muted mt-2">{String(ne.note)}</p>}
      </Card>

      {/* Reasoning + confidence */}
      {reasoning.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-medium mb-2">Why this decision</div>
          <ul className="list-disc pl-5 text-sm text-ink/80 space-y-1" data-testid="pt-reasoning">
            {reasoning.map((r, i) => <li key={i}>{r.explanation}</li>)}
          </ul>
        </Card>
      )}

      <FourQuestions
        soWhat={`Placement decision: ${triggered} — ${String(d.recommendation)}.`}
        why={reasoning.length > 0 ? String(reasoning[0].explanation) : "Weighted from governed incumbent-defence and RFQ-readiness signals."}
        next={nba ? String(nba.explanation) : "Follow the governed next best action once available."}
        trust={`Rendered from the governed /recommendations/placement-trigger engine on ${status} data — the trigger is never computed in the browser. Operational ICR stays separate from the Adjusted / Defendable view.`} />

      <button className="text-xs font-medium text-brand hover:underline" onClick={() => setEv(true)}>View evidence &amp; caveats →</button>
      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="Placement decision evidence" evidence={ev ? d : null} />
    </div>
  );
}
