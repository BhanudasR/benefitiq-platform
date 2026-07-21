import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtValue, fmtNumber } from "../lib/format";
import {
  SectionHeader, Card, DecisionSummary, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { EvidenceDrawer } from "../components/ui/sandbox";

/** Placement Intelligence sub-tabs — single-sourced from the governed Sprint 18 /placement/*
 *  composition APIs. The decision is REUSED from the placement-trigger engine; nothing is
 *  computed in the browser and no insurer quotes/pricing are ever fabricated. */

const STATE_STYLE: Record<string, string> = {
  yes: "bg-amber-50 text-warn border-amber-200",
  no: "bg-green-50 text-good border-green-200",
  review: "bg-slate-100 text-muted border-line",
};
const STATE_LABEL: Record<string, string> = {
  yes: "Trigger placement / RFQ",
  no: "Defend incumbent",
  review: "Review with Placement Head",
};

function StateBadge({ state }: { state: string }) {
  const s = String(state || "review");
  return <span data-testid="pm-state-badge"
    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATE_STYLE[s] || STATE_STYLE.review}`}>
    {STATE_LABEL[s] || "Review"}</span>;
}

function SourceBasis({ d }: { d: any }) {
  const sources: string[] = d.source_basis || [];
  if (sources.length === 0) return null;
  return (
    <div data-testid="pm-source-basis" className="text-xs text-muted bg-brandSoft border border-line rounded-xl2 px-4 py-2">
      <span className="font-medium">Source basis: </span>{sources.join("; ")}
      {d.reuses_engine ? <span>{" · reuses "}{String(d.reuses_engine)}</span> : null}
    </div>
  );
}

function usePlace(kind: string) {
  return useQuery({ queryKey: ["placement", kind], queryFn: () => api.placement(kind).then((r) => r ?? null) });
}

function PlacementFrame({ title, subtitle, q, evidenceTitle, children }:
  { title: string; subtitle: string; q: any; evidenceTitle: string; children: (d: any) => React.ReactNode }) {
  const [ev, setEv] = useState(false);
  if (q.isLoading) return <><SectionHeader title={title} subtitle={subtitle} /><Skeleton rows={4} /></>;
  if (q.isError) return <><SectionHeader title={title} /><ErrorState onRetry={() => q.refetch()} /></>;
  const d = q.data;
  if (!d) return <><SectionHeader title={title} /><EmptyState title="Placement pending governed data"
    message="No governed placement view available yet. Complete Data Onboarding and confirm policy terms to assess placement." /></>;
  return (
    <div className="space-y-5">
      <SectionHeader title={title} subtitle={subtitle}
        right={d.data_quality_status ? <DataQualityBadge status={d.data_quality_status} /> : undefined} />
      <RestrictedBanner blocked={d.advisory_blocked} />
      <CaveatBanner caveats={d.caveats} />
      {children(d)}
      <SourceBasis d={d} />
      <button className="text-xs font-medium text-brand hover:underline" onClick={() => setEv(true)}>View evidence &amp; caveats →</button>
      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title={evidenceTitle} evidence={ev ? d : null} />
    </div>
  );
}

// ---- 1. Placement Overview -------------------------------------------------
export function PlacementOverview() {
  const q = usePlace("overview");
  return (
    <PlacementFrame title="Placement Overview" subtitle="Is the incumbent renewal defensible, or is it time to negotiate or go to market?" q={q} evidenceTitle="Placement overview evidence">
      {(d) => (
        <div data-testid="pm-overview" className="space-y-4">
          <DecisionSummary title={d.decision_summary || "Governed placement assessment."} points={[
            `Placement state: ${STATE_LABEL[String(d.placement_state)] || "review"}.`,
            `Incumbent-defence score ${fmtValue(d.incumbent_defence_score)} · RFQ readiness ${fmtValue(d.rfq_readiness)}.`,
          ]} />
          <div className="flex items-center gap-2"><StateBadge state={d.placement_state} />
            <span className="text-xs text-muted">{String(d.trigger_reason || "")}</span></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4"><div className="text-xs uppercase tracking-wide text-muted">Incumbent defence</div>
              <div className="text-2xl font-semibold mt-1" data-testid="pm-defence-score">{fmtValue(d.incumbent_defence_score)}</div></Card>
            <Card className="p-4"><div className="text-xs uppercase tracking-wide text-muted">Terms to protect</div>
              <div className="text-2xl font-semibold mt-1" data-testid="pm-protect-count">{fmtNumber(d.terms_to_protect_count)}</div></Card>
            <Card className="p-4"><div className="text-xs uppercase tracking-wide text-muted">Benchmark gaps to raise</div>
              <div className="text-2xl font-semibold mt-1" data-testid="pm-gaps-count">{fmtNumber(d.benchmark_gaps_to_raise_count)}</div></Card>
          </div>
          <FourQuestions
            soWhat={`The governed placement state is "${STATE_LABEL[String(d.placement_state)] || "review"}".`}
            why="Reused from the renewal placement-trigger engine — incumbent-defence and RFQ-readiness scores are weighted from governed signals, not computed here."
            next="Review Incumbent Defence and RFQ Readiness, protect the listed terms and raise the benchmark gaps in the placement discussion."
            trust={`Governed on ${String(d.data_quality_status)} data; source: ${(d.source_basis || []).join("; ")}. Open evidence for the full trail.`} />
        </div>
      )}
    </PlacementFrame>
  );
}

// ---- 2. Incumbent Defence --------------------------------------------------
export function PlacementIncumbentDefence() {
  const q = usePlace("incumbent-defence");
  return (
    <PlacementFrame title="Incumbent Defence" subtitle="How defensible is staying with the incumbent, and on what evidence?" q={q} evidenceTitle="Incumbent defence evidence">
      {(d) => {
        const ne = d.negotiation_evidence || {};
        return (
          <div data-testid="pm-defence" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="p-4"><div className="text-xs uppercase tracking-wide text-muted">Defence score</div>
                <div className="text-2xl font-semibold mt-1">{fmtValue(d.incumbent_defence_score)}</div></Card>
              <Card className="p-4"><div className="text-xs uppercase tracking-wide text-muted">Operational ICR</div>
                <div className="text-2xl font-semibold mt-1">{fmtValue(ne.operational_icr ?? d.operational_icr)}</div>
                <div className="text-xs text-muted mt-1">Unchanged — reported figure</div></Card>
              <Card className="p-4"><div className="text-xs uppercase tracking-wide text-muted">{"Adjusted / Defendable ICR"}</div>
                <div className="text-2xl font-semibold mt-1">{fmtValue(ne.adjusted_icr ?? d.adjusted_icr)}</div>
                <div className="text-xs text-muted mt-1">Defensibility view — never replaces operational</div></Card>
            </div>
            <Card className="p-4">
              <div className="text-sm font-medium mb-2">Defence reasons</div>
              {(d.defence_reasons || []).length === 0
                ? <div className="text-sm text-muted">No governed defence reasons yet.</div>
                : <ul className="space-y-1 text-sm list-disc pl-5">{(d.defence_reasons || []).map((r: any, i: number) => (
                    <li key={i}>{String(r.explanation || r.rule)}</li>))}</ul>}
            </Card>
          </div>
        );
      }}
    </PlacementFrame>
  );
}

// ---- 3. RFQ Readiness ------------------------------------------------------
export function PlacementRfqReadiness() {
  const q = usePlace("rfq-readiness");
  return (
    <PlacementFrame title="RFQ Readiness" subtitle="Is going to market required, and what triggers it?" q={q} evidenceTitle="RFQ readiness evidence">
      {(d) => (
        <div data-testid="pm-rfq" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="p-4"><div className="text-xs uppercase tracking-wide text-muted">RFQ readiness</div>
              <div className="text-2xl font-semibold mt-1">{fmtValue(d.rfq_readiness)}</div></Card>
            <Card className="p-4"><div className="text-xs uppercase tracking-wide text-muted">Go to market required</div>
              <div className="text-2xl font-semibold mt-1" data-testid="pm-go-to-market">{d.go_to_market_required ? "Yes" : "No"}</div></Card>
          </div>
          <Card className="p-4"><div className="text-sm font-medium mb-1">Trigger basis</div>
            <div className="text-sm text-ink">{String(d.trigger_reason || "—")}</div></Card>
          {(d.next_best_actions || []).length > 0 && (
            <Card className="p-4"><div className="text-sm font-medium mb-2">Next best actions</div>
              <ul className="space-y-1 text-sm list-disc pl-5">{(d.next_best_actions || []).map((a: any, i: number) => (
                <li key={i}>{String(a.explanation || a.rule)}</li>))}</ul></Card>
          )}
        </div>
      )}
    </PlacementFrame>
  );
}

// ---- 4. Quote Comparison (governed pending) --------------------------------
export function PlacementQuoteComparison() {
  const q = usePlace("quote-comparison");
  return (
    <PlacementFrame title="Quote Comparison" subtitle="Compare insurer quotes and terms side by side" q={q} evidenceTitle="Quote comparison evidence">
      {(d) => (
        <div data-testid="pm-quote" className="space-y-4">
          {d.quote_data_available === false ? (
            <Card className="p-8 text-center">
              <div data-testid="pm-quote-pending">
                <div className="mx-auto w-10 h-10 rounded-full bg-brandSoft border border-line mb-3" />
                <h3 className="text-base font-semibold text-ink">Quote comparison pending</h3>
                <p className="text-sm text-muted mt-1">{String(d.message)}</p>
                {Array.isArray(d.expected_fields) && d.expected_fields.length > 0 && (
                  <div className="mt-3 text-xs text-muted">
                    <span className="font-medium">Expected comparison fields: </span>{d.expected_fields.join(", ")}
                  </div>
                )}
                <p className="text-[11px] text-muted mt-3">{String(d.note || "")}</p>
              </div>
            </Card>
          ) : (
            <Card className="p-6"><div className="text-sm text-muted">Governed quote data available.</div></Card>
          )}
        </div>
      )}
    </PlacementFrame>
  );
}

// ---- 5. Terms Comparison (benchmarking-sourced, claims-free) ---------------
export function PlacementTermsComparison() {
  const q = usePlace("terms-comparison");
  return (
    <PlacementFrame title="Terms Comparison" subtitle="Benefit terms to protect and benchmark gaps to raise in placement (benefit design & policy terms only)" q={q} evidenceTitle="Terms comparison evidence">
      {(d) => (
        <div data-testid="pm-terms" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="p-4"><div className="text-xs uppercase tracking-wide text-muted">Terms to protect</div>
              <div className="text-2xl font-semibold mt-1" data-testid="pm-terms-protect">{fmtNumber(d.terms_to_protect_count)}</div></Card>
            <Card className="p-4"><div className="text-xs uppercase tracking-wide text-muted">Benchmark gaps to raise</div>
              <div className="text-2xl font-semibold mt-1" data-testid="pm-terms-gaps">{fmtNumber(d.benchmark_gaps_count)}</div></Card>
          </div>
          <Card className="p-4">
            <div className="text-sm font-medium mb-2">Policy terms &amp; conditions ({fmtNumber((d.policy_terms || []).length)})</div>
            {(d.policy_terms || []).length === 0
              ? <div className="text-sm text-muted">No confirmed policy terms to compare yet.</div>
              : <div className="overflow-x-auto"><table className="w-full text-sm" data-testid="pm-terms-table">
                  <thead><tr className="text-left text-muted border-b border-line">
                    <th className="py-1.5 pr-4 font-medium">Feature</th><th className="py-1.5 pr-4 font-medium">Client</th>
                    <th className="py-1.5 pr-4 font-medium">Peer benchmark</th><th className="py-1.5 pr-4 font-medium">Classification</th></tr></thead>
                  <tbody>{(d.policy_terms || []).map((t: any) => (
                    <tr key={t.feature_id} className="border-b border-line/60">
                      <td className="py-2 pr-4 text-ink">{t.feature}</td>
                      <td className="py-2 pr-4">{t.client_value != null ? fmtValue(t.client_value) : (t.client_text || "—")}</td>
                      <td className="py-2 pr-4">{t.benchmark_value != null ? fmtValue(t.benchmark_value) : "—"}</td>
                      <td className="py-2 pr-4 text-xs text-muted">{String(t.classification)}</td>
                    </tr>))}</tbody></table></div>}
          </Card>
          {(d.linked_benchmark_actions || []).length > 0 && (
            <Card className="p-4"><div className="text-sm font-medium mb-2">Benchmark gaps already sent downstream ({fmtNumber((d.linked_benchmark_actions || []).length)})</div>
              <ul className="space-y-1 text-sm list-disc pl-5" data-testid="pm-linked-actions">{(d.linked_benchmark_actions || []).map((a: any, i: number) => (
                <li key={i}>{String(a.feature_name)} — {String(a.classification)} ({String(a.target_module)})</li>))}</ul></Card>
          )}
        </div>
      )}
    </PlacementFrame>
  );
}

// ---- 6. Recommendation (reuses placement-trigger engine) -------------------
export function PlacementRecommendation() {
  const q = usePlace("recommendation");
  return (
    <PlacementFrame title="Placement Recommendation" subtitle="Evidence-based placement action, reused from the governed placement-trigger engine" q={q} evidenceTitle="Placement recommendation evidence">
      {(d) => (
        <div data-testid="pm-recommendation" className="space-y-4">
          <DecisionSummary title={STATE_LABEL[String(d.recommendation)] || "Review with Placement Head"} points={[
            `Confidence ${String(d.confidence)} (${fmtValue(d.confidence_score)}) · reliability ${String(d.reliability)}.`,
            `Trigger basis: ${String(d.trigger_reason || "—")}.`,
          ]} />
          <div className="flex items-center gap-2"><StateBadge state={d.recommendation} />
            <span className="text-xs text-muted" data-testid="pm-rec-source">{"Source: "}{String(d.source)}</span></div>
          <Card className="p-4">
            <div className="text-sm font-medium mb-2">Reasons</div>
            {(d.reasoning || []).length === 0
              ? <div className="text-sm text-muted">No governed reasons yet.</div>
              : <ul className="space-y-1 text-sm list-disc pl-5">{(d.reasoning || []).map((r: any, i: number) => (
                  <li key={i}>{String(r.explanation || r.rule)}</li>))}</ul>}
            {d.next_best_action && (
              <div className="mt-3 text-sm"><span className="font-medium">Next best action: </span>
                {String(d.next_best_action.explanation || d.next_best_action.rule)}</div>
            )}
          </Card>
        </div>
      )}
    </PlacementFrame>
  );
}

// ---- 7. Evidence -----------------------------------------------------------
export function PlacementEvidence() {
  const q = usePlace("evidence/overview");
  return (
    <PlacementFrame title="Evidence" subtitle="Governed evidence, source basis and data-quality for the placement assessment" q={q} evidenceTitle="Placement evidence">
      {(d) => (
        <div data-testid="pm-evidence" className="space-y-4">
          <Card className="p-4">
            <div className="text-sm font-medium mb-2">Evidence summary</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted">Data quality: </span>{String(d.data_quality_status || "—")}</div>
              <div><span className="text-muted">Confidence: </span>{String(d.confidence || "—")} ({fmtValue(d.confidence_score)})</div>
              <div><span className="text-muted">Reliability: </span>{String(d.reliability || "—")}</div>
              <div><span className="text-muted">Reuses engine: </span>{String(d.reuses_engine || "—")}</div>
            </div>
          </Card>
          {Array.isArray(d.evidence_references) && d.evidence_references.length > 0 && (
            <Card className="p-4"><div className="text-sm font-medium mb-2">Evidence references</div>
              <ul className="space-y-1 text-sm list-disc pl-5">{d.evidence_references.map((r: any, i: number) => (
                <li key={i}>{String(r.source || r.metric || r.rule || JSON.stringify(r))}</li>))}</ul></Card>
          )}
        </div>
      )}
    </PlacementFrame>
  );
}
