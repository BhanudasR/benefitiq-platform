import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { fmtCurrency, fmtNumber, fmtPercent, fmtShare, fmtValue } from "../lib/format";
import { Skeleton, EmptyState, ErrorState, DataQualityBadge } from "../components/ui/primitives";

/** Print-ready board pack (Sprint 25). Renders the GOVERNED pack contract composed server-side —
 *  the browser's Print → PDF produces the boardroom document. No arithmetic, no fabricated values;
 *  missing figures render "Not available"; a Restricted pack is stamped directional. */

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

export function ClientPackPrint() {
  const [sp] = useSearchParams();
  const clientId = sp.get("client_id") || undefined;
  const packType = sp.get("pack_type") || undefined;
  const sections = sp.get("sections") || undefined;

  const params: Record<string, any> = sections
    ? { client_id: clientId, sections }
    : { client_id: clientId, pack_type: packType };

  const q = useQuery({ queryKey: ["ex", "print", clientId, packType, sections], enabled: !!clientId,
    queryFn: () => api.exports("client-pack/preview", params) });

  if (!clientId) return <EmptyState message="No client selected for this pack." />;
  if (q.isLoading) return <Skeleton rows={6} />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;

  const d = q.data;
  const v = d?.value || {};
  if ((d?.data_quality_status || "No Data") === "No Data" && (v.sections || []).every((s: any) => s.status === "No Data")) {
    return <EmptyState message="No governed data for this client yet — nothing to print." />;
  }

  const ordered = v.sections || [];
  const content = ordered.filter((s: any) => s.id !== "cover" && s.id !== "data_quality_appendix");
  const appendix = ordered.find((s: any) => s.id === "data_quality_appendix");

  return (
    <div className="max-w-4xl mx-auto bg-white text-ink p-8 print:p-0" data-testid="pack-print">
      <div className="flex justify-end print:hidden mb-4">
        <button onClick={() => window.print()} className="text-sm font-semibold px-4 py-2 rounded-xl2 bg-brand text-white">{"Print / Save as PDF"}</button>
      </div>

      {/* cover */}
      <section className="border-b border-line pb-6 mb-6" data-testid="pack-cover">
        <div className="text-xs uppercase tracking-wide text-brand font-semibold">BenefitIQ · Client Pack</div>
        <h1 className="text-2xl font-bold mt-1">{String(v.client_name || clientId)}</h1>
        <div className="mt-2 flex items-center gap-3 text-sm text-muted">
          <span>Generated {v.generated_at ? String(v.generated_at).slice(0, 10) : "—"}</span>
          <DataQualityBadge status={v.pack_status || "No Data"} />
        </div>
        <p className="mt-2 text-sm text-ink/80">{v.trust_note}</p>
        {v.directional && (
          <div role="alert" className="mt-3 text-[12px] text-bad bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            Directional pack — a Restricted dataset is in scope. Figures are directional only and must not be used for binding client-facing advice.
          </div>)}
      </section>

      {/* content sections */}
      {content.map((s: any) => (
        <section key={s.id} data-testid="pack-section" className="mb-6 break-inside-avoid">
          <div className="flex items-center justify-between border-b border-line pb-1 mb-2">
            <h2 className="text-lg font-semibold">{s.title}</h2>
            <DataQualityBadge status={s.status} />
          </div>
          <p className="text-sm text-ink/80">{s.headline}</p>
          {(s.kpis || []).length > 0 && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {s.kpis.map((k: any, i: number) => (
                <div key={i} className="border border-line rounded-lg p-2">
                  <div className="text-[11px] text-muted">{k.label}</div>
                  <div className="text-base font-semibold">{fmtKpi(k.value, k.format)}</div>
                  {k.source && <div className="text-[10px] text-muted mt-0.5">src: {k.source}</div>}
                </div>))}
            </div>)}
          {(s.caveats || []).length > 0 && (
            <ul className="mt-2 text-[11px] text-warn list-disc pl-5">{s.caveats.map((cav: string, i: number) => <li key={i}>{cav}</li>)}</ul>)}
        </section>))}

      {/* evidence appendix */}
      {appendix && (
        <section data-testid="pack-appendix" className="mt-8 pt-4 border-t border-line break-inside-avoid">
          <h2 className="text-lg font-semibold">{"Data Quality / Source Evidence"}</h2>
          <p className="text-sm text-ink/80 mt-1">{appendix.headline}</p>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div><div className="text-muted">Headline readiness</div><div className="font-semibold">{fmtValue(appendix.appendix?.headline_readiness) || "Not available"}</div></div>
            <div><div className="text-muted">Weighted DQ</div><div className="font-semibold">{appendix.appendix?.weighted_dq_score != null ? fmtNumber(appendix.appendix.weighted_dq_score) : "Not available"}</div></div>
            <div><div className="text-muted">Active datasets</div><div className="font-semibold">{fmtNumber(appendix.appendix?.active_dataset_count)}</div></div>
            <div><div className="text-muted">Gating</div><div className="font-semibold">{fmtValue(appendix.appendix?.gating_reason) || "—"}</div></div>
          </div>
          <div className="mt-3">
            <div className="text-xs font-semibold text-muted mb-1">Section provenance</div>
            <table className="w-full text-[11px]">
              <thead><tr className="text-left text-muted border-b border-line"><th className="py-1 pr-2">Section</th><th className="py-1 pr-2">Status</th><th className="py-1">Sources</th></tr></thead>
              <tbody>
                {(appendix.appendix?.provenance || []).map((p: any, i: number) => (
                  <tr key={i} className="border-b border-line/60">
                    <td className="py-1 pr-2">{p.section}</td>
                    <td className="py-1 pr-2">{p.status}</td>
                    <td className="py-1 text-muted">{(p.source_tables || []).join(", ") || "—"}</td>
                  </tr>))}
              </tbody>
            </table>
          </div>
        </section>)}

      <footer className="mt-8 pt-4 border-t border-line text-[11px] text-muted">
        Governed by BenefitIQ. Every figure is composed from governed engines with source and caveats; figures marked Not available have no governed data and are never fabricated.
        {(d?.caveats || []).length > 0 && <ul className="list-disc pl-5 mt-1">{d.caveats.map((cav: string, i: number) => <li key={i}>{cav}</li>)}</ul>}
      </footer>
    </div>
  );
}
