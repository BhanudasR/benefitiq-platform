import React from "react";
import { SectionHeader, Card, EmptyState } from "../components/ui/primitives";

/** Premium, intentional scaffold for tabs not yet fully built. Looks deliberate
 *  (not broken) and states the governed, API-driven roadmap posture. */
export function Placeholder({ title, group }: { title: string; group?: string }) {
  return (
    <div className="space-y-5">
      <SectionHeader title={title} subtitle={group ? `${group} module` : undefined} />
      <Card className="p-6 border-l-4 border-l-brand">
        <div className="text-xs font-semibold uppercase tracking-wide text-brand mb-1">On the BenefitIQ roadmap</div>
        <h3 className="text-base font-semibold text-ink">{title} will render governed, API-driven insights.</h3>
        <p className="text-sm text-muted mt-2 max-w-2xl">
          This module preserves the approved demo's decision-first storytelling and premium experience.
          It will be wired to the governed backend APIs — no mock values, no browser-side KPI math.
          Executive Summary and Data Onboarding are live now; the remaining modules follow the module roadmap.
        </p>
      </Card>
      <EmptyState title="Awaiting governed data & module wiring"
        message="Once this module is wired, official numbers will come only from the metric / simulation / terms APIs, with full evidence, caveats and restricted-state handling." />
    </div>
  );
}
