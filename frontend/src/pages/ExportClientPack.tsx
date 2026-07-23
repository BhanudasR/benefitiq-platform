import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtPercent, fmtShare, fmtValue } from "../lib/format";
import {
  SectionHeader, Card, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState,
} from "../components/ui/primitives";
import { KpiStat } from "../components/ui/charts";

/** PPT / Client Pack / Export — a governed board-pack generation workflow (Sprint 25).
 *  The pack contract is composed server-side; this page selects, checks readiness and previews
 *  governed values (no arithmetic, no fabricated numbers), then opens the print-ready board pack. */

const PACK_TYPES: Array<{ id: string; label: string; note: string }> = [
  { id: "full_board_pack", label: "Full Board Pack", note: "All governed sections" },
  { id: "renewal_pack", label: "Renewal Pack", note: "Renewal-focused sections" },
  { id: "placement_pack", label: "Placement Pack", note: "Placement-focused sections" },
];

const READY_STYLE: Record<string, string> = {
  ready: "bg-green-50 text-good border-green-200",
  caveated: "bg-amber-50 text-warn border-amber-200",
  restricted: "bg-red-50 text-bad border-red-200",
  no_data: "bg-slate-100 text-muted border-line",
};
const VERDICT_STYLE: Record<string, string> = {
  ready: "text-good", ready_caveated: "text-warn", ready_directional: "text-bad", not_ready: "text-muted",
};

