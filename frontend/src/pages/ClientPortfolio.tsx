import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtPercent, fmtValue } from "../lib/format";
import {
  SectionHeader, Card, DecisionSummary, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { EvidenceDrawer } from "../components/ui/sandbox";
import { KpiStat } from "../components/ui/charts";

/** Client Portfolio — governed client-360 control tower (Sprint 23). Composed server-side from
 *  the module engines (reconciles with the module tabs); the page performs NO arithmetic. */
function HealthCard({ label, value, tone = "muted", sub, testid }:
  { label: string; value: React.ReactNode; tone?: "good" | "warn" | "bad" | "muted"; sub?: string; testid?: string }) {
  const t = { good: "border-l-good", warn: "border-l-amber-400", bad: "border-l-bad", muted: "border-l-slate-300" }[tone];
  return (
    <Card className={`p-4 border-l-4 ${t}`}>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="text-lg font-semibold text-ink mt-1" data-testid={testid}>{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </Card>
  );
}

function ClientPicker() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["portfolio", "broker-overview"], queryFn: () => api.portfolio("broker-overview") });
  const clients = q.data?.value?.clients || [];
  return (
    <Card className="p-6">
      <div data-testid="cp-picker">
        <div className="text-base font-semibold text-ink">Select a client</div>
        <p className="text-sm text-muted mt-1">Choose a client to open its governed 360° control tower.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {clients.length === 0 ? <span className="text-sm text-muted">No governed clients in scope yet.</span>
            : clients.map((cl: any) => (
              <button key={cl.client_id} onClick={() => nav(`/client-portfolio?client_id=${cl.client_id}`)}
                className="text-sm px-3 py-1.5 rounded-lg border border-line hover:bg-slate-50 text-ink">{String(cl.client_name)}</button>))}
        </div>
      </div>
    </Card>
  );
}

export function ClientPortfolio() {
  const [sp] = useSearchParams();
  const [ev, setEv] = useState(false);
  const nav = useNavigate();
  const clientId = sp.get("client_id") || undefined;

  const q = useQuery({ queryKey: ["portfolio", "client-overview", clientId], enabled: !!clientId,
    queryFn: () => api.portfolio("client-overview", { client_id: clientId }) });

  if (!clientId) return <div className="space-y-5"><SectionHeader title="Client Portfolio" subtitle="Governed client-360 control tower" /><ClientPicker /></div>;
  if (q.isLoading) return <><SectionHeader title="Client Portfolio" subtitle="Governed client-360" /><Skeleton rows={4} /></>;
  if (q.isError) return <><SectionHeader title="Client Portfolio" /><ErrorState onRetry={() => q.refetch()} /></>;
  const d = q.data;
  const status = d?.data_quality_status || "No Data";
  if (status === "No Data") return <><SectionHeader title="Client Portfolio" /><EmptyState message="No governed data for this client yet. Complete Data Onboarding and activate the client's data." /></>;

  const v = d.value || {};
  const bm = v.benchmarking_status || {}, pl = v.placement_status || {}, wl = v.wellness_status || {}, rn = v.renewal_status || {}, nba = v.next_best_action || {};
  const links = v.links || {};

  return (
    <div className="space-y-5">
      <SectionHeader title={`Client Portfolio — ${String(v.client_name)}`} subtitle="Governed client-360 control tower (reconciles with the module tabs)"
        right={<DataQualityBadge status={status} />} />
      <RestrictedBanner blocked={d.advisory_blocked} />
      <CaveatBanner caveats={d.caveats} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="cp-kpis">
        <KpiStat label="Lives" value={fmtNumber(v.lives)} sub={`${(v.policy_years || []).join(", ") || "—"}`} badge={<DataQualityBadge status={status} />} testid="cp-kpi-lives" />
        <KpiStat label="Premium" value={fmtCurrency(v.premium)} sub={`Basis: ${v.premium_basis || "written"}`} testid="cp-kpi-premium" />
        <KpiStat label="Operational ICR" value={v.operational_icr != null ? fmtPercent(v.operational_icr) : "—"} sub="Incurred ÷ premium" onEvidence={() => setEv(true)} testid="cp-kpi-icr" />
        <KpiStat label="Next renewal" value={rn.days_to_renewal != null ? `${fmtNumber(rn.days_to_renewal)}d` : "Not available"} sub={rn.next_renewal_date ? String(rn.next_renewal_date) : "No end date on file"} testid="cp-kpi-renewal" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="cp-health">
        <HealthCard label="Data quality" value={String(status)} tone={status === "Analytics Ready" ? "good" : status === "Restricted" ? "bad" : "warn"} testid="cp-health-dq" />
        <HealthCard label="Benchmarking" value={bm.valid_peer_group ? "Comparable" : "Not available"} tone={bm.valid_peer_group ? "good" : "muted"}
          sub={bm.valid_peer_group ? `${fmtNumber(bm.features_comparable)} / ${fmtNumber(bm.features_total)} · ${String(bm.confidence)}` : "No valid peer group"} testid="cp-health-bench" />
        <HealthCard label="Placement" value={pl.placement_state ? String(pl.placement_state) : "Not available"} tone={pl.placement_state === "yes" ? "warn" : pl.placement_state === "no" ? "good" : "muted"}
          sub={pl.incumbent_defence_score != null ? `Defence ${fmtValue(pl.incumbent_defence_score)}` : undefined} testid="cp-health-placement" />
        <HealthCard label="Wellness" value={wl.posture ? "Assessed" : "Not available"} tone={wl.posture ? "good" : "muted"}
          sub={wl.posture ? String(wl.posture).slice(0, 60) : undefined} testid="cp-health-wellness" />
      </div>

      <DecisionSummary title={`Next best action: ${String(nba.recommendation ?? "—")}`} points={[
        nba.reason ? String(nba.reason) : "Open Renewal Intelligence for the full governed reasoning.",
        `Confidence: ${String(nba.confidence ?? "—")}.`,
      ]} />

      <Card className="p-4">
        <div className="text-sm font-medium mb-2">Open governed dashboards for this client</div>
        <div className="flex flex-wrap gap-2" data-testid="cp-links">
          {[["Renewal", links.renewal], ["Benchmarking", links.benchmarking], ["Placement", links.placement], ["Wellness", links.wellness], ["Claims", links.claims]].map(([label, path]) => (
            path ? <button key={String(label)} onClick={() => nav(`${path}?client_id=${clientId}`)}
              className="text-sm px-3 py-1.5 rounded-lg border border-line hover:bg-slate-50 text-brand">{label} →</button> : null))}
        </div>
      </Card>

      <FourQuestions
        soWhat={`${String(v.client_name)}: ${fmtNumber(v.lives)} lives, operational ICR ${v.operational_icr != null ? fmtPercent(v.operational_icr) : "—"}, next renewal ${rn.days_to_renewal != null ? `in ${fmtNumber(rn.days_to_renewal)} days` : "not available"}.`}
        why="Every figure is composed from the same governed engines the module tabs use — the client-360 reconciles with Renewal, Benchmarking, Placement and Wellness, with no browser math."
        next={`Recommended: ${String(nba.recommendation ?? "review")}. Open the module dashboards above for the full governed detail.`}
        trust={`Governed on ${status} data; formula and sources in evidence. Modules with no governed result are shown as Not available, never fabricated.`} />

      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="Client portfolio evidence" evidence={ev ? d : null} />
    </div>
  );
}
