import React from "react";
import { Outlet } from "react-router-dom";
import { SectionHeader } from "../components/ui/primitives";
import { SubTabNav } from "../components/SubTabNav";
import { RENEWAL_SUBTABS } from "../nav/tabs";

/** Renewal Intelligence parent — hosts exactly the 6 demo sub-tabs. The active
 *  sub-tab renders through <Outlet/>; every sub-tab stays governed & API-driven. */
export function RenewalShell() {
  return (
    <div className="space-y-1">
      <SectionHeader
        title="Renewal Intelligence"
        subtitle="Governed renewal defensibility, savings levers and placement strategy" />
      <SubTabNav tabs={RENEWAL_SUBTABS} />
      <Outlet />
    </div>
  );
}