function ReadyChip({ readiness }: { readiness: string }) {
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${READY_STYLE[readiness] || READY_STYLE.no_data}`}>{readiness.replace("_", " ")}</span>;
}

function fmtKpi(value: any, format: string): string {
  if (value === null || value === undefined || value === "") return "Not available";
  switch (format) {
    case "currency": return fmtCurrency(value);
    case "percent": return fmtPercent(value);
    case "number": return fmtNumber(value);
    case "share": return fmtShare(value);
    case "days": return `${fmtNumber(value)}d`;
    case "bool": return value ? "Yes" : "No";
    default: return fmtValue(value);
  }
}

function ClientPicker() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["portfolio", "broker-overview"], queryFn: () => api.portfolio("broker-overview") });
  const clients = q.data?.value?.clients || [];
  return (
    <Card className="p-6">
      <div data-testid="ex-picker">
        <div className="text-base font-semibold text-ink">Select a client</div>
        <p className="text-sm text-muted mt-1">Choose the client this board pack is for. Packs are client-scoped and governed.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {clients.length === 0 ? <span className="text-sm text-muted">No governed clients in scope yet.</span>
            : clients.map((cl: any) => (
              <button key={cl.client_id} onClick={() => nav(`/export?client_id=${cl.client_id}`)}
                className="text-sm px-3 py-1.5 rounded-lg border border-line hover:bg-slate-50 text-ink">{String(cl.client_name)}</button>))}
        </div>
      </div>
    </Card>
  );
}

export function ExportClientPack() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const clientId = sp.get("client_id") || undefined;
  const [packType, setPackType] = useState("full_board_pack");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const cat = useQuery({ queryKey: ["ex", "sections", clientId, packType], enabled: !!clientId,
    queryFn: () => api.exports("client-pack/sections", { client_id: clientId, pack_type: packType }) });

  const catIds: string[] = (cat.data?.value?.sections || []).map((s: any) => s.id);
  const selected = catIds.filter((id) => !excluded.has(id));
  const useExplicit = excluded.size > 0 && selected.length > 0;
  const previewParams: Record<string, any> = useExplicit
    ? { client_id: clientId, sections: selected.join(",") }
    : { client_id: clientId, pack_type: packType };

  const pv = useQuery({ queryKey: ["ex", "preview", clientId, packType, selected.join(",")], enabled: !!clientId && catIds.length > 0,
    queryFn: () => api.exports("client-pack/preview", previewParams) });

  if (!clientId) return <div className="space-y-5"><SectionHeader title="PPT / Client Pack / Export" subtitle="Governed board-pack generation" /><ClientPicker /></div>;
  if (cat.isLoading) return <><SectionHeader title="PPT / Client Pack / Export" subtitle="Governed board-pack generation" /><Skeleton rows={4} /></>;
  if (cat.isError) return <><SectionHeader title="PPT / Client Pack / Export" /><ErrorState onRetry={() => cat.refetch()} /></>;

  const cv = cat.data?.value || {};
  const sections = cv.sections || [];
  if (sections.length === 0 || cv.verdict === "not_ready") {
    return <div className="space-y-5"><SectionHeader title="PPT / Client Pack / Export" subtitle={`Client: ${String(cv.client_name || clientId)}`} />
      <EmptyState message="No governed sections are available for this client yet. Complete Data Onboarding and activate the client's data to build a board pack." /></div>;
  }

  const d = pv.data;
  const pack = d?.value || {};
  const directional = pack.directional || d?.advisory_blocked;
  const contentPreview = (pack.sections || []).filter((s: any) => s.id !== "cover" && s.id !== "data_quality_appendix");
  const appendix = (pack.sections || []).find((s: any) => s.id === "data_quality_appendix");

  const toggle = (id: string) => {
    setExcluded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const generate = async () => {
    const params: Record<string, any> = useExplicit
      ? { client_id: clientId, sections: selected.join(",") }
      : { client_id: clientId, pack_type: packType };
    try { await api.exportsGenerate("client-pack/generate", params); } catch { /* audit best-effort; print uses governed preview */ }
    const q = useExplicit ? `client_id=${clientId}&sections=${selected.join(",")}` : `client_id=${clientId}&pack_type=${packType}`;
    nav(`/export/print?${q}`);
  };

  return (
    <div className="space-y-5" data-testid="ex-workflow">
      <SectionHeader title="PPT / Client Pack / Export" subtitle={`Governed board pack — ${String(cv.client_name || clientId)}`}
        right={<DataQualityBadge status={d?.data_quality_status || cv.pack_status || "No Data"} />} />
      <RestrictedBanner blocked={directional} />
      <CaveatBanner caveats={d?.caveats} />

      {/* step 1 — pack type */}
      <Card className="p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-brand mb-2">Step 1 · Pack type</div>
        <div className="flex flex-wrap gap-2" data-testid="ex-packtype">
          {PACK_TYPES.map((p) => (
            <button key={p.id} onClick={() => { setPackType(p.id); setExcluded(new Set()); }}
              className={`text-left px-3 py-2 rounded-xl2 border ${packType === p.id ? "border-brand bg-brandSoft" : "border-line hover:bg-slate-50"}`}>
              <div className="text-sm font-semibold text-ink">{p.label}</div>
              <div className="text-[11px] text-muted">{p.note}</div>
            </button>))}
        </div>
      </Card>

      {/* step 2 — sections + readiness */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand mb-2">Step 2 · Sections</div>
          <ul className="space-y-1" data-testid="ex-checklist">
            {sections.map((s: any) => (
              <li key={s.id} data-testid="ex-section-row" className="flex items-center justify-between border border-line rounded-lg px-3 py-2">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={!excluded.has(s.id)} onChange={() => toggle(s.id)} aria-label={`Include ${s.title}`} />
                  {s.title}
                </label>
                <ReadyChip readiness={s.readiness} />
              </li>))}
          </ul>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand mb-2">Export readiness</div>
          <div data-testid="ex-readiness">
            <div className={`text-lg font-semibold ${VERDICT_STYLE[cv.verdict] || "text-muted"}`}>{String(cv.verdict || "").split("_").join(" ") || "—"}</div>
            <p className="text-sm text-muted mt-1">{cv.verdict_note}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div><div className="text-good font-semibold text-base">{fmtNumber(cv.counts?.ready)}</div>ready</div>
              <div><div className="text-warn font-semibold text-base">{fmtNumber(cv.counts?.no_data)}</div>no data</div>
              <div><div className="text-bad font-semibold text-base">{fmtNumber(cv.counts?.restricted)}</div>restricted</div>
            </div>
            {directional && (
              <div data-testid="ex-dq-warning" role="alert" className="mt-3 text-[12px] text-bad bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                A Restricted dataset is in scope — the pack will be stamped <b>directional</b> and must not be used for binding client advice.
              </div>)}
          </div>
        </Card>
      </div>

      {/* step 3 — preview */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand">Step 3 · Preview</div>
          <button onClick={generate} data-testid="ex-generate"
            className="text-sm font-semibold px-4 py-2 rounded-xl2 bg-brand text-white hover:opacity-90">Generate board pack →</button>
        </div>
        {pv.isLoading ? <Skeleton rows={3} />
          : contentPreview.length === 0 ? <div className="text-sm text-muted">Not available — select at least one section.</div>
          : <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="ex-preview">
              {contentPreview.map((s: any) => (
                <div key={s.id} data-testid="ex-preview-card" className="border border-line rounded-xl2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-ink">{s.title}</div>
                    <DataQualityBadge status={s.status} />
                  </div>
                  <div className="text-xs text-muted mt-1">{s.headline}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(s.kpis || []).slice(0, 4).map((k: any, i: number) => (
                      <div key={i}><div className="text-[11px] text-muted">{k.label}</div>
                        <div className="text-sm font-semibold text-ink">{fmtKpi(k.value, k.format)}</div></div>))}
                  </div>
                </div>))}
            </div>}
      </Card>

      {/* evidence appendix preview */}
      {appendix && (
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand mb-2">Evidence appendix</div>
          <div data-testid="ex-appendix">
            <div className="text-sm text-ink">{appendix.headline}</div>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div><div className="text-muted">Headline readiness</div><div className="font-semibold">{fmtValue(appendix.appendix?.headline_readiness) || "Not available"}</div></div>
              <div><div className="text-muted">Weighted DQ</div><div className="font-semibold">{appendix.appendix?.weighted_dq_score != null ? fmtNumber(appendix.appendix.weighted_dq_score) : "Not available"}</div></div>
              <div><div className="text-muted">Active datasets</div><div className="font-semibold">{fmtNumber(appendix.appendix?.active_dataset_count)}</div></div>
              <div><div className="text-muted">Critical issues</div><div className="font-semibold">{fmtNumber(appendix.appendix?.issues?.critical)}</div></div>
            </div>
            <CaveatBanner caveats={appendix.caveats} />
          </div>
        </Card>)}
    </div>
  );
}
