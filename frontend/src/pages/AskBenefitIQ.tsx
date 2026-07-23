import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtPercent, fmtShare, fmtValue } from "../lib/format";
import {
  SectionHeader, Card, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState,
} from "../components/ui/primitives";
import { EvidenceDrawer } from "../components/ui/sandbox";
import { KpiStat } from "../components/ui/charts";

/** Ask BenefitIQ — a governed advisory copilot (Sprint 26). Deterministic: every answer is composed
 *  server-side from governed engines. This page renders the answer contract — it performs NO
 *  arithmetic, shows evidence/caveats/confidence, and surfaces Not-available / Unsupported states. */

const CONF_STYLE: Record<string, string> = {
  high: "bg-green-50 text-good border-green-200", medium: "bg-amber-50 text-warn border-amber-200",
  low: "bg-red-50 text-bad border-red-200", none: "bg-slate-100 text-muted border-line",
};
const CAT_STYLE = "text-[11px] font-semibold px-2 py-0.5 rounded-full border border-line bg-brandSoft text-brand";

function ConfBadge({ confidence }: { confidence?: string }) {
  const c = (confidence || "none").toLowerCase();
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${CONF_STYLE[c] || CONF_STYLE.none}`}>confidence: {c}</span>;
}

function fmtKpi(value: any, format: string): string {
  if (value === null || value === undefined || value === "") return "Not available";
  switch (format) {
    case "currency": return fmtCurrency(value);
    case "percent": return fmtPercent(value);
    case "number": return fmtNumber(value);
    case "share": return fmtShare(value);
    case "bool": return value ? "Yes" : "No";
    default: return fmtValue(value);
  }
}

export function AskBenefitIQ() {
  const [question, setQuestion] = useState("");
  const [clientId, setClientId] = useState("");
  const [answer, setAnswer] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [ev, setEv] = useState(false);

  const intents = useQuery({ queryKey: ["ask", "intents"], queryFn: () => api.askIntents() });
  const clientsQ = useQuery({ queryKey: ["portfolio", "broker-overview"], queryFn: () => api.portfolio("broker-overview") });
  const clients = clientsQ.data?.value?.clients || [];

  const ask = async (q: string, intent?: string) => {
    if (!q.trim()) return;
    setQuestion(q); setBusy(true);
    try {
      const body: Record<string, any> = { question: q };
      if (clientId) body.client_id = clientId;
      if (intent) body.intent = intent;
      setAnswer(await api.askQuery(body));
    } catch {
      setAnswer({ unsupported: true, answer_summary: "The copilot could not answer that request.", data_quality_status: "No Data" });
    } finally { setBusy(false); }
  };

  if (intents.isLoading) return <><SectionHeader title="Ask BenefitIQ" subtitle="Governed advisory copilot" /><Skeleton rows={4} /></>;
  if (intents.isError) return <><SectionHeader title="Ask BenefitIQ" /><ErrorState onRetry={() => intents.refetch()} /></>;

  const cards = intents.data?.intents || [];
  const evidence = answer ? {
    formula: (answer.evidence_refs || [])[0]?.formula, source_tables: answer.source_tables,
    caveats: answer.caveats, data_quality_status: answer.data_quality_status, reliability: answer.confidence,
  } : null;

  return (
    <div className="space-y-5" data-testid="ask-page">
      <SectionHeader title="Ask BenefitIQ" subtitle="Governed advisory copilot — answers only from governed BenefitIQ data, with evidence and caveats" />

      {/* guided questions */}
      <Card className="p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-brand mb-2">Guided questions</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2" data-testid="ask-cards">
          {cards.map((it: any) => (
            <button key={it.id} data-testid="ask-card" onClick={() => ask(it.examples?.[0] || it.title, it.id)}
              className="text-left border border-line rounded-xl2 p-3 hover:bg-slate-50">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-ink">{it.title}</div>
                <span className={CAT_STYLE}>{it.category}</span>
              </div>
              <div className="text-[11px] text-muted mt-1">{it.examples?.[0]}</div>
              {it.needs_client_id && <div className="text-[10px] text-muted mt-1">requires a client</div>}
            </button>))}
        </div>
      </Card>

      {/* input row */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} data-testid="ask-client"
            className="border border-line rounded-lg px-3 py-2 text-sm text-ink bg-white">
            <option value="">Portfolio (no client)</option>
            {clients.map((cl: any) => <option key={cl.client_id} value={cl.client_id}>{String(cl.client_name)}</option>)}
          </select>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} data-testid="ask-input"
            onKeyDown={(e) => { if (e.key === "Enter") ask(question); }}
            placeholder="Ask a governed question, e.g. Why is this client's ICR high?"
            className="flex-1 border border-line rounded-lg px-3 py-2 text-sm text-ink" />
          <button onClick={() => ask(question)} data-testid="ask-submit"
            className="text-sm font-semibold px-4 py-2 rounded-xl2 bg-brand text-white hover:opacity-90">Ask</button>
        </div>
        <div className="text-[11px] text-muted mt-2">Ask BenefitIQ answers only from governed data. It never invents numbers, gives medical or legal advice, or exposes individual member data.</div>
      </Card>

      {/* answer */}
      {busy && <Skeleton rows={3} />}
      {!busy && answer && (
        answer.unsupported ? (
          <Card className="p-5 border-l-4 border-l-amber-400">
            <div data-testid="ask-unsupported">
              <div className="text-xs font-semibold uppercase tracking-wide text-warn mb-1">Unsupported question</div>
              <div className="text-sm text-ink">{answer.answer_summary}</div>
              {(answer.candidates || []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {answer.candidates.map((cid2: string) => {
                    const it = cards.find((x: any) => x.id === cid2);
                    return it ? <button key={cid2} onClick={() => ask(it.examples?.[0] || it.title, it.id)}
                      className="text-[11px] px-2 py-1 rounded-lg border border-line hover:bg-slate-50 text-brand">{it.title}</button> : null;
                  })}
                </div>)}
            </div>
          </Card>
        ) : answer.needs_client ? (
          <Card className="p-5 border-l-4 border-l-brand">
            <div data-testid="ask-needs-client">
              <div className="text-sm font-semibold text-ink">{answer.answer_summary}</div>
              <div className="text-xs text-muted mt-1">Select a client above, then ask again.</div>
            </div>
          </Card>
        ) : (
          <Card className="p-5">
            <div data-testid="ask-answer" className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {answer.intent_category && <span className={CAT_STYLE}>{answer.intent_category}</span>}
                  <span className="text-sm font-semibold text-ink">{answer.intent_title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <ConfBadge confidence={answer.confidence} />
                  <DataQualityBadge status={answer.data_quality_status || "No Data"} />
                </div>
              </div>

              <RestrictedBanner blocked={answer.data_quality_status === "Restricted"} />

              {answer.data_quality_status === "No Data" ? (
                <div data-testid="ask-not-available" className="text-sm text-muted">
                  {answer.answer_summary} {answer.not_available_reason ? `(${answer.not_available_reason})` : ""}
                </div>
              ) : (
                <>
                  <div className="text-base font-semibold text-ink">{answer.answer_summary}</div>
                  {(answer.key_points || []).length > 0 && (
                    <ul className="text-sm text-ink/80 list-disc pl-5 space-y-0.5">
                      {answer.key_points.map((p: string, i: number) => <li key={i}>{p}</li>)}
                    </ul>)}
                  {(answer.supporting_metrics || []).length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="ask-metrics">
                      {answer.supporting_metrics.map((m: any, i: number) => (
                        <div key={i} data-testid="ask-metric"><KpiStat label={m.label} value={fmtKpi(m.value, m.format)} sub={m.source ? `src: ${m.source}` : undefined} /></div>))}
                    </div>)}
                  {answer.recommended_next_action && (
                    <div className="text-sm"><span className="font-semibold text-ink">Recommended next action: </span>
                      <span className="text-ink/80">{answer.recommended_next_action}</span></div>)}
                </>
              )}

              <CaveatBanner caveats={answer.caveats} />

              <div className="flex items-center gap-3 pt-1">
                <button onClick={() => setEv(true)} data-testid="ask-evidence-btn" className="text-xs font-medium text-brand hover:underline">Why this answer? — evidence &amp; sources →</button>
              </div>
            </div>
          </Card>
        )
      )}
      {!busy && !answer && <EmptyState title="Ask a governed question" message="Pick a guided question above or type your own. Answers come only from governed BenefitIQ data." />}

      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="Why this answer?" evidence={ev ? evidence : null} />
    </div>
  );
}
