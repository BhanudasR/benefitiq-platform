import React from "react";
import { Outlet } from "react-router-dom";
import { SectionHeader } from "../components/ui/primitives";
import { SubTabNav } from "../components/SubTabNav";
import { WELLNESS_SUBTABS } from "../nav/tabs";

/** Wellness Intelligence parent — hosts exactly the 4 demo sub-tabs. All detailed
 *  wellness analysis sits inside these four sections (Overview, Opportunity &
 *  Recommendation, Planner, ROI & Impact Tracking). */
export function WellnessShell() {
  return (
    <div className="space-y-1">
      <SectionHeader
        title="Wellness Intelligence"
        subtitle="Governed wellness opportunity, planning and ROI tracking" />
      <SubTabNav tabs={WELLNESS_SUBTABS} />
      <Outlet />
    </div>
  );
}
