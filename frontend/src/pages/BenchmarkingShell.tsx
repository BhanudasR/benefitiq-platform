import React from "react";
import { Outlet } from "react-router-dom";
import { SectionHeader } from "../components/ui/primitives";
import { SubTabNav } from "../components/SubTabNav";
import { BENCHMARKING_SUBTABS } from "../nav/tabs";

/** Benefits & Benchmarking parent — hosts exactly the 7 benchmarking sub-tabs. Benchmarks
 *  benefit design + policy terms only (never claims); every sub-tab is governed & API-driven. */
export function BenchmarkingShell() {
  return (
    <div className="space-y-1">
      <SectionHeader
        title="Benefits & Benchmarking"
        subtitle="Governed benefit-design & policy terms benchmarking vs the internal peer group" />
      <SubTabNav tabs={BENCHMARKING_SUBTABS} />
      <Outlet />
    </div>
  );
}
