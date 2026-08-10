import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtPercent, fmtValue } from "../lib/format";
import {
  Card, DataQualityBadge, CaveatBanner, RestrictedBanner, Skeleton, EmptyState, ErrorState,
} from "../components/ui/primitives";
import { EvidenceDrawer } from "../components/ui/sandbox";
import { BarH, ChartFrame, Donut, Gauge, KpiStat, SERIES, StackedBar } from "../components/ui/charts";

const NA = "Not Available";

function clean(v: string): string {
  return v === "-" || v === "—" || v === "â€”" || v === "Ã¢â‚¬â€" ? NA : v;
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

function statusText(v: unknown): string {
  if (v === null || v === undefined) return NA;
  if (typeof v !== "object") return text(v);
  const entries = Object.entries(v as Record<string, unknown>).filter(([, count]) => count !== null && count !== undefined);
  return entries.length ? entries.map(([label, count]) => `${label}: ${text(count)}`).join(", ") : NA;
}

function MiniStat({ label, value, sub, testid }: { label: string; value: React.ReactNode; sub?: string; testid?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-3" data-testid={testid}>
      <div className="text-[11px] font-medium uppercase text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function TopClientContextBar({ value, status, onEvidence }: { value: any; status: string; onEvidence: () => void }) {
  const ps = value.policy_snapshot || {};
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between" data-testid="cp-top-context">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Client Portfolio</h1>
          <button className="text-xs font-semibold text-brand border border-line rounded-full px-2 py-0.5"
            onClick={onEvidence}>Evidence</button>
        </div>
        <p className="mt-1 text-sm text-muted">
          {text(value.client_name)} policy, coverage, financial exposure and renewal readiness
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-xl2 border border-line bg-card px-4 py-2 text-xs">
          <span className="text-muted">Policy Year: </span>
          <span className="font-semibold text-ink">{Array.isArray(ps.policy_years) && ps.policy_years.length ? ps.policy_years.join(", ") : NA}</span>
        </div>
        <div className="rounded-xl2 border border-line bg-card px-4 py-2 text-xs">
          <span className="text-muted">Policy Count: </span><span className="font-semibold text-ink">{num(ps.policy_count)}</span>
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

function ClientPicker() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["portfolio", "broker-overview"], queryFn: () => api.portfolio("broker-overview") });
  const clients = q.data?.value?.clients || [];
  return (
    <Card className="p-6">
      <div data-testid="cp-picker">
        <div className="text-base font-semibold text-ink">Select a client</div>
        <p className="text-sm text-muted mt-1">Choose a governed client to open the portfolio command screen.</p>
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

function PolicySnapshot({ value }: { value: any }) {
  const ps = value.policy_snapshot || {};
  return (
    <Card className="p-4">
      <div data-testid="cp-policy-snapshot">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-ink">Policy Snapshot</div>
            <div className="text-xs text-muted">Policy and client overview from governed canonical rows</div>
          </div>
          <span className="rounded-full bg-brandSoft px-3 py-1 text-xs font-semibold text-brand">
            {text(ps.due_bucket)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs lg:grid-cols-4">
          <div className="min-w-0"><div className="text-muted">Policy Number</div><div className="mt-1 break-words font-semibold text-ink">{Array.isArray(ps.policy_numbers) && ps.policy_numbers.length ? ps.policy_numbers.join(", ") : NA}</div></div>
          <div className="min-w-0"><div className="text-muted">Policy Period</div><div className="mt-1 break-words font-semibold text-ink">{text(ps.policy_start_date)} to {text(ps.policy_end_date)}</div></div>
          <div className="min-w-0"><div className="text-muted">Insurer</div><div className="mt-1 break-words font-semibold text-ink">{Array.isArray(ps.insurers) && ps.insurers.length ? ps.insurers.join(", ") : NA}</div></div>
          <div className="min-w-0"><div className="text-muted">TPA</div><div className="mt-1 break-words font-semibold text-ink">{Array.isArray(ps.tpas) && ps.tpas.length ? ps.tpas.join(", ") : NA}</div></div>
          <div className="min-w-0"><div className="text-muted">Renewal Date</div><div className="mt-1 break-words font-semibold text-ink">{text(ps.policy_end_date)}</div></div>
          <div className="min-w-0"><div className="text-muted">Days to Renewal</div><div className="mt-1 break-words font-semibold text-ink">{ps.days_to_renewal != null ? `${num(ps.days_to_renewal)} Days` : NA}</div></div>
          <div className="min-w-0"><div className="text-muted">Policy Status</div><div className="mt-1 break-words font-semibold text-ink">{statusText(ps.policy_status)}</div></div>
          <div className="min-w-0"><div className="text-muted">Client ID</div><div className="mt-1 break-words font-semibold text-ink">{text(value.client_id)}</div></div>
        </div>
      </div>
    </Card>
  );
}

function PolicyExposure({ exposure }: { exposure: any }) {
  const si = exposure?.sum_insured_distribution || {};
  const rows = [
    { label: "Min SI", value: si.min, color: SERIES[0] },
    { label: "Average SI", value: si.average, color: SERIES[1] },
    { label: "Max SI", value: si.max, color: SERIES[2] },
  ];
  return (
    <Card className="p-4">
      <div data-testid="cp-policy-exposure">
        <div className="text-sm font-semibold text-ink">Policy Exposure</div>
        <div className="mt-1 text-xs text-muted">Supported exposure fields only; benefit values remain unavailable until governed</div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <MiniStat label="Total Sum Insured" value={money(exposure?.total_sum_insured)} sub="Member SI rollup" testid="cp-exposure-total-si" />
          <MiniStat label="Corporate Floater" value={money(exposure?.corporate_floater_sum_insured)} sub="Backend supplied only" testid="cp-exposure-buffer" />
        </div>
        <div className="mt-4">
          <BarH data={rows} format={(x) => num(x)} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          {["Room Rent", "Maternity", "PED", "Dental", "Vision", "OPD"].map((label) => (
            <div key={label} className="rounded-lg border border-line px-3 py-2">
              <div className="font-semibold text-ink">{label}</div>
              <div className="mt-0.5 text-muted">{NA}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function RiskReadinessCenter({ risk, status }: { risk: any; status: string }) {
  const bm = risk?.benchmarking_status || {};
  const pl = risk?.placement_status || {};
  const wl = risk?.wellness_status || {};
  const rn = risk?.renewal_status || {};
  return (
    <Card className="p-4">
      <div data-testid="cp-risk-readiness">
        <div className="text-sm font-semibold text-ink">Risk & Readiness Center</div>
        <div className="mt-1 text-xs text-muted">Governed readiness signals from connected module engines</div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <MiniStat label="Data Quality" value={text(status)} sub="Advisory reliability basis" testid="cp-ready-dq" />
          <MiniStat label="Renewal Window" value={rn.days_to_renewal != null ? `${num(rn.days_to_renewal)} Days` : NA}
            sub={rn.next_renewal_date ? String(rn.next_renewal_date) : "No end date on file"} testid="cp-ready-renewal" />
          <MiniStat label="Benchmarking" value={bm.valid_peer_group ? "Comparable" : NA}
            sub={bm.valid_peer_group ? `${num(bm.features_comparable)} of ${num(bm.features_total)} features` : "No valid peer group"} testid="cp-ready-benchmarking" />
          <MiniStat label="Placement" value={pl.placement_state ? String(pl.placement_state) : NA}
            sub={pl.incumbent_defence_score != null ? `Defence ${text(pl.incumbent_defence_score)}` : "Backend supplied only"} testid="cp-ready-placement" />
          <MiniStat label="Wellness" value={wl.posture ? "Assessed" : NA}
            sub={wl.posture ? String(wl.posture).slice(0, 60) : "Backend supplied only"} testid="cp-ready-wellness" />
          <MiniStat label="Risk Score" value={num(risk?.risk_score)} sub="Backend supplied only" testid="cp-ready-risk-score" />
        </div>
      </div>
    </Card>
  );
}

function ActionCenter({ action, clientId }: { action: any; clientId: string }) {
  const nav = useNavigate();
  const nba = action?.next_best_action || {};
  const actions = action?.linked_actions || [];
  return (
    <Card className="p-4">
      <div data-testid="cp-action-cards">
        <div className="text-sm font-semibold text-ink">Linked Action Cards</div>
        <div className="mt-1 text-xs text-muted">Open governed module views for the selected client</div>
        <div className="mt-4 rounded-lg border border-line bg-slate-50 px-3 py-3">
          <div className="text-xs uppercase text-muted">Next Best Action</div>
          <div className="mt-1 text-base font-semibold text-ink">{text(nba.recommendation)}</div>
          <div className="mt-1 text-xs text-muted">{nba.reason ? String(nba.reason) : "Open Renewal Intelligence for full governed reasoning."}</div>
          <div className="mt-2 text-[11px] font-semibold text-brand">Confidence: {text(nba.confidence)}</div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {actions.map((item: any) => (
            <button key={item.key} onClick={() => nav(`${item.path}?client_id=${clientId}`)}
              className="rounded-lg border border-line px-3 py-3 text-left hover:bg-brandSoft">
              <div className="text-sm font-semibold text-ink">{text(item.label)}</div>
              <div className="mt-0.5 text-xs text-brand">Open module</div>
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

function EvidenceFooter({ status, evidence, onEvidence }: { status: string; evidence: any; onEvidence: () => void }) {
  const sources = evidence?.source_basis || [];
  return (
    <Card className="p-4">
      <div data-testid="cp-evidence-footer" className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-ink">Evidence & Caveats</div>
          <div className="mt-1 text-xs text-muted">
            Client Portfolio renders governed backend values only. Unsupported advanced KPIs show as {NA}.
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

export function ClientPortfolio() {
  const [sp] = useSearchParams();
  const [ev, setEv] = useState(false);
  const clientId = sp.get("client_id") || undefined;

  const q = useQuery({ queryKey: ["portfolio", "client-overview", clientId], enabled: !!clientId,
    queryFn: () => api.portfolio("client-overview", { client_id: clientId }) });

  const relationData = useMemo(() => {
    const rel = q.data?.value?.population_snapshot?.relation_distribution || {};
    return Object.keys(rel).map((key, index) => ({ label: key, value: rel[key], color: SERIES[index] }));
  }, [q.data]);

  if (!clientId) {
    return <div className="space-y-5"><TopClientContextBar value={{ client_name: "Select Client", policy_snapshot: {} }} status="No Data" onEvidence={() => setEv(true)} /><ClientPicker /></div>;
  }
  if (q.isLoading) return <div className="space-y-5"><TopClientContextBar value={{ client_name: "Client Portfolio", policy_snapshot: {} }} status="No Data" onEvidence={() => setEv(true)} /><Skeleton rows={5} /></div>;
  if (q.isError) return <div className="space-y-5"><TopClientContextBar value={{ client_name: "Client Portfolio", policy_snapshot: {} }} status="No Data" onEvidence={() => setEv(true)} /><ErrorState onRetry={() => q.refetch()} /></div>;

  const d = q.data;
  const status = d?.data_quality_status || "No Data";
  if (status === "No Data") {
    return (
      <div className="space-y-5">
        <TopClientContextBar value={{ client_name: "Client Portfolio", policy_snapshot: {} }} status={status} onEvidence={() => setEv(true)} />
        <EmptyState message="No governed data for this client yet. Complete Data Onboarding and activate the client's data." />
      </div>
    );
  }

  const v = d.value || {};
  const ps = v.policy_snapshot || {};
  const fs = v.financial_snapshot || {};
  const pop = v.population_snapshot || {};
  const risk = v.risk_readiness || {};
  const action = v.action_center || {};
  const unsupported = v.unsupported_metrics || {};

  const financialRows = [
    { label: "Premium vs Claims", segments: [
      { label: "Annual Premium", value: fs.annual_premium, color: SERIES[0] },
      { label: "Claims Incurred", value: fs.claims_incurred, color: SERIES[3] },
    ] },
  ];
  const exposure = ps.exposure || {};

  return (
    <div className="space-y-5" data-testid="cp-master-screen">
      <TopClientContextBar value={v} status={status} onEvidence={() => setEv(true)} />
      <RestrictedBanner blocked={d.advisory_blocked} />
      <CaveatBanner caveats={d.caveats} />

      <PolicySnapshot value={v} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="cp-kpi-band">
        <KpiStat label="Lives Covered" value={num(pop.lives)} sub="Distinct members" badge={<DataQualityBadge status={status} />} testid="cp-kpi-lives" />
        <KpiStat label="Annual Premium" value={money(fs.annual_premium)} sub={`Basis: ${text(fs.premium_basis)}`} testid="cp-kpi-premium" />
        <KpiStat label="Claims Incurred" value={money(fs.claims_incurred)} sub={`${num(fs.claim_count)} claims`} testid="cp-kpi-incurred" />
        <KpiStat label="Operational ICR" value={pct(fs.operational_icr)} sub="Backend computed" onEvidence={() => setEv(true)} testid="cp-kpi-icr" />
        <KpiStat label="Next Renewal" value={ps.days_to_renewal != null ? `${num(ps.days_to_renewal)} Days` : NA} sub={text(ps.policy_end_date)} testid="cp-kpi-renewal" />
        <KpiStat label="Projected ICR" value={pct(unsupported.projected_icr)} sub="Backend supplied only" testid="cp-kpi-projected" />
        <KpiStat label="Annualized ICR" value={pct(unsupported.annualized_icr)} sub="Backend supplied only" testid="cp-kpi-annualized" />
        <KpiStat label="Opportunity Value" value={money(unsupported.opportunity_value)} sub="Backend supplied only" testid="cp-kpi-opportunity" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr,0.8fr,1fr]">
        <ChartFrame title="Premium / Claims / ICR" subtitle="Financial snapshot from governed engines"
          status={status} caveats={d.caveats} evidence={d} evidenceTitle="Client portfolio evidence"
          testid="cp-financial-visual" empty={fs.annual_premium == null && fs.claims_incurred == null && fs.operational_icr == null}
          emptyMessage="Financial snapshot is not available.">
          <div className="grid gap-4 lg:grid-cols-[1fr,0.7fr]">
            <StackedBar rows={financialRows} format={(x) => money(x)} />
            <Gauge value={fs.operational_icr} valueText={pct(fs.operational_icr)} label="Operational ICR"
              bands={[{ upTo: 85, color: "#16A34A" }, { upTo: 100, color: "#D97706" }, { upTo: 999, color: "#DC2626" }]} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-line px-3 py-2"><div className="text-muted">Earned Premium</div><div className="font-semibold text-ink">{money(fs.earned_premium)}</div></div>
            <div className="rounded-lg border border-line px-3 py-2"><div className="text-muted">Premium Basis</div><div className="font-semibold text-ink">{text(fs.premium_basis)}</div></div>
          </div>
        </ChartFrame>

        <ChartFrame title="Lives & Relation Snapshot" subtitle="Population mix from member master" status={status}
          evidence={d} evidenceTitle="Client portfolio evidence" testid="cp-population-snapshot"
          empty={relationData.length === 0} emptyMessage="Population relation mix is not available.">
          <Donut data={relationData} centerValue={num(pop.lives)} centerLabel="lives" />
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-line px-2 py-2"><div className="text-muted">Employees</div><div className="font-semibold text-ink">{num(pop.employees)}</div></div>
            <div className="rounded-lg border border-line px-2 py-2"><div className="text-muted">Dependents</div><div className="font-semibold text-ink">{num(pop.dependents)}</div></div>
            <div className="rounded-lg border border-line px-2 py-2"><div className="text-muted">Avg Age</div><div className="font-semibold text-ink">{num(pop.average_age)}</div></div>
          </div>
        </ChartFrame>

        <RiskReadinessCenter risk={risk} status={status} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr,1fr]">
        <PolicyExposure exposure={exposure} />
        <ActionCenter action={action} clientId={clientId} />
      </div>

      <EvidenceFooter status={status} evidence={d} onEvidence={() => setEv(true)} />
      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="Client portfolio evidence" evidence={ev ? d : null} />
    </div>
  );
}
