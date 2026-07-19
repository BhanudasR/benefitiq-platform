import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtPercent } from "../lib/format";
import {
  SectionHeader, Card, DecisionSummary, DataQualityBadge, CaveatBanner,
  RestrictedBanner, Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { EvidenceDrawer, LeverClassificationBadge } from "../components/ui/sandbox";

/** Renewal › Recommended Strategy — single-sourced from the governed
 *  /recommendations/renewal engine (Sprint 10). The stance and every supporting field
 *  are rendered straight from the API. Nothing is computed in the browser; Operational
 *  ICR is shown separately from the Adjusted / Defendable view and never replaced. */
export function RecommendedStrategy() {
  const [ev, setEv] = useState(false);
  const q = useQuery({ queryKey: ["reco", "renewal"], queryFn: () => api.recommendation("renewal") });

  if (q.isLoading) return <><SectionHeader title="Recommended Strategy" subtitle="Governed renewal negotiation position" /><Skeleton rows={4} /></>;
  if (q.isError) return <><SectionHeader title="Recommended Strategy" /><ErrorState onRetry={() => q.refetch()} /></>;

  const d = q.data || {};
  const status = d.data_quality_status || "No Data";
  if (status === "No Data")
    return <><SectionHeader title="Recommended Strategy" /><EmptyState title="Recommendation pending governed data"
      message="No activated governed data yet. Complete Data Onboarding to generate the renewal recommendation." /></>;

  const reasoning: any[] = d.reasoning || [];
  const talking: string[] = d.talking_points || [];
  const sources: string[] = d.source_metrics_used || [];
  const employer = d.employer_impact || {};
  const employee = d.employee_impact || {};
  const nba = d.next_best_action;
  const scorePart = d.confidence_score != null ? ` · score ${d.confidence_score}` : "";
  const confLine = `Confidence ${d.confidence} · reliability ${d.reliability}${scorePart}.`;

  return (
    <div className="space-y-5">
      <SectionHeader title="Recommended Strategy" subtitle="Governed renewal negotiation position"
        right={<DataQualityBadge status={status} />} />
      <RestrictedBanner blocked={d.advisory_blocked} />
      <CaveatBanner caveats={d.caveats} />

      <DecisionSummary title={String(d.recommendation)} points={[
        d.summary || "Governed renewal recommendation.",
        confLine,
      ]} />

      {/* Stance + confidence */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 border-l-4 border-l-brand">
          <div className="text-xs uppercase tracking-wide text-muted">Recommended stance</div>
          <div className="text-2xl font-semibold mt-1" data-testid="rs-stance">{String(d.recommendation)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Confidence</div>
          <div className="text-2xl font-semibold mt-1" data-testid="rs-confidence">{String(d.confidence)}</div>
          <div className="text-xs text-muted mt-1">reliability {String(d.reliability)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Source metrics used</div>
          <div className="mt-1 flex flex-wrap gap-1" data-testid="rs-source-metrics">
            {sources.length > 0 ? sources.map((s) => (
              <span key={s} className="text-[11px] text-muted bg-brandSoft border border-line rounded-full px-2 py-0.5">{s}</span>
            )) : <span className="text-xs text-muted">—</span>}
          </div>
        </Card>
      </div>

      {/* Reasoning */}
      {reasoning.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-medium mb-2">Why this recommendation</div>
          <ul className="list-disc pl-5 text-sm text-ink/80 space-y-1" data-testid="rs-reasoning">
            {reasoning.map((r, i) => <li key={i}>{r.explanation}</li>)}
          </ul>
        </Card>
      )}

      {/* Operational vs Adjusted / Defendable ICR (from the recommendation response) */}
      <Card className="p-4">
        <div className="text-sm font-medium mb-2">{"Operational vs Adjusted / Defendable ICR"}</div>
        <div className="grid grid-cols-2 gap-4">
          <div><div className="text-xs text-muted">Operational ICR (unchanged)</div>
            <div className="text-xl font-semibold" data-testid="rs-op-icr">{fmtPercent(d.operational_icr)}</div></div>
          <div><div className="text-xs text-muted">{"Adjusted / Defendable ICR"}</div>
            <div className="text-xl font-semibold text-warn" data-testid="rs-adj-icr">{fmtPercent(d.adjusted_icr)}</div></div>
        </div>
        {d.adjusted_icr_note && <p className="text-xs text-muted mt-2">{String(d.adjusted_icr_note)}</p>}
      </Card>

      {/* Employer / employee impact */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-sm font-medium mb-2">Employer impact — defensible saving levers</div>
          <div data-testid="rs-employer">
            {(employer.defensible_levers || []).length > 0 ? (
              <ul className="space-y-2">
                {employer.defensible_levers.map((l: any) => (
                  <li key={l.lever} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink capitalize">{String(l.lever).split("_").join(" ")}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-ink font-medium">{fmtCurrency(l.expected_saving)}</span>
                      <LeverClassificationBadge classification={l.classification} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : <div className="text-sm text-muted">No low-friction levers scored yet.</div>}
          </div>
          {employer.note && <p className="text-xs text-muted mt-2">{String(employer.note)}</p>}
        </Card>
        <Card className="p-4">
          <div className="text-sm font-medium mb-2">Employee impact — handle with care</div>
          <div data-testid="rs-employee">
            {(employee.high_friction_levers || []).length > 0 ? (
              <ul className="space-y-2">
                {employee.high_friction_levers.map((l: any) => (
                  <li key={l.lever} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink capitalize">{String(l.lever).split("_").join(" ")}</span>
                    <LeverClassificationBadge classification={l.classification} />
                  </li>
                ))}
              </ul>
            ) : <div className="text-sm text-muted">No high-friction levers flagged.</div>}
          </div>
          {employee.note && <p className="text-xs text-muted mt-2">{String(employee.note)}</p>}
        </Card>
      </div>

      {/* Talking points + next best action */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-sm font-medium mb-2">Broker talking points</div>
          {talking.length > 0 ? (
            <ul className="list-disc pl-5 text-sm text-ink/80 space-y-1" data-testid="rs-talking-points">
              {talking.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          ) : <div className="text-sm text-muted" data-testid="rs-talking-points">—</div>}
        </Card>
        <Card className="p-4 border-l-4 border-l-green-400">
          <div className="text-xs font-semibold uppercase tracking-wide text-good mb-1">Next best action</div>
          <div className="text-sm text-ink" data-testid="rs-nba">{nba ? String(nba.explanation) : "—"}</div>
          <div className="text-xs text-muted mt-2">Basis: {String(d.threshold_basis || d.config_version || "governed defaults")}</div>
        </Card>
      </div>

      <FourQuestions
        soWhat={`Recommended stance: ${String(d.recommendation)} (${String(d.confidence)} confidence).`}
        why={reasoning.length > 0 ? String(reasoning[0].explanation) : "Composed by the governed renewal recommendation engine from ICR, adjusted ICR and scored levers."}
        next={nba ? String(nba.explanation) : "Follow the governed next best action once available."}
        trust={`Every field is rendered from the governed /recommendations/renewal engine on ${status} data — no decision is computed in the browser. Operational ICR is shown separately from the Adjusted / Defendable view.`} />

      <button className="text-xs font-medium text-brand hover:underline" onClick={() => setEv(true)}>View evidence &amp; caveats →</button>
      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="Renewal recommendation evidence" evidence={ev ? d : null} />
    </div>
  );
}
