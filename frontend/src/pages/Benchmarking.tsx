import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtValue, fmtNumber } from "../lib/format";
import {
  SectionHeader, Card, DecisionSummary, CaveatBanner, Skeleton, EmptyState, ErrorState,
} from "../components/ui/primitives";
import { EvidenceDrawer } from "../components/ui/sandbox";
import { Donut, BarH, SERIES } from "../components/ui/charts";

/** The six benchmark features that map to a governed Savings Sandbox lever (Sprint 17).
 *  Every other feature is discussion-only — the UI never invents a lever. Mirrors the
 *  backend SANDBOX_LEVER_MAP; the backend remains the source of truth. */
const SIM_READY_FEATURES = new Set([
  "room_rent", "copay", "parent_copay", "disease_capping", "maternity_limit", "corporate_buffer",
]);
const NA_CLASS = "Not Available / Not Comparable";
const isSimReady = (featureId: string, classification: string) =>
  SIM_READY_FEATURES.has(featureId) && classification !== NA_CLASS;

/** Read the selected client from the URL (?client_id=). Actions need a client to derive the
 *  governed gap; without one the buttons prompt the user to select a client. */
function useClientId(): string | undefined {
  const [sp] = useSearchParams();
  return sp.get("client_id") || undefined;
}

/** Fixed governance caveat: benchmarking never computes cost impact — simulation lives in
 *  Renewal Intelligence / Savings Sandbox. Slash wrapped in a string literal (no frontend math). */
function LinkageNote() {
  return (
    <div data-testid="bm-linkage-note" className="text-xs text-muted bg-brandSoft border border-line rounded-xl2 px-4 py-2">
      {"Impact simulation runs in Renewal Intelligence / Savings Sandbox. Benefit Benchmarking does not compute cost impact — it compares benefit design and policy terms only."}
    </div>
  );
}

/** Per-gap action controls: flag for discussion, or (when simulation-ready) send to the
 *  Savings Sandbox. Gated on the benchmark_action capability (mirrors the backend write
 *  guard). No simulation or benchmark math happens here — the server derives everything. */
function GapActionControls({ item, clientId }: { item: any; clientId?: string }) {
  const { hasCapability } = useAuth();
  const nav = useNavigate();
  const canAct = hasCapability("benchmark_action");
  const ready = isSimReady(item.feature_id, item.classification);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function act(action: string, thenSandbox = false) {
    if (!clientId) { setErr("Select a client to flag this gap."); return; }
    setBusy(action); setErr(null);
    try {
      const a = await api.benchmarkActions.flagGap(item.feature_id, { client_id: clientId }, action);
      setResult(a);
      if (thenSandbox && a && a.simulation_ready) nav(`/renewal/savings-sandbox?fromAction=${a.id}`);
    } catch (e: any) { setErr(e.message || "Action failed"); }
    finally { setBusy(null); }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="bm-action-controls">
      <span data-testid="bm-sim-indicator"
        className={`text-[11px] px-2 py-0.5 rounded-full border ${ready ? "bg-green-50 text-good border-green-200" : "bg-slate-100 text-muted border-line"}`}>
        {ready ? "Simulation-ready" : "Discussion only"}
      </span>
      {result && (
        <span data-testid="bm-action-status" className="text-[11px] px-2 py-0.5 rounded-full border bg-brandSoft text-brand border-blue-200">
          Status: {String(result.status)} · {String(result.target_module)}
        </span>
      )}
      {canAct && (
        <>
          <button data-testid="bm-flag-btn" disabled={!!busy} onClick={() => act("flag_for_discussion")}
            className="text-[11px] font-medium px-2.5 py-1 rounded-lg border border-line text-ink/80 hover:bg-slate-50 disabled:opacity-50">
            Flag for discussion
          </button>
          {ready && (
            <button data-testid="bm-send-btn" disabled={!!busy} onClick={() => act("send_to_sandbox", true)}
              className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-brand text-white disabled:opacity-50">
              Send to Savings Sandbox
            </button>
          )}
        </>
      )}
      {err && <span data-testid="bm-action-error" className="text-[11px] text-bad">{err}</span>}
    </div>
  );
}

