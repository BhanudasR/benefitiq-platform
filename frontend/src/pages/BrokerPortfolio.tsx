import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtPercent } from "../lib/format";
import {
  SectionHeader, Card, DecisionSummary, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState,
} from "../components/ui/primitives";
import { EvidenceDrawer } from "../components/ui/sandbox";
import { ChartFrame, KpiStat, BarV, Donut, SERIES } from "../components/ui/charts";

/** Broker Portfolio — governed CXO command center (Sprint 23). Book-level rollup composed
 *  server-side from the governed engines; the page performs NO arithmetic. */
const RISK_STYLE: Record<string, string> = {
  defend: "bg-green-50 text-good border-green-200", negotiate: "bg-brandSoft text-brand border-blue-200",
  redesign: "bg-amber-50 text-warn border-amber-200", place: "bg-red-50 text-bad border-red-200",
  unknown: "bg-slate-100 text-muted border-line",
};
const RISK_COLOR: Record<string, string> = { defend: "#16A34A", negotiate: "#2563EB", redesign: "#D97706", place: "#DC2626", unknown: "#94A3B8" };

function RiskBadge({ band }: { band: string }) {
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${RISK_STYLE[band] || RISK_STYLE.unknown}`}>{band}</span>;
}

export function BrokerPortfolio() {
  const [ev, setEv] = useState(false);
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["portfolio", "broker-overview"], queryFn: () => api.portfolio("broker-overview") });

  if (q.isLoading) return <><SectionHeader title="Broker Portfolio" subtitle="Governed book command center" /><Skeleton rows={4} /></>;
  if (q.isError) return <><SectionHeader title="Broker Portfolio" /><ErrorState onRetry={() => q.refetch()} /></>;
  const d = q.data;
  const status = d?.data_quality_status || "No Data";
  if (status === "No Data") return <><SectionHeader title="Broker Portfolio" /><EmptyState message="No governed clients in scope yet. Complete Data Onboarding to build the broker command center." /></>;

  const v = d.value || {};
  const renewal = v.renewal_due || {};
  const renewalBars = [
    { label: "Overdue", value: renewal.overdue, color: "#DC2626" }, { label: "≤30d", value: renewal.d30, color: "#D97706" },
    { label: "31–60d", value: renewal.d60, color: "#2563EB" }, { label: "61–90d", value: renewal.d90, color: "#0891B2" },
    { label: "Later", value: renewal.later, color: "#94A3B8" },
  ];
  const riskData = Object.keys(v.risk_distribution || {}).map((k) => ({ label: k, value: v.risk_distribution[k], color: RISK_COLOR[k] || "#94A3B8" }));
  const readyData = Object.keys(v.readiness_distribution || {}).map((k, i) => ({ label: k, value: v.readiness_distribution[k], color: SERIES[i % SERIES.length] }));
  const clients = v.clients || [];

  return (
    <div className="space-y-5">
      <SectionHeader title="Broker Portfolio" subtitle="Governed book command center — clients, renewals, risk & readiness"
        right={<DataQualityBadge status={status} />} />
      <RestrictedBanner blocked={d.advisory_blocked} />
      <CaveatBanner caveats={d.caveats} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4" data-testid="bp-kpis">
        <KpiStat label="Clients" value={fmtNumber(v.total_clients)} sub={`${fmtNumber(v.active_policies)} active policies`} badge={<DataQualityBadge status={status} />} testid="bp-kpi-clients" />
        <KpiStat label="Lives" value={fmtNumber(v.total_lives)} sub="Distinct members" testid="bp-kpi-lives" />
        <KpiStat label="Premium" value={fmtCurrency(v.total_premium)} sub={`Basis: ${v.premium_basis || "written"}`} testid="bp-kpi-premium" />
        <KpiStat label="Portfolio ICR" value={v.portfolio_icr != null ? fmtPercent(v.portfolio_icr) : "—"} sub="Incurred ÷ premium (book)" onEvidence={() => setEv(true)} testid="bp-kpi-icr" />
        <KpiStat label="Claims" value={fmtNumber(v.total_claims)} sub="Across the book" testid="bp-kpi-claims" />
      </div>

      {(v.next_best_actions || []).length > 0 && (
        <DecisionSummary title="Broker next best actions" points={v.next_best_actions} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartFrame title="Renewals due" subtitle="Policies by renewal window (from policy end date)" status={status}
          evidence={d} evidenceTitle="Broker portfolio evidence" testid="bp-renewal"
          empty={renewalBars.every((b: any) => !b.value)} emptyMessage="No renewal dates in scope.">
          <BarV data={renewalBars} format={(x) => fmtNumber(x)} />
        </ChartFrame>
        <ChartFrame title="Risk distribution" subtitle="Clients by governed ICR risk band" status={status}
          evidence={d} evidenceTitle="Broker portfolio evidence" testid="bp-risk"
          empty={riskData.length === 0} emptyMessage="No client risk bands yet.">
          <Donut data={riskData} centerValue={fmtNumber(v.total_clients)} centerLabel="clients" />
        </ChartFrame>
        <ChartFrame title="Data readiness" subtitle="Clients by data-quality status" status={status}
          evidence={d} evidenceTitle="Broker portfolio evidence" testid="bp-readiness"
          empty={readyData.length === 0} emptyMessage="No readiness data yet.">
          <Donut data={readyData} centerValue={fmtNumber(v.total_clients)} centerLabel="clients" />
        </ChartFrame>
      </div>

      <Card className="p-4">
        <div className="text-sm font-medium mb-2">Top clients by ICR</div>
        {clients.length === 0 ? <div className="text-sm text-muted">No governed clients in scope.</div>
          : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="bp-clients">
              {clients.slice(0, 12).map((cl: any) => (
                <button key={cl.client_id} data-testid="bp-client-card"
                  onClick={() => nav(`/client-portfolio?client_id=${cl.client_id}`)}
                  className="text-left border border-line rounded-xl2 p-3 hover:bg-slate-50">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-ink truncate pr-2">{String(cl.client_name)}</div>
                    <RiskBadge band={String(cl.risk_band)} />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
                    <div><div className="text-muted">ICR</div><div className="font-semibold">{cl.icr != null ? fmtPercent(cl.icr) : "—"}</div></div>
                    <div><div className="text-muted">Lives</div><div className="font-semibold">{fmtNumber(cl.lives)}</div></div>
                    <div><div className="text-muted">Premium</div><div className="font-semibold">{fmtCurrency(cl.premium)}</div></div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
                    <span>{cl.next_renewal_days != null ? (cl.next_renewal_days < 0 ? "Renewal overdue" : `Renews in ${fmtNumber(cl.next_renewal_days)}d`) : "No renewal date"}</span>
                    <DataQualityBadge status={cl.data_quality_status} />
                  </div>
                </button>))}
            </div>}
      </Card>

      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="Broker portfolio evidence" evidence={ev ? d : null} />
    </div>
  );
}
