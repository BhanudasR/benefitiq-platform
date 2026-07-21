import React from "react";
import { Outlet } from "react-router-dom";
import { SectionHeader } from "../components/ui/primitives";
import { SubTabNav } from "../components/SubTabNav";
import { PLACEMENT_SUBTABS } from "../nav/tabs";

/** Placement Intelligence parent — hosts exactly the 7 placement sub-tabs. A governed
 *  composition module: the stay-defend / negotiate / RFQ decision is reused from the placement-
 *  trigger engine (never recomputed here); Quote Comparison is a governed pending state. */
export function PlacementShell() {
  return (
    <div className="space-y-1">
      <SectionHeader
        title="Placement Intelligence"
        subtitle="Stay-defend / negotiate / go-to-market — governed, evidence-based, reused from the placement engine" />
      <SubTabNav tabs={PLACEMENT_SUBTABS} />
      <Outlet />
    </div>
  );
}
