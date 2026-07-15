import React from "react";
import { Card, EvidencePanel } from "./primitives";

/** A polished slide-over evidence drawer. Wraps the shared EvidencePanel so every
 *  important number can reveal its formula, sources and caveats on demand. */
export function EvidenceDrawer({ open, onClose, title = "Evidence & explainability", evidence }:
  { open: boolean; onClose: () => void; title?: string; evidence: Record<string, any> | null }) {
  if (!open || !evidence) return null;
  return (
    <div className="fixed inset-0 z-40" data-testid="evidence-drawer">
      <div className="absolute inset-0 bg-ink/20" onClick={onClose} aria-hidden />
      <div role="dialog" aria-label={title}
        className="absolute right-0 top-0 h-full w-full max-w-md bg-canvas border-l border-line shadow-card p-5 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="text-sm text-brand hover:underline" aria-label="Close evidence">Close</button>
        </div>
        <EvidencePanel evidence={evidence} />
      </div>
    </div>
  );
}

const CLASS_STYLE: Record<string, string> = {
  "Preferred": "bg-green-50 text-good border-green-200",
  "Good option": "bg-brandSoft text-brand border-blue-200",
  "Use carefully": "bg-amber-50 text-warn border-amber-200",
  "High employee impact": "bg-orange-50 text-orange-700 border-orange-200",
  "Not recommended unless critical": "bg-red-50 text-bad border-red-200",
};

export function LeverClassificationBadge({ classification }: { classification: string }) {
  const cls = CLASS_STYLE[classification] || "bg-slate-100 text-muted border-line";
  return <span data-testid="lever-classification"
    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{classification}</span>;
}

export function ScenarioControl({ label, value, onChange, step = "any", suffix }:
  { label: string; value: string; onChange: (v: string) => void; step?: string; suffix?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted mb-1">{label}</span>
      <span className="flex items-center gap-2">
        <input type="number" step={step} value={value} aria-label={label}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
        {suffix && <span className="text-xs text-muted">{suffix}</span>}
      </span>
    </label>
  );
}

export function EmployeeImpactCallout({ label, amount, note }:
  { label: string; amount: React.ReactNode; note?: string }) {
  return (
    <Card className="p-4 border-l-4 border-l-orange-400" >
      <div data-testid="employee-impact">
        <div className="text-xs font-semibold uppercase tracking-wide text-orange-700 mb-1">Employee / member impact</div>
        <div className="text-sm text-ink"><span className="text-muted">{label}: </span><b>{amount}</b></div>
        {note && <div className="text-xs text-muted mt-1">{note}</div>}
      </div>
    </Card>
  );
}

/** Governed year-on-year table (no charting dependency this sprint). Renders API
 *  values only — no client-side computation. */
export function MiniTrend({ series, columns }:
  { series: Array<Record<string, any>>; columns: Array<{ key: string; label: string; fmt?: (v: any) => string }> }) {
  if (!series || series.length === 0) return null;
  return (
    <div className="overflow-x-auto" data-testid="mini-trend">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted border-b border-line">
            {columns.map((c) => <th key={c.key} className="py-1.5 pr-4 font-medium">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {series.map((row, i) => (
            <tr key={i} className="border-b border-line/60">
              {columns.map((c) => <td key={c.key} className="py-1.5 pr-4 text-ink">
                {c.fmt ? c.fmt(row[c.key]) : String(row[c.key] ?? "—")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