/** Benefits & Benchmarking sub-tabs — single-sourced from the governed Sprint 15
 *  /benchmarking/* APIs. Benefit DESIGN + policy terms only; no claims/ICR/utilization are
 *  requested, rendered or computed. Nothing is calculated in the browser. */

const CLASS_STYLE: Record<string, string> = {
  "Same as Benchmark": "bg-brandSoft text-brand border-blue-200",
  "Above Benchmark": "bg-green-50 text-good border-green-200",
  "Below Benchmark": "bg-red-50 text-bad border-red-200",
  "Different from Benchmark": "bg-amber-50 text-warn border-amber-200",
  "Not Available / Not Comparable": "bg-slate-100 text-muted border-line",
};

function ClassBadge({ c }: { c: string }) {
  return <span data-testid="bm-class-badge"
    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${CLASS_STYLE[c] || CLASS_STYLE["Not Available / Not Comparable"]}`}>{c}</span>;
}

function PeerChip({ d }: { d: any }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-muted bg-brandSoft border border-line rounded-full px-2 py-0.5">Peers: {fmtNumber(d.peer_count)}</span>
      <span className="text-[11px] font-semibold text-muted bg-slate-100 border border-line rounded-full px-2 py-0.5">Confidence: {String(d.confidence)}</span>
    </div>
  );
}

function InvalidPeerBanner({ d }: { d: any }) {
  if (d.valid_peer_group !== false) return null;
  return (
    <div role="alert" data-testid="bm-invalid-peer"
      className="bg-amber-50 border border-amber-200 text-warn rounded-xl2 px-4 py-3 text-sm">
      <b>Not Comparable — peer group too small.</b> No benchmark is produced without a valid peer group
      (minimum {fmtNumber(d.peer_group_definition?.min_peer_count)} peers). Add more governed policies to the
      portfolio to benchmark against.
    </div>
  );
}

function useBench(kind: string) {
  return useQuery({ queryKey: ["bm", kind], queryFn: () => api.benchmarking(kind).then((r) => r ?? null) });
}

function BenchmarkFrame({ title, subtitle, q, evidenceTitle, children }:
  { title: string; subtitle: string; q: any; evidenceTitle: string; children: (d: any) => React.ReactNode }) {
  const [ev, setEv] = useState(false);
  if (q.isLoading) return <><SectionHeader title={title} subtitle={subtitle} /><Skeleton rows={4} /></>;
  if (q.isError) return <><SectionHeader title={title} /><ErrorState onRetry={() => q.refetch()} /></>;
  const d = q.data;
  if (!d) return <><SectionHeader title={title} /><EmptyState title="Benchmark pending governed data"
    message="No governed benchmark available yet. Complete Data Onboarding and confirm policy benefit terms to benchmark." /></>;
  return (
    <div className="space-y-5">
      <SectionHeader title={title} subtitle={subtitle} right={<PeerChip d={d} />} />
      <InvalidPeerBanner d={d} />
      <CaveatBanner caveats={d.caveats} />
      {children(d)}
      <button className="text-xs font-medium text-brand hover:underline" onClick={() => setEv(true)}>View evidence &amp; caveats →</button>
      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title={evidenceTitle} evidence={ev ? d : null} />
    </div>
  );
}

function ComparisonTable({ rows, testid, actions, compareBars }:
  { rows: any[]; testid: string; actions?: (row: any) => React.ReactNode; compareBars?: boolean }) {
  return (
    <div className="overflow-x-auto" data-testid={testid}>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-muted border-b border-line">
          <th className="py-1.5 pr-4 font-medium">Feature</th><th className="py-1.5 pr-4 font-medium">Client value</th>
          <th className="py-1.5 pr-4 font-medium">Peer benchmark</th><th className="py-1.5 pr-4 font-medium">Classification</th>
          <th className="py-1.5 pr-4 font-medium">Note</th></tr></thead>
        <tbody>
          {rows.map((f: any) => (
            <React.Fragment key={f.feature_id}>
              <tr className="border-b border-line/60" data-testid="bm-feature-row">
                <td className="py-2 pr-4 text-ink">{f.feature}</td>
                <td className="py-2 pr-4">{f.client_value != null ? fmtValue(f.client_value) : (f.client_text || "—")}</td>
                <td className="py-2 pr-4">{f.benchmark_value != null ? fmtValue(f.benchmark_value) : (f.peer_value ?? "—")}</td>
                <td className="py-2 pr-4"><ClassBadge c={f.classification} /></td>
                <td className="py-2 pr-4 text-xs text-muted">{f.not_comparable_reason || f.discussion_point}</td>
              </tr>
              {compareBars && typeof f.client_value === "number" && typeof f.benchmark_value === "number" && (
                <tr className="border-b border-line/60"><td colSpan={5} className="pb-3 pr-4">
                  <div data-testid="bm-compare-bar" className="max-w-md">
                    <BarH data={[{ label: "Client", value: f.client_value, color: "#2563EB" },
                                 { label: "Peer benchmark", value: f.benchmark_value, color: "#94A3B8" }]} format={(x) => fmtValue(x)} />
                  </div></td></tr>
              )}
              {actions && (
                <tr className="border-b border-line/60"><td colSpan={5} className="pb-3 pr-4">{actions(f)}</td></tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- 1. Benchmark Overview -------------------------------------------------
export function BenchmarkOverview() {
  const q = useBench("overview");
  return (
    <BenchmarkFrame title="Benchmark Overview" subtitle="How the client's benefit design compares to the peer group" q={q} evidenceTitle="Benchmark overview evidence">
      {(d) => {
        const counts = d.classification_counts || {};
        return (
          <>
            <DecisionSummary title={d.summary || "Governed benefit-design benchmark."} points={[
              `${fmtNumber(d.features_comparable)} of ${fmtNumber(d.features_total)} features are comparable against ${fmtNumber(d.peer_count)} peer polic(ies).`,
              `Confidence ${d.confidence} · reliability ${d.reliability} · basis ${String(d.benchmark_basis)}.`,
            ]} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="p-4"><div className="text-xs uppercase tracking-wide text-muted">Features benchmarked</div>
                <div className="text-2xl font-semibold mt-1">{fmtNumber(d.features_total)}</div></Card>
              <Card className="p-4"><div className="text-xs uppercase tracking-wide text-muted">Comparable</div>
                <div className="text-2xl font-semibold mt-1">{fmtNumber(d.features_comparable)}</div></Card>
              <Card className="p-4"><div className="text-xs uppercase tracking-wide text-muted">Peer group</div>
                <div className="text-2xl font-semibold mt-1" data-testid="bm-confidence">{fmtNumber(d.peer_count)} peers · {String(d.confidence)}</div></Card>
            </div>
            <Card className="p-4">
              <div className="text-sm font-medium mb-2">Classification summary</div>
              <div className="flex flex-wrap gap-2" data-testid="bm-counts">
                {["Same as Benchmark", "Above Benchmark", "Below Benchmark", "Different from Benchmark", "Not Available / Not Comparable"].map((k) => (
                  <span key={k} className={`text-xs px-2 py-1 rounded-lg border ${CLASS_STYLE[k]}`}>{k}: {fmtNumber(counts[k] || 0)}</span>
                ))}
              </div>
              <div className="mt-4" data-testid="bm-class-donut">
                <Donut data={["Same as Benchmark", "Above Benchmark", "Below Benchmark", "Different from Benchmark", "Not Available / Not Comparable"]
                  .map((k, i) => ({ label: k, value: counts[k] || 0, color: SERIES[i % SERIES.length] }))}
                  centerValue={fmtNumber(d.features_total)} centerLabel="features" />
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-sm font-medium mb-1">Peer group</div>
              <div className="text-sm text-muted" data-testid="bm-peer-summary">
                Basis: {String(d.peer_group_definition?.basis)} · peers: {fmtNumber(d.peer_count)} · minimum {fmtNumber(d.peer_group_definition?.min_peer_count)}.
              </div>
            </Card>
          </>
        );
      }}
    </BenchmarkFrame>
  );
}

// ---- 2. Benefit Design Features -------------------------------------------
export function BenchmarkFeatures() {
  const q = useBench("features");
  const clientId = useClientId();
  return (
    <BenchmarkFrame title="Benefit Design Features" subtitle="Feature-by-feature benefit design vs the peer benchmark" q={q} evidenceTitle="Feature benchmark evidence">
      {(d) => (
        <>
          <LinkageNote />
          <Card className="p-4">
            <div className="text-sm font-medium mb-2">Benefit design features ({fmtNumber((d.features || []).length)})</div>
            <ComparisonTable rows={d.features || []} testid="bm-features-table" compareBars
              actions={(f) => <GapActionControls item={f} clientId={clientId} />} />
          </Card>
        </>
      )}
    </BenchmarkFrame>
  );
}

// ---- 3. Policy Terms Comparison -------------------------------------------
export function BenchmarkPolicyTerms() {
  const q = useBench("policy-terms-comparison");
  return (
    <BenchmarkFrame title="Policy Terms Comparison" subtitle="Policy terms & conditions vs the peer benchmark" q={q} evidenceTitle="Policy terms evidence">
      {(d) => (
        <Card className="p-4">
          <div className="text-sm font-medium mb-2">Policy terms & conditions ({fmtNumber((d.policy_terms || []).length)})</div>
          <ComparisonTable rows={d.policy_terms || []} testid="bm-policy-terms" />
        </Card>
      )}
    </BenchmarkFrame>
  );
}

// ---- 4. Market / Peer Comparison ------------------------------------------
export function BenchmarkPeer() {
  const q = useBench("peer-comparison");
  return (
    <BenchmarkFrame title="Market / Peer Comparison" subtitle="Peer group definition and benchmark basis" q={q} evidenceTitle="Peer comparison evidence">
      {(d) => {
        const def = d.peer_group_definition || {};
        return (
          <>
            <Card className="p-4">
              <div className="text-sm font-medium mb-2">Peer group definition</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm" data-testid="bm-peer-def">
                <div><span className="text-muted">Basis: </span>{String(def.basis)}</div>
                <div><span className="text-muted">Peer count: </span><span data-testid="bm-peer-count">{fmtNumber(d.peer_count)}</span></div>
                <div><span className="text-muted">Benchmark basis: </span>{String(d.benchmark_basis)}</div>
                <div><span className="text-muted">Source: </span>{String(d.source)}</div>
                <div><span className="text-muted">Minimum peers: </span>{fmtNumber(def.min_peer_count)}</div>
                <div><span className="text-muted">Confidence: </span>{String(d.confidence)} ({fmtValue(d.confidence_score)})</div>
              </div>
            </Card>
            {(d.comparisons || []).length > 0 && (
              <Card className="p-4"><div className="text-sm font-medium mb-2">Features with a live peer benchmark</div>
                <ComparisonTable rows={d.comparisons} testid="bm-peer-features" /></Card>
            )}
          </>
        );
      }}
    </BenchmarkFrame>
  );
}

// ---- 5. Benefit Gap Analysis ----------------------------------------------
export function BenchmarkGaps() {
  const q = useBench("gap-analysis");
  const clientId = useClientId();
  return (
    <BenchmarkFrame title="Benefit Gap Analysis" subtitle="Features less generous than the peer benchmark (direction-aware)" q={q} evidenceTitle="Gap analysis evidence">
      {(d) => {
        const gaps = d.gaps || [];
        return gaps.length === 0 ? (
          <>
            <LinkageNote />
            <Card className="p-6"><div className="text-sm text-muted" data-testid="bm-gaps">No benefit gaps vs the peer benchmark for the comparable features.</div></Card>
          </>
        ) : (
          <>
            <LinkageNote />
            <Card className="p-4">
              <div className="text-sm font-medium mb-2">Benefit gaps ({fmtNumber(gaps.length)})</div>
              <div className="space-y-3" data-testid="bm-gaps">
                {gaps.map((g: any) => (
                  <div key={g.feature_id} className="border-b border-line/60 pb-2" data-testid="bm-gap-row">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-ink">{g.feature}</div>
                      <ClassBadge c={g.classification} />
                    </div>
                    <div className="text-xs text-muted mt-1">Client: {g.client_value != null ? fmtValue(g.client_value) : (g.client_text || "—")} · Peer benchmark: {g.benchmark_value != null ? fmtValue(g.benchmark_value) : "—"}</div>
                    <div className="text-sm text-ink mt-1">{g.discussion_point}</div>
                    <GapActionControls item={g} clientId={clientId} />
                  </div>
                ))}
              </div>
            </Card>
          </>
        );
      }}
    </BenchmarkFrame>
  );
}

// ---- 6. Discussion Points --------------------------------------------------
export function BenchmarkDiscussion() {
  const q = useBench("discussion-points");
  return (
    <BenchmarkFrame title="Discussion Points" subtitle="Benefit-design discussion points from the benchmark gaps" q={q} evidenceTitle="Discussion points evidence">
      {(d) => {
        const points = d.discussion_points || [];
        return points.length === 0 ? (
          <Card className="p-6"><div className="text-sm text-muted" data-testid="bm-discussion">No discussion points — benefit design is at or above the peer benchmark on comparable features.</div></Card>
        ) : (
          <Card className="p-4">
            <div className="text-sm font-medium mb-2">Recommended benefit discussion points ({fmtNumber(points.length)})</div>
            <ul className="space-y-2" data-testid="bm-discussion">
              {points.map((p: any) => (
                <li key={p.feature_id} className="text-sm" data-testid="bm-disc-item">
                  <span className="text-xs font-semibold uppercase tracking-wide text-brand">{p.feature}: </span>
                  <span className="text-ink">{p.discussion_point}</span>
                </li>
              ))}
            </ul>
          </Card>
        );
      }}
    </BenchmarkFrame>
  );
}

// ---- 7. Evidence / Export --------------------------------------------------
export function BenchmarkEvidence() {
  const q = useBench("evidence/gap-analysis");
  return (
    <BenchmarkFrame title="Evidence / Export" subtitle="Peer group, benchmark basis and source evidence (export coming later)" q={q} evidenceTitle="Benchmark evidence">
      {(d) => {
        const def = d.peer_group_definition || {};
        return (
          <Card className="p-4">
            <div className="text-sm font-medium mb-2">Benchmark evidence</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm" data-testid="bm-evidence">
              <div><span className="text-muted">Peer group basis: </span>{String(def.basis)}</div>
              <div><span className="text-muted">Peer count: </span>{fmtNumber(d.peer_count)}</div>
              <div><span className="text-muted">Benchmark basis: </span>{String(d.benchmark_basis)}</div>
              <div><span className="text-muted">Config version: </span>{String(d.config_version)}</div>
              <div><span className="text-muted">Confidence: </span>{String(d.confidence)} ({fmtValue(d.confidence_score)})</div>
              <div><span className="text-muted">Evidence completeness: </span>{fmtValue(d.evidence_completeness)}</div>
            </div>
            <div className="text-xs text-muted mt-3">{"Export (PPT / Client Pack) will be added in a later sprint."}</div>
          </Card>
        );
      }}
    </BenchmarkFrame>
  );
}
