import React from "react";

/** Premium light design-system primitives. All numbers passed in are already
 *  computed by the governed API — these components never do KPI arithmetic. */

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-card border border-line rounded-xl2 shadow-card ${className}`}>{children}</div>;
}

export function SectionHeader({ title, subtitle, right }:
  { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h2 className="text-lg font-semibold text-ink tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function KpiCard({ label, value, sub, badge, onEvidence }:
  { label: string; value: React.ReactNode; sub?: string; badge?: React.ReactNode; onEvidence?: () => void }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
        {badge}
      </div>
      <div className="mt-2 text-2xl font-semibold text-ink" data-testid="kpi-value">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
      {onEvidence && (
        <button onClick={onEvidence} className="mt-3 text-xs font-medium text-brand hover:underline"
          aria-label="View evidence">View evidence →</button>
      )}
    </Card>
  );
}

const DQ_STYLE: Record<string, string> = {
  "Analytics Ready": "bg-green-50 text-good border-green-200",
  "Conditional": "bg-amber-50 text-warn border-amber-200",
  "Restricted": "bg-red-50 text-bad border-red-200",
  "No Data": "bg-slate-100 text-muted border-line",
};

export function DataQualityBadge({ status }: { status: string }) {
  const cls = DQ_STYLE[status] || DQ_STYLE["No Data"];
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}
    data-testid="dq-badge">{status}</span>;
}

export function CaveatBanner({ caveats }: { caveats?: string[] }) {
  if (!caveats || caveats.length === 0) return null;
  return (
    <div role="note" data-testid="caveat-banner"
      className="bg-amber-50 border border-amber-200 text-warn rounded-xl2 px-4 py-3 text-sm">
      <div className="font-semibold mb-1">Data-quality caveats</div>
      <ul className="list-disc pl-5 space-y-0.5">{caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>
    </div>
  );
}

export function RestrictedBanner({ blocked }: { blocked?: boolean }) {
  if (!blocked) return null;
  return (
    <div role="alert" data-testid="restricted-banner"
      className="bg-red-50 border border-red-200 text-bad rounded-xl2 px-4 py-3 text-sm font-medium">
      Advisory interpretation is blocked — this dataset is <b>Restricted</b> (below the data-quality
      threshold, loaded via admin override). Figures are directional only and must not be used for
      client-facing advice.
    </div>
  );
}

export function SourceEvidenceChip({ label }: { label: string }) {
  return <span className="inline-flex items-center text-[11px] text-muted bg-brandSoft border border-line
    rounded-full px-2 py-0.5 mr-1 mb-1" data-testid="source-chip">◈ {label}</span>;
}

export function DecisionSummary({ title, points }: { title: string; points: string[] }) {
  return (
    <Card className="p-5 border-l-4 border-l-brand" >
      <div className="text-xs font-semibold uppercase tracking-wide text-brand mb-1">Decision &amp; Action</div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <ul className="mt-2 space-y-1 text-sm text-ink/80 list-disc pl-5">
        {points.map((p, i) => <li key={i}>{p}</li>)}
      </ul>
    </Card>
  );
}

export function EvidencePanel({ evidence }: { evidence: Record<string, any> }) {
  if (!evidence) return null;
  const rows: [string, any][] = [
    ["Formula", evidence.formula],
    ["Numerator", evidence.numerator],
    ["Denominator", evidence.denominator],
    ["Premium basis", evidence.premium_basis],
    ["Reliability", evidence.reliability],
    ["Data quality", evidence.data_quality_status],
  ];
  return (
    <Card className="p-4" >
      <div data-testid="evidence-panel">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Evidence &amp; explainability</div>
        <dl className="grid grid-cols-1 gap-1 text-sm">
          {rows.filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => (
            <div key={k} className="flex gap-2"><dt className="text-muted min-w-[110px]">{k}</dt>
              <dd className="text-ink">{String(v)}</dd></div>
          ))}
        </dl>
        {Array.isArray(evidence.source_tables) && evidence.source_tables.length > 0 && (
          <div className="mt-3">
            <div className="text-[11px] text-muted mb-1">Source canonical tables</div>
            {evidence.source_tables.map((t: string) => <SourceEvidenceChip key={t} label={t} />)}
          </div>
        )}
        <CaveatBanner caveats={evidence.caveats} />
      </div>
    </Card>
  );
}

/** Demo-parity decision layer. Every strategic screen answers the same four
 *  questions so the CXO/broker reads a decision, not a data dump. Text is passed
 *  in from the page (already derived from governed API values). */
export function FourQuestions({ soWhat, why, next, trust }:
  { soWhat: React.ReactNode; why: React.ReactNode; next: React.ReactNode; trust: React.ReactNode }) {
  const rows: Array<[string, React.ReactNode]> = [
    ["So what?", soWhat],
    ["Why?", why],
    ["What next?", next],
    ["Can I trust this number?", trust],
  ];
  return (
    <Card className="p-5">
      <div data-testid="four-questions" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {rows.map(([q, a]) => (
          <div key={q}>
            <div className="text-xs font-semibold uppercase tracking-wide text-brand mb-1">{q}</div>
            <div className="text-sm text-ink/80">{a}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" data-testid="skeleton" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 bg-slate-100 rounded-xl2 animate-pulse" />
      ))}
    </div>
  );
}

export function EmptyState({ title = "No data yet", message }: { title?: string; message?: string }) {
  return (
    <Card className="p-10 text-center" >
      <div data-testid="empty-state">
        <div className="mx-auto w-10 h-10 rounded-full bg-brandSoft border border-line mb-3" />
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        <p className="text-sm text-muted mt-1">{message || "Upload and activate governed data to see this view."}</p>
      </div>
    </Card>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <Card className="p-6 text-center border-red-200" >
      <div data-testid="error-state">
        <h3 className="text-base font-semibold text-bad">Something went wrong</h3>
        <p className="text-sm text-muted mt-1">{message || "We couldn't load this view."}</p>
        {onRetry && <button onClick={onRetry}
          className="mt-3 text-sm font-medium text-brand hover:underline">Try again</button>}
      </div>
    </Card>
  );
}
