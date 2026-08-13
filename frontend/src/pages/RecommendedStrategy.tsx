import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtPercent } from "../lib/format";
import {
  Card, DecisionSummary, DataQualityBadge, CaveatBanner,
  RestrictedBanner, Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { EvidenceDrawer, LeverClassificationBadge } from "../components/ui/sandbox";
import { KpiStat, ChartFrame, BarH, SERIES } from "../components/ui/charts";

const NA = "Not Available";

function clean(v: string): string {
  return v === "-" || v === "â€”" ? NA : v;
}

function pct(v: number | null | undefined): string {
  return clean(fmtPercent(v));
}

function money(v: number | null | undefined): string {
  return clean(fmtCurrency(v));
}

export function RecommendedStrategy() {
  const [ev, setEv] = useState(false);
  const q = useQuery({ queryKey: ["reco", "renewal"], queryFn: () => api.recommendation("renewal") });

  if (q.isLoading) return <div className="space-y-5"><Skeleton rows={4} /></div>;
  if (q.isError) return <div className="space-y-5"><ErrorState onRetry={() => q.refetch()} /></div>;

  const d = q.data || {};
  const status = d.data_quality_status || "No Data";
  if (status === "No Data")
    return <EmptyState title="Recommendation pending governed data"
      message="No activated governed data yet. Complete Data Onboarding to generate the renewal recommendation." />;

  const reasoning: any[] = d.reasoning || [];
  const talking: string[] = d.talking_points || [];
  const sources: string[] = d.source_metrics_used || [];
  const employer = d.employer_impact || {};
  const employee = d.employee_impact || {};
  const nba = d.next_best_action;
  const confLine = `Confidence ${d.confidence || NA}; reliability ${d.reliability || NA}.`;

  return (
    <div className="space-y-5" data-testid="strategy-master-screen">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between" data-testid="rs-top-context">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Recommended Strategy</h1>
          <p className="mt-1 text-sm text-muted">Boardroom renewal stance from the governed recommendation engine</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl2 border border-line bg-card px-4 py-2">
            <div className="text-[11px] text-muted">Data Quality Score</div>
            <DataQualityBadge status={status} />
          </div>
          <button className="rounded-xl2 bg-brand px-4 py-2 text-sm font-semibold text-white">Export</button>
        </div>
      </div>
      <RestrictedBanner blocked={d.advisory_blocked} />
      <CaveatBanner caveats={d.caveats} />

      <DecisionSummary title={String(d.recommendation)} points={[
        d.summary || "Governed renewal recommendation.",
        confLine,
      ]} />

      <Card className="p-4 border-l-4 border-l-brand">
        <div data-testid="strategy-boardroom-summary">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand">Boardroom Strategy Brief</div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
              <div className="text-xs text-muted">Decision stance</div>
              <div className="mt-1 text-lg font-semibold text-ink">{String(d.recommendation)}</div>
            </div>
            <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
              <div className="text-xs text-muted">Confidence</div>
              <div className="mt-1 text-lg font-semibold text-ink">{String(d.confidence || NA)}</div>
            </div>
            <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
              <div className="text-xs text-muted">Strategy score</div>
              <div className="mt-1 text-lg font-semibold text-ink">{NA}</div>
            </div>
            <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
              <div className="text-xs text-muted">Evidence pack state</div>
              <div className="mt-1 text-lg font-semibold text-ink">Planned</div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4" data-testid="rs-kpis">
        <KpiStat label="Recommended stance" value={String(d.recommendation)} sub="Backend recommendation" testid="rs-stance" />
        <KpiStat label="Confidence" value={String(d.confidence || NA)} sub={`reliability ${String(d.reliability || NA)}`} testid="rs-confidence" />
        <KpiStat label="Strategy Score" value={NA} sub="Backend supplied only" testid="rs-strategy-score" />
        <KpiStat label="Next Best Action" value={nba ? "Available" : NA} sub="Backend supplied only" testid="rs-nba-status" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartFrame title="Risk and Action Matrix" subtitle="Backend confidence; unsupported score remains explicit" status={status} evidence={d} evidenceTitle="Strategy evidence" testid="rs-risk-action-matrix">
          <BarH data={[
            { label: "Confidence score", value: d.confidence_score, color: SERIES[0] },
            { label: "Strategy score", value: null, color: SERIES[3] },
          ]} format={(x) => String(x)} />
        </ChartFrame>
        <Card className="p-4">
          <div data-testid="rs-source-metrics">
            <div className="text-sm font-semibold text-ink">Source Metrics</div>
            <div className="mt-3 flex flex-wrap gap-1">
              {sources.length > 0 ? sources.map((s) => (
                <span key={s} className="text-[11px] text-muted bg-brandSoft border border-line rounded-full px-2 py-0.5">{s}</span>
              )) : <span className="text-sm text-muted">{NA}</span>}
            </div>
          </div>
        </Card>
      </div>

      {reasoning.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-semibold text-ink mb-2">Why this recommendation</div>
          <ul className="list-disc pl-5 text-sm text-ink/80 space-y-1" data-testid="rs-reasoning">
            {reasoning.map((r, i) => <li key={i}>{r.explanation}</li>)}
          </ul>
        </Card>
      )}

      <Card className="p-4">
        <div className="text-sm font-semibold text-ink mb-2">Operational and Adjusted ICR</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><div className="text-xs text-muted">Operational ICR unchanged</div>
            <div className="text-xl font-semibold" data-testid="rs-op-icr">{pct(d.operational_icr)}</div></div>
          <div><div className="text-xs text-muted">Adjusted defendable ICR</div>
            <div className="text-xl font-semibold text-warn" data-testid="rs-adj-icr">{pct(d.adjusted_icr)}</div></div>
        </div>
        {d.adjusted_icr_note && <p className="text-xs text-muted mt-2">{String(d.adjusted_icr_note)}</p>}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="text-sm font-semibold text-ink mb-2">Employer Impact</div>
          <div data-testid="rs-employer">
            {(employer.defensible_levers || []).length > 0 ? (
              <ul className="space-y-2">
                {employer.defensible_levers.map((l: any) => (
                  <li key={l.lever} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink capitalize">{String(l.lever).split("_").join(" ")}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-ink font-medium">{money(l.expected_saving)}</span>
                      <LeverClassificationBadge classification={l.classification} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : <div className="text-sm text-muted">{NA}</div>}
          </div>
          {employer.note && <p className="text-xs text-muted mt-2">{String(employer.note)}</p>}
        </Card>
        <Card className="p-4">
          <div className="text-sm font-semibold text-ink mb-2">Employee Impact</div>
          <div data-testid="rs-employee">
            {(employee.high_friction_levers || []).length > 0 ? (
              <ul className="space-y-2">
                {employee.high_friction_levers.map((l: any) => (
                  <li key={l.lever} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink capitalize">{String(l.lever).split("_").join(" ")}</span>
                    <LeverClassificationBadge classification={l.classification} />
                  </li>
                ))}
              </ul>
            ) : <div className="text-sm text-muted">{NA}</div>}
          </div>
          {employee.note && <p className="text-xs text-muted mt-2">{String(employee.note)}</p>}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="text-sm font-semibold text-ink mb-2">Broker Talking Points</div>
          {talking.length > 0 ? (
            <ul className="list-disc pl-5 text-sm text-ink/80 space-y-1" data-testid="rs-talking-points">
              {talking.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          ) : <div className="text-sm text-muted" data-testid="rs-talking-points">{NA}</div>}
        </Card>
        <Card className="p-4 border-l-4 border-l-green-400">
          <div className="text-xs font-semibold uppercase tracking-wide text-good mb-1">Next Best Action</div>
          <div className="text-sm text-ink" data-testid="rs-nba">{nba ? String(nba.explanation) : NA}</div>
          <div className="text-xs text-muted mt-2">Basis: {String(d.threshold_basis || d.config_version || "governed defaults")}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3" data-testid="rs-action-rail">
        <Card className="p-4"><div data-testid="rs-alerts"><div className="text-sm font-semibold text-ink">Strategy Alerts</div><div className="mt-3 text-sm text-bad rounded-lg border border-red-200 bg-red-50 px-3 py-2">Unsupported strategy score: {NA}</div></div></Card>
        <Card className="p-4"><div data-testid="rs-opportunities"><div className="text-sm font-semibold text-ink">Opportunities</div><div className="mt-3 text-sm text-good rounded-lg border border-green-200 bg-green-50 px-3 py-2">Use governed talking points in the renewal defence story</div></div></Card>
        <Card className="p-4"><div data-testid="rs-action-center"><div className="text-sm font-semibold text-ink">Action Plan</div><div className="mt-3 text-sm rounded-lg border border-line px-3 py-2">{nba ? String(nba.explanation) : NA}</div></div></Card>
      </div>

      <Card className="p-4">
        <div data-testid="rs-unsupported">
          <div className="text-sm font-semibold text-ink">Unsupported Strategy Outputs</div>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
            {["Strategy score", "Negotiation range", "Actuarial recommendation", "Black-box confidence"].map((label) => (
              <div key={label} className="rounded-lg border border-line bg-slate-50 px-3 py-2">
                <div className="text-xs text-muted">{label}</div>
                <div className="mt-1 text-sm font-semibold text-ink">{NA}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <FourQuestions
        soWhat={`Recommended stance: ${String(d.recommendation)} with ${String(d.confidence || NA)} confidence.`}
        why={reasoning.length > 0 ? String(reasoning[0].explanation) : "Composed by the governed renewal recommendation engine from supported signals."}
        next={nba ? String(nba.explanation) : "Follow the governed next best action once available."}
        trust={`Every field is rendered from the governed renewal recommendation engine on ${status} data. Unsupported strategy score and negotiation range remain ${NA}.`} />

      <Card className="p-4">
        <div data-testid="rs-evidence-footer" className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-ink">Evidence and Caveats</div>
            <div className="mt-1 text-xs text-muted">Recommendation, confidence, reasoning, talking points and action plan come from the governed renewal recommendation engine.</div>
          </div>
          <DataQualityBadge status={status} />
        </div>
      </Card>

      <button className="text-xs font-medium text-brand hover:underline" onClick={() => setEv(true)}>View evidence and caveats</button>
      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="Renewal recommendation evidence" evidence={ev ? d : null} />
    </div>
  );
}
