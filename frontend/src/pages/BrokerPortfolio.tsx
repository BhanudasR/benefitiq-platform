import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtPercent, fmtValue } from "../lib/format";
import {
  Card, DataQualityBadge, CaveatBanner, RestrictedBanner, Skeleton, EmptyState, ErrorState,
} from "../components/ui/primitives";
import { EvidenceDrawer } from "../components/ui/sandbox";
import { BarH, ChartFrame, Donut, Heatmap, KpiStat, SERIES } from "../components/ui/charts";

const NA = "Not Available";

const RISK_STYLE: Record<string, string> = {
  defend: "bg-green-50 text-good border-green-200",
  negotiate: "bg-blue-50 text-brand border-blue-200",
  redesign: "bg-amber-50 text-warn border-amber-200",
  place: "bg-red-50 text-bad border-red-200",
  unknown: "bg-slate-100 text-muted border-line",
};

const RISK_COLOR: Record<string, string> = {
  defend: "#16A34A",
  negotiate: "#2563EB",
  redesign: "#D97706",
  place: "#DC2626",
  unknown: "#94A3B8",
};

const ACTION_STYLE: Record<string, string> = {
  immediate_attention: "border-red-200 bg-red-50 text-bad",
  plan_strategy_call: "border-amber-200 bg-amber-50 text-warn",
  monitor_closely: "border-blue-200 bg-blue-50 text-brand",
  track_prepare: "border-green-200 bg-green-50 text-good",
};

function clean(v: string): string {
  return v === "-" || v === "—" || v === "â€”" ? NA : v;
}

function money(v: number | null | undefined): string {
  return clean(fmtCurrency(v));
}

function num(v: number | null | undefined): string {
  return clean(fmtNumber(v));
}

function pct(v: number | null | undefined): string {
  return clean(fmtPercent(v));
}

function text(v: unknown): string {
  return clean(fmtValue(v));
}

