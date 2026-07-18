import React from "react";
import { SectionHeader, Card, EmptyState } from "../components/ui/primitives";

/** Wellness Intelligence sub-tabs. The governed wellness metric APIs are not built
 *  yet, so each of the four demo sections renders as a premium, intentional scaffold
 *  that states the decision it will answer — never a broken or empty admin page.
 *  When the wellness endpoints land, these bind to governed data (no browser math). */
function WellnessSection({ title, subtitle, intent, willShow }:
  { title: string; subtitle: string; intent: string; willShow: string[] }) {
  return (
    <div className="space-y-5">
      <SectionHeader title={title} subtitle={subtitle} />
      <Card className="p-6 border-l-4 border-l-brand">
        <div className="text-xs font-semibold uppercase tracking-wide text-brand mb-1">On the BenefitIQ roadmap — governed &amp; API-driven</div>
        <h3 className="text-base font-semibold text-ink">{intent}</h3>
        <ul className="mt-3 list-disc pl-5 text-sm text-ink/80 space-y-1">
          {willShow.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
        <p className="text-sm text-muted mt-3 max-w-2xl">
          This section preserves the approved demo's decision-first flow. Numbers will come only from the
          governed wellness metric APIs — no mock values, no browser-side calculations.
        </p>
      </Card>
      <EmptyState title="Awaiting governed wellness data"
        message="Once the wellness endpoints are wired, this view surfaces official numbers with full evidence, caveats and restricted-state handling." />
    </div>
  );
}

export function WellnessOverview() {
  return <WellnessSection
    title="Wellness Overview"
    subtitle="Health risk posture of the covered population"
    intent="Where does the population's health risk concentrate, and what is the wellness starting point?"
    willShow={["Population risk bands and chronic-condition prevalence", "Preventable vs unavoidable claim share", "Engagement baseline for wellness programmes"]} />;
}

export function WellnessOpportunity() {
  return <WellnessSection
    title="Opportunity & Recommendation"
    subtitle="Where wellness can move the loss ratio"
    intent="Which interventions offer the strongest governed opportunity to reduce preventable claims?"
    willShow={["Ranked wellness opportunities by expected claim impact", "Target cohorts and conditions", "Recommended interventions with confidence and caveats"]} />;
}

export function WellnessPlanner() {
  return <WellnessSection
    title="Wellness Planner"
    subtitle="Design and sequence the wellness programme"
    intent="What is the concrete, sequenced wellness plan for this client year?"
    willShow={["Programme calendar and owner assignment", "Budget vs expected benefit", "Milestones aligned to renewal timeline"]} />;
}

export function WellnessRoi() {
  return <WellnessSection
    title="ROI & Impact Tracking"
    subtitle="Did the wellness programme pay back?"
    intent="What measurable impact did wellness deliver on claims, engagement and the renewal?"
    willShow={["Pre vs post claim and utilisation movement", "Engagement and participation tracking", "Governed ROI with evidence and data-reliability caveats"]} />;
}
