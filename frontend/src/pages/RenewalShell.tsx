import React from "react";
import { Outlet } from "react-router-dom";
import { SectionHeader } from "../components/ui/primitives";
import { SubTabNav } from "../components/SubTabNav";
import { RENEWAL_SUBTABS } from "../nav/tabs";

/** Renewal Intelligence parent — hosts exactly the 6 demo sub-tabs. The active
 *  sub-tab renders through <Outlet/>; every sub-tab stays governed & API-driven. */
export function RenewalShell() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl2 border border-line bg-card p-4 shadow-card" data-testid="renewal-shell-command">
        <SectionHeader
          title="Renewal Intelligence"
          subtitle="Flagship broker advisory workbench: data, insight, decision, action and value" />
        <div className="grid grid-cols-1 gap-2 text-xs text-muted md:grid-cols-4">
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">Governed APIs only</div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">No frontend simulation math</div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">Evidence and caveats visible</div>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">Export-safe aggregate view</div>
        </div>
      </div>
      <SubTabNav tabs={RENEWAL_SUBTABS} />
      <Outlet />
    </div>
  );
}