function RiskBadge({ band }: { band: string | null | undefined }) {
  const key = String(band ?? "unknown").toLowerCase();
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${RISK_STYLE[key] ?? RISK_STYLE.unknown}`}>
      {text(band ?? "unknown")}
    </span>
  );
}

function TopContextBar({ status, onEvidence }: { status: string; onEvidence: () => void }) {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between" data-testid="bp-top-context">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Broker Portfolio</h1>
          <button className="text-xs font-semibold text-brand border border-line rounded-full px-2 py-0.5"
            onClick={onEvidence}>Evidence</button>
        </div>
        <p className="mt-1 text-sm text-muted">Enterprise book of business overview and renewal intelligence</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-xl2 border border-line bg-card px-4 py-2 text-xs">
          <span className="text-muted">Policy Year: </span><span className="font-semibold text-ink">All Active</span>
        </div>
        <div className="rounded-xl2 border border-line bg-card px-4 py-2 text-xs">
          <span className="text-muted">Last Refresh: </span><span className="font-semibold text-ink">{NA}</span>
        </div>
        <div className="rounded-xl2 border border-line bg-card px-4 py-2">
          <div className="text-[11px] text-muted">Data Quality Score</div>
          <DataQualityBadge status={status} />
        </div>
        <button className="rounded-xl2 bg-brand px-4 py-2 text-sm font-semibold text-white">Export</button>
      </div>
    </div>
  );
}

function EvidenceFooter({ status, evidence, onEvidence }: { status: string; evidence: any; onEvidence: () => void }) {
  const sources = evidence?.source_basis || [];
  return (
    <Card className="p-4">
      <div data-testid="bp-evidence-footer" className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-ink">Evidence & Caveats</div>
          <div className="mt-1 text-xs text-muted">
            Broker Portfolio renders governed backend values only. Unsupported advanced KPIs show as {NA}.
          </div>
          {sources.length > 0 && <div className="mt-2 text-[11px] text-muted">Sources: {sources.join(", ")}</div>}
        </div>
        <div className="flex items-center gap-3">
          <DataQualityBadge status={status} />
          <button onClick={onEvidence} className="text-xs font-semibold text-brand hover:underline">View evidence and formulas</button>
        </div>
      </div>
    </Card>
  );
}

function RenewalPriorityMatrix({ matrix, status, evidence }: { matrix: any; status: string; evidence: any }) {
  const cells = [
    { x: 0, y: 0, value: matrix?.low?.low },
    { x: 1, y: 0, value: matrix?.low?.medium },
    { x: 2, y: 0, value: matrix?.low?.high },
    { x: 0, y: 1, value: matrix?.medium?.low },
    { x: 1, y: 1, value: matrix?.medium?.medium },
    { x: 2, y: 1, value: matrix?.medium?.high },
    { x: 0, y: 2, value: matrix?.high?.low },
    { x: 1, y: 2, value: matrix?.high?.medium },
    { x: 2, y: 2, value: matrix?.high?.high },
  ];
  return (
    <ChartFrame title="Renewal Priority Matrix" subtitle="Impact by ICR risk band and renewal urgency"
      status={status} evidence={evidence} evidenceTitle="Broker portfolio evidence"
      testid="bp-priority-matrix" empty={!matrix} emptyMessage="Renewal priority matrix is not available.">
      <div className="flex justify-center py-2">
        <Heatmap cells={cells} xLabels={["Low", "Medium", "High"]} yLabels={["Low", "Medium", "High"]}
          format={(v) => `${num(v)} client(s)`} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted">
        <span>Risk: ICR band</span>
        <span>Urgency: renewal window</span>
      </div>
    </ChartFrame>
  );
}

function RenewalActionQueue({ queue }: { queue: any[] }) {
  return (
    <Card className="p-4">
      <div data-testid="bp-action-queue">
        <div className="text-sm font-semibold text-ink">Renewal Action Queue</div>
        <div className="mt-1 text-xs text-muted">Server-prioritized renewal work bands</div>
        <div className="mt-4 space-y-3">
          {queue.length ? queue.map((item) => (
            <div key={item.key} className={`flex items-center justify-between rounded-lg border px-3 py-3 ${ACTION_STYLE[item.key] ?? "border-line bg-card text-ink"}`}>
              <div>
                <div className="text-sm font-semibold">{text(item.label)}</div>
                <div className="text-[11px] opacity-80">{text(item.basis)}</div>
              </div>
              <div className="rounded-md bg-white px-2 py-1 text-sm font-bold text-ink shadow-sm">{num(item.count)}</div>
            </div>
          )) : <div className="text-sm text-muted">{NA}</div>}
        </div>
      </div>
    </Card>
  );
}

function ClientRiskGrid({ clients, onOpen }: { clients: any[]; onOpen: (id: string) => void }) {
  return (
    <Card className="p-4">
      <div data-testid="bp-client-risk-grid">
        <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-ink">Client Risk Overview</div>
            <div className="text-xs text-muted">Client-level aggregate book view; no member or claim PII</div>
          </div>
          <div className="text-[11px] font-semibold text-muted">Sorted by backend risk queue</div>
        </div>
        <div className="overflow-x-auto rounded-xl2 border border-line">
          <table className="min-w-[1160px] w-full text-xs">
            <thead className="bg-slate-50 text-muted">
              <tr>
                {["Client Name", "Industry", "Lives", "Premium", "Claims Incurred", "Portfolio ICR", "Projected ICR", "Adjusted ICR", "Renewal Due", "Risk Score", "Risk Status", "Premium at Risk", "Main Claims Driver", "Recommended Next Action", ""].map((h) => (
                  <th key={h} className="px-3 py-3 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-card">
              {clients.map((cl) => (
                <tr key={cl.client_id} data-testid="bp-client-row" className="hover:bg-slate-50">
                  <td className="px-3 py-3 font-semibold text-ink">{text(cl.client_name)}</td>
                  <td className="px-3 py-3 text-muted">{text(cl.industry)}</td>
                  <td className="px-3 py-3 tabular-nums">{num(cl.lives)}</td>
                  <td className="px-3 py-3 tabular-nums">{money(cl.premium)}</td>
                  <td className="px-3 py-3 tabular-nums">{money(cl.claims_incurred)}</td>
                  <td className="px-3 py-3 tabular-nums">{pct(cl.icr)}</td>
                  <td className="px-3 py-3 tabular-nums">{pct(cl.projected_icr)}</td>
                  <td className="px-3 py-3 tabular-nums">{pct(cl.adjusted_icr)}</td>
                  <td className="px-3 py-3 tabular-nums">{cl.next_renewal_days != null ? `${num(cl.next_renewal_days)} Days` : NA}</td>
                  <td className="px-3 py-3 tabular-nums">{num(cl.risk_score)}</td>
                  <td className="px-3 py-3"><RiskBadge band={cl.risk_band} /></td>
                  <td className="px-3 py-3 tabular-nums">{cl.risk_impact === "high" ? money(cl.premium) : NA}</td>
                  <td className="px-3 py-3">{text(cl.main_claims_driver)}</td>
                  <td className="px-3 py-3">{text(cl.recommended_next_action)}</td>
                  <td className="px-3 py-3 text-right">
                    <button onClick={() => onOpen(String(cl.client_id))}
                      className="rounded-md border border-line px-2 py-1 text-[11px] font-semibold text-brand hover:bg-brandSoft">
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {clients.length === 0 && <div className="mt-3 text-sm text-muted">{NA}</div>}
      </div>
    </Card>
  );
}

export function BrokerPortfolio() {
  const [ev, setEv] = useState(false);
  const [query, setQuery] = useState("");
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["portfolio", "broker-overview"], queryFn: () => api.portfolio("broker-overview") });

  const filteredClients = useMemo(() => {
    const clients = q.data?.value?.client_risk_queue || q.data?.value?.clients || [];
    const needle = query.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter((client: any) => String(client.client_name || client.client_id || "").toLowerCase().includes(needle));
  }, [q.data, query]);

  if (q.isLoading) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv(true)} /><Skeleton rows={5} /></div>;
  if (q.isError) return <div className="space-y-5"><TopContextBar status="No Data" onEvidence={() => setEv(true)} /><ErrorState onRetry={() => q.refetch()} /></div>;

  const d = q.data;
  const status = d?.data_quality_status || "No Data";
  if (status === "No Data") {
    return (
      <div className="space-y-5">
        <TopContextBar status={status} onEvidence={() => setEv(true)} />
        <EmptyState message="No governed clients in scope yet. Complete Data Onboarding to build the broker command center." />
      </div>
    );
  }

  const v = d.value || {};
  const riskData = Object.keys(v.risk_distribution || {}).map((k) => ({ label: k, value: v.risk_distribution[k], color: RISK_COLOR[k] || "#94A3B8" }));
  const premiumRiskRows = (v.client_risk_queue || v.clients || []).map((cl: any, i: number) => ({
    label: String(cl.client_name || cl.client_id),
    value: cl.risk_impact === "high" ? cl.premium : null,
    color: SERIES[i],
  }));

  return (
    <div className="space-y-5" data-testid="bp-master-screen">
      <TopContextBar status={status} onEvidence={() => setEv(true)} />
      <RestrictedBanner blocked={d.advisory_blocked} />
      <CaveatBanner caveats={d.caveats} />

      <div className="flex flex-col gap-3 rounded-xl2 border border-line bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
        <input aria-label="Search clients" value={query} onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-line px-3 py-2 text-sm md:max-w-md"
          placeholder="Search clients, modules, insights..." />
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-line px-3 py-1 text-muted">Risk basis: {text(v.risk_band_basis)}</span>
          <span className="rounded-full border border-line px-3 py-1 text-muted">Premium basis: {text(v.premium_basis)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 2xl:grid-cols-8" data-testid="bp-kpi-band">
        <KpiStat label="Total Clients" value={num(v.total_clients)} sub={`${num(v.active_policies)} active policies`}
          badge={<DataQualityBadge status={status} />} testid="bp-kpi-clients" />
        <KpiStat label="Lives Covered" value={num(v.total_lives)} sub="Distinct members" testid="bp-kpi-lives" />
        <KpiStat label="Total Premium" value={money(v.total_premium)} sub={`Basis: ${text(v.premium_basis)}`} testid="bp-kpi-premium" />
        <KpiStat label="Claims Incurred" value={money(v.claims_incurred)} sub={`${num(v.total_claims)} claims`} testid="bp-kpi-incurred" />
        <KpiStat label="Portfolio ICR" value={pct(v.portfolio_icr)} sub="Weighted book ICR" onEvidence={() => setEv(true)} testid="bp-kpi-portfolio-icr" />
        <KpiStat label="Projected ICR" value={pct(v.projected_portfolio_icr)} sub="Backend supplied only" testid="bp-kpi-projected" />
        <KpiStat label="Renewal Due Clients" value={num(v.renewal_due_clients)} sub="Overdue or <=30 days" testid="bp-kpi-renewals" />
        <KpiStat label="High-Risk Renewals" value={num(v.high_risk_renewals)} sub="High risk within 90 days" testid="bp-kpi-high-risk" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr,1.15fr,1fr,0.9fr]">
        <RenewalPriorityMatrix matrix={v.priority_matrix} status={status} evidence={d} />
        <ChartFrame title="Premium at Risk by Client" subtitle="Premium tied to server-classified high-risk clients"
          status={status} evidence={d} evidenceTitle="Broker portfolio evidence" testid="bp-premium-risk"
          empty={premiumRiskRows.every((r: any) => r.value == null)} emptyMessage="Premium at risk is not available.">
          <BarH data={premiumRiskRows} format={(x) => money(x)} />
        </ChartFrame>
        <ChartFrame title="Risk Distribution" subtitle="Clients by governed ICR risk band" status={status}
          evidence={d} evidenceTitle="Broker portfolio evidence" testid="bp-risk-distribution"
          empty={riskData.length === 0} emptyMessage="Risk distribution is not available.">
          <Donut data={riskData} centerValue={num(v.total_clients)} centerLabel="clients" />
        </ChartFrame>
        <RenewalActionQueue queue={v.renewal_action_queue || []} />
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" data-testid="bp-risk-exposure-band">
        <KpiStat label="Premium at Risk" value={money(v.premium_at_risk)} sub="High-risk clients" testid="bp-kpi-premium-risk" />
        <KpiStat label="Claims at Risk" value={money(v.claims_at_risk)} sub="High-risk clients" testid="bp-kpi-claims-risk" />
        <KpiStat label="Loading Exposure" value={money(v.expected_renewal_loading_exposure)} sub="Backend supplied only" testid="bp-kpi-loading" />
        <KpiStat label="Opportunity Value" value={money(v.opportunity_value)} sub="Backend supplied only" testid="bp-kpi-opportunity" />
      </div>

      <ClientRiskGrid clients={filteredClients} onOpen={(id) => nav(`/client-portfolio?client_id=${id}`)} />

      <EvidenceFooter status={status} evidence={d} onEvidence={() => setEv(true)} />
      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="Broker portfolio evidence" evidence={ev ? d : null} />
    </div>
  );
}
