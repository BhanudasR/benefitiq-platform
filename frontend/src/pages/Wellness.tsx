import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtShare } from "../lib/format";
import {
  SectionHeader, Card, DecisionSummary, DataQualityBadge, CaveatBanner,
  RestrictedBanner, Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { EvidenceDrawer } from "../components/ui/sandbox";

/** Wellness Intelligence sub-tabs — single-sourced from the governed Sprint 12
 *  /wellness/* APIs. Every field is rendered straight from the API; nothing is
 *  computed in the browser. Cohort-level and privacy-safe: k-anonymity suppression
 *  is surfaced, no individual is targeted, ROI is a tracking basis (not a guarantee). */

function PrivacyNote({ d }: { d: any }) {
  if (!d.suppressed_cohorts) return null;
  return (
    <div role="note" data-testid="wellness-privacy"
      className="bg-slate-50 border border-line rounded-xl2 px-4 py-3 text-sm text-muted">
      <b className="text-ink">Privacy:</b> {fmtNumber(d.suppressed_cohorts)} wellness cohort(s) were below the
      k-anonymity minimum (k ≥ {d.k_anonymity_min_cohort_size}) and are suppressed. Only cohort-level insights
      are shown; no individual employee is identified or targeted.
    </div>
  );
}

function confLine(d: any): string {
  const scorePart = d.confidence_score != null ? ` · score ${d.confidence_score}` : "";
  return `Confidence ${d.confidence} · reliability ${d.reliability}${scorePart}.`;
}

/** Shared frame: loading / error / pending states, header, governance banners, privacy
 *  note and evidence drawer. Content is rendered by the child render function. */
function WellnessFrame({ title, subtitle, q, evidenceTitle, children }:
  { title: string; subtitle: string; q: any; evidenceTitle: string; children: (d: any) => React.ReactNode }) {
  const [ev, setEv] = useState(false);
  if (q.isLoading) return <><SectionHeader title={title} subtitle={subtitle} /><Skeleton rows={4} /></>;
  if (q.isError) return <><SectionHeader title={title} /><ErrorState onRetry={() => q.refetch()} /></>;
  const d = q.data || {};
  const status = d.data_quality_status || "No Data";
  if (d.recommendation === "Pending" || status === "No Data")
    return <><SectionHeader title={title} /><EmptyState title="Wellness insight pending governed data"
      message="No activated governed claim data with mapped ailments yet. Complete Data Onboarding to generate wellness insight." /></>;

  return (
    <div className="space-y-5">
      <SectionHeader title={title} subtitle={subtitle} right={<DataQualityBadge status={status} />} />
      <RestrictedBanner blocked={d.advisory_blocked} />
      <CaveatBanner caveats={d.caveats} />
      <PrivacyNote d={d} />
      {children(d)}
      <button className="text-xs font-medium text-brand hover:underline" onClick={() => setEv(true)}>View evidence &amp; caveats →</button>
      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title={evidenceTitle} evidence={ev ? d : null} />
    </div>
  );
}

// ---- 1. Wellness Overview --------------------------------------------------
export function WellnessOverview() {
  const q = useQuery({ queryKey: ["wellness", "overview"], queryFn: () => api.wellness("overview") });
  return (
    <WellnessFrame title="Wellness Overview" subtitle="Population wellness posture from governed claim patterns" q={q} evidenceTitle="Wellness overview evidence">
      {(d) => {
        const cats = d.categories_present || [];
        const eng = d.engagement_baseline || {};
        return (
          <>
            <DecisionSummary title={String(d.recommendation)} points={[d.summary || "Governed wellness posture.", confLine(d)]} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="p-4"><div className="text-xs uppercase tracking-wide text-muted">Claims in scope</div>
                <div className="text-2xl font-semibold mt-1">{fmtNumber(d.population?.total_claims)}</div></Card>
              <Card className="p-4"><div className="text-xs uppercase tracking-wide text-muted">Preventable-category incurred</div>
                <div className="text-2xl font-semibold mt-1" data-testid="wo-preventable">{fmtCurrency(d.preventable_incurred)}</div></Card>
              <Card className="p-4"><div className="text-xs uppercase tracking-wide text-muted">Supportive-category incurred</div>
                <div className="text-2xl font-semibold mt-1">{fmtCurrency(d.supportive_incurred)}</div></Card>
            </div>
            <Card className="p-4">
              <div className="text-sm font-medium mb-2">Top wellness categories (claim-driven)</div>
              {cats.length > 0 ? (
                <div className="overflow-x-auto" data-testid="wo-categories">
                  <table className="w-full text-sm"><thead><tr className="text-left text-muted border-b border-line">
                    <th className="py-1.5 pr-4 font-medium">Category</th><th className="py-1.5 pr-4 font-medium">Claims</th>
                    <th className="py-1.5 pr-4 font-medium">Incurred</th><th className="py-1.5 pr-4 font-medium">Share</th>
                    <th className="py-1.5 pr-4 font-medium">Recurring</th></tr></thead>
                    <tbody>{cats.map((c: any) => (
                      <tr key={c.category_id} className="border-b border-line/60">
                        <td className="py-1.5 pr-4 text-ink">{c.label}</td>
                        <td className="py-1.5 pr-4">{fmtNumber(c.claim_count)}</td>
                        <td className="py-1.5 pr-4">{fmtCurrency(c.incurred)}</td>
                        <td className="py-1.5 pr-4">{fmtShare(c.share)}</td>
                        <td className="py-1.5 pr-4">{c.recurring ? "Yes" : "—"}</td>
                      </tr>))}</tbody></table>
                </div>
              ) : <div className="text-sm text-muted" data-testid="wo-categories">No wellness categories cleared the governed cutoffs yet.</div>}
            </Card>
            {(d.chronic_recurring_categories || []).length > 0 && (
              <Card className="p-4"><div className="text-sm font-medium mb-2">{"Chronic / recurring signal"}</div>
                <div className="flex flex-wrap gap-1" data-testid="wo-chronic">
                  {d.chronic_recurring_categories.map((c: string) => (
                    <span key={c} className="text-[11px] text-muted bg-brandSoft border border-line rounded-full px-2 py-0.5">{c}</span>
                  ))}</div></Card>
            )}
            <Card className="p-4 border-l-4 border-l-amber-400" >
              <div data-testid="wo-engagement"><div className="text-xs font-semibold uppercase tracking-wide text-warn mb-1">Engagement baseline — {String(eng.status || "pending")}</div>
                <p className="text-sm text-muted">{String(eng.note || "No wellness engagement data yet.")}</p></div>
            </Card>
            <FourQuestions
              soWhat={`${cats.length} wellness categor(ies) surface from governed claim patterns.`}
              why="Categories are mapped from claim diagnosis patterns, not generic templates; preventable vs supportive incurred frames where wellness can help."
              next="Review the Opportunity & Recommendation tab for ranked, cohort-level interventions."
              trust={`Rendered from /wellness/overview on ${d.data_quality_status} data; cohort-level only, k-anonymity enforced. No browser-side calculation.`} />
          </>
        );
      }}
    </WellnessFrame>
  );
}

// ---- 2. Opportunity & Recommendation --------------------------------------
export function WellnessOpportunity() {
  const q = useQuery({ queryKey: ["wellness", "recommendations"], queryFn: () => api.wellness("recommendations") });
  return (
    <WellnessFrame title="Opportunity & Recommendation" subtitle="Ranked, cohort-level wellness opportunities with governed interventions" q={q} evidenceTitle="Wellness recommendation evidence">
      {(d) => {
        const recs = d.recommendations || [];
        return (
          <>
            <DecisionSummary title={String(d.recommendation)} points={[d.summary || "Governed wellness recommendations.", confLine(d)]} />
            {recs.length === 0 ? (
              <Card className="p-6"><div className="text-sm text-muted" data-testid="or-opportunities">No governed wellness opportunities cleared the cutoffs for this scope.</div></Card>
            ) : (
              <div className="space-y-4" data-testid="or-opportunities">
                {recs.map((o: any) => (
                  <Card key={o.category_id} className="p-4" >
                    <div data-testid="or-item">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm font-semibold text-ink">{o.ailment_category}</div>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-brandSoft text-brand border-blue-200">{o.confidence} confidence</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
                        <div><div className="text-xs text-muted">Potential impact ({String(o.potential_impact?.label)})</div>
                          <div className="text-lg font-semibold">{fmtCurrency(o.potential_impact?.incurred)}</div>
                          <div className="text-xs text-muted">{fmtShare(o.potential_impact?.incurred_share)} of incurred</div></div>
                        <div><div className="text-xs text-muted">Affected cohort</div>
                          <div className="text-lg font-semibold">{fmtNumber(o.affected_cohort?.claim_count)} claims</div>
                          <div className="text-xs text-muted">cohort-level; no individual targeted</div></div>
                        <div><div className="text-xs text-muted">Claim driver</div>
                          <div className="text-sm text-ink">{(o.claim_driver?.top_diagnosis_codes || []).join(", ") || "—"}</div></div>
                      </div>
                      <div className="text-sm text-ink"><span className="text-xs font-semibold uppercase tracking-wide text-good">Suggested intervention: </span>{o.suggested_intervention}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 text-sm">
                        <div><span className="text-muted">Employer impact: </span>{o.employer_impact?.note}</div>
                        <div><span className="text-muted">Employee impact: </span>{o.employee_impact?.note}</div>
                      </div>
                      <div className="mt-2 text-sm"><span className="text-xs font-semibold uppercase tracking-wide text-brand">Next best action: </span>{o.next_best_action?.explanation}</div>
                      {(o.caveats || []).length > 0 && <div className="text-xs text-warn mt-1">{o.caveats.join(" ")}</div>}
                    </div>
                  </Card>
                ))}
              </div>
            )}
            <FourQuestions
              soWhat={recs.length > 0 ? `${recs.length} cohort-level wellness opportunit(y/ies) with governed interventions.` : "No opportunities cleared the governed cutoffs yet."}
              why="Each opportunity is derived from a governed claim pattern with a mapped intervention; impact is an estimate, not a guarantee."
              next="Sequence the interventions in the Wellness Planner and set the tracking basis in ROI & Impact Tracking."
              trust={`Rendered from /wellness/recommendations on ${d.data_quality_status} data; cohort-level only, no individual targeting, no medical advice.`} />
          </>
        );
      }}
    </WellnessFrame>
  );
}

// ---- 3. Wellness Planner ---------------------------------------------------
export function WellnessPlanner() {
  const q = useQuery({ queryKey: ["wellness", "planner"], queryFn: () => api.wellness("planner") });
  return (
    <WellnessFrame title="Wellness Planner" subtitle="Sequenced wellness plan across the renewal timeline (foundation)" q={q} evidenceTitle="Wellness planner evidence">
      {(d) => {
        const plan = d.plan || [];
        return (
          <>
            <DecisionSummary title={String(d.recommendation)} points={[d.summary || "Governed wellness plan foundation.", String(d.basis || "")]} />
            {d.foundation && (
              <div className="text-[11px] font-semibold uppercase tracking-wide text-warn" data-testid="wp-foundation">Foundation — dates & owners set during program setup</div>
            )}
            {plan.length === 0 ? (
              <Card className="p-6"><div className="text-sm text-muted" data-testid="wp-plan">No plan items yet — no wellness opportunities cleared the cutoffs.</div></Card>
            ) : (
              <div className="space-y-3" data-testid="wp-plan">
                {plan.map((p: any) => (
                  <Card key={p.sequence} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="text-lg font-semibold text-brand">{fmtNumber(p.sequence)}</div>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-ink">{p.category}</div>
                        <div className="text-sm text-muted">{p.intervention}</div>
                        <div className="text-xs text-muted mt-1">Target cohort: {fmtNumber(p.target_cohort?.claim_count)} claims · {p.milestone} · Owner: {p.owner}</div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
            <FourQuestions
              soWhat={`${plan.length} sequenced intervention(s) form the wellness plan foundation.`}
              why="The plan is sequenced from governed wellness opportunities across the renewal timeline."
              next="Assign owners and dates during program setup, then track impact in ROI & Impact Tracking."
              trust={`Rendered from /wellness/planner on ${d.data_quality_status} data — a foundation scaffold, no fabricated dates.`} />
          </>
        );
      }}
    </WellnessFrame>
  );
}

// ---- 4. ROI & Impact Tracking ---------------------------------------------
export function WellnessRoi() {
  const q = useQuery({ queryKey: ["wellness", "roi-impact"], queryFn: () => api.wellness("roi-impact") });
  return (
    <WellnessFrame title="ROI & Impact Tracking" subtitle="Governed tracking basis for wellness impact (foundation)" q={q} evidenceTitle="Wellness ROI evidence">
      {(d) => {
        const tracking = d.tracking || [];
        return (
          <>
            <DecisionSummary title={String(d.recommendation)} points={[d.summary || "Governed ROI tracking basis.", confLine(d)]} />
            <Card className="p-4 border-l-4 border-l-amber-400">
              <div className="text-xs font-semibold uppercase tracking-wide text-warn mb-1">ROI basis</div>
              <div className="text-sm text-ink" data-testid="roi-label">{String(d.roi_label)}</div>
              <div className="text-xs text-muted mt-1" data-testid="roi-actuals">Actuals: {String(d.actuals_status)}</div>
            </Card>
            {tracking.length === 0 ? (
              <Card className="p-6"><div className="text-sm text-muted" data-testid="roi-tracking">No tracking basis yet — no wellness opportunities cleared the cutoffs.</div></Card>
            ) : (
              <div className="space-y-3" data-testid="roi-tracking">
                {tracking.map((t: any, i: number) => (
                  <Card key={i} className="p-4">
                    <div className="text-sm font-semibold text-ink mb-1">{t.category}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                      <div><div className="text-xs text-muted">Baseline incurred</div><div className="font-semibold">{fmtCurrency(t.baseline?.incurred)}</div></div>
                      <div><div className="text-xs text-muted">Baseline claims</div><div className="font-semibold">{fmtNumber(t.baseline?.claim_count)}</div></div>
                      <div><div className="text-xs text-muted">Tracking metric</div><div className="text-ink">{t.tracking_metric}</div></div>
                    </div>
                    <div className="text-xs text-warn mt-2">{t.label}</div>
                    <div className="text-xs text-muted">{t.actuals_status}</div>
                  </Card>
                ))}
              </div>
            )}
            <FourQuestions
              soWhat="A governed tracking basis is established per wellness category; ROI is an estimate / tracking basis, not a guaranteed saving."
              why="Baselines are current governed claim metrics; actuals populate once post-period engagement/outcome data is ingested."
              next="Run the programs from the planner, then compare pre/post claims for the tracked categories."
              trust={`Rendered from /wellness/roi-impact on ${d.data_quality_status} data — no guaranteed-saving language, no browser-side ROI math.`} />
          </>
        );
      }}
    </WellnessFrame>
  );
}
