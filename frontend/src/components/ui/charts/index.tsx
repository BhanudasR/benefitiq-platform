import React, { useState } from "react";
import {
  Card, SectionHeader, DataQualityBadge, EmptyState,
} from "../primitives";
import { EvidenceDrawer } from "../sandbox";

/**
 * Governed SVG chart kit (Sprint 19).
 *
 * These are DISPLAY components: they render values that already come from the governed
 * backend APIs and derive ONLY presentation geometry (a value's pixel size / arc length /
 * position). They never compute a business KPI. Pages must pass API-provided values in and
 * never do arithmetic themselves — hence all value→pixel scaling lives here, in the charts
 * layer, outside the page/no-KPI-math guard path. Numbers shown to the user are always the
 * API value (formatted for the eye), never a browser-derived business figure.
 */

const INK = "#0F172A", MUTED = "#64748B", LINE = "#E2E8F0", BRAND = "#2563EB";
const GOOD = "#16A34A", WARN = "#D97706", BAD = "#DC2626";
export const SERIES = ["#2563EB", "#16A34A", "#D97706", "#DC2626", "#7C3AED",
  "#0891B2", "#DB2777", "#65A30D", "#EA580C", "#475569"];

type Num = number | null | undefined;
const isNum = (v: Num): v is number => typeof v === "number" && !Number.isNaN(v);

// ---- ChartFrame: title + DQ badge + caveats + No-Data + evidence drawer ----
export function ChartFrame({
  title, subtitle, status, caveats, evidence, evidenceTitle = "Evidence & explainability",
  empty, emptyTitle = "No data yet", emptyMessage, right, testid, children,
}: {
  title: string; subtitle?: string; status?: string; caveats?: string[];
  evidence?: any; evidenceTitle?: string; empty?: boolean; emptyTitle?: string;
  emptyMessage?: string; right?: React.ReactNode; testid?: string; children?: React.ReactNode;
}) {
  const [ev, setEv] = useState(false);
  const cav = (caveats || []).filter(Boolean);
  return (
    <Card className="p-4" >
      <div data-testid={testid}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-sm font-semibold text-ink">{title}</div>
            {subtitle && <div className="text-xs text-muted mt-0.5">{subtitle}</div>}
          </div>
          <div className="flex items-center gap-2">
            {right}
            {status && <DataQualityBadge status={status} />}
          </div>
        </div>
        {empty ? (
          <EmptyState title={emptyTitle} message={emptyMessage} />
        ) : (
          <>
            {children}
            {cav.length > 0 && (
              <div data-testid="chart-caveat" role="note"
                className="mt-3 text-[11px] text-warn bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {cav.join(" · ")}
              </div>
            )}
            {evidence && (
              <button className="mt-3 text-xs font-medium text-brand hover:underline"
                onClick={() => setEv(true)}>View evidence &amp; caveats →</button>
            )}
          </>
        )}
        {evidence && <EvidenceDrawer open={ev} onClose={() => setEv(false)} title={evidenceTitle} evidence={ev ? evidence : null} />}
      </div>
    </Card>
  );
}

// ---- KpiStat: KPI card + optional variance chip + optional sparkline ----------
export function KpiStat({ label, value, sub, delta, deltaTone = "muted", trend, badge, onEvidence, testid }: {
  label: string; value: React.ReactNode; sub?: string; delta?: string;
  deltaTone?: "good" | "bad" | "warn" | "muted"; trend?: number[]; badge?: React.ReactNode;
  onEvidence?: () => void; testid?: string;
}) {
  const tone = { good: "text-good bg-green-50 border-green-200", bad: "text-bad bg-red-50 border-red-200",
    warn: "text-warn bg-amber-50 border-amber-200", muted: "text-muted bg-slate-100 border-line" }[deltaTone];
  return (
    <Card className="p-4">
      <div data-testid={testid}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
          {badge}
        </div>
        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="text-2xl font-semibold text-ink" data-testid="kpistat-value">{value}</div>
          {trend && trend.length > 1 && <Sparkline values={trend} width={72} height={28} />}
        </div>
        <div className="mt-1 flex items-center gap-2">
          {sub && <span className="text-xs text-muted">{sub}</span>}
          {delta && <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full border ${tone}`}>{delta}</span>}
        </div>
        {onEvidence && (
          <button onClick={onEvidence} className="mt-3 text-xs font-medium text-brand hover:underline"
            aria-label="View evidence">View evidence →</button>
        )}
      </div>
    </Card>
  );
}

// ---- Donut / ring -------------------------------------------------------------
export function Donut({ data, centerLabel, centerValue, testid = "chart-donut" }: {
  data: Array<{ label: string; value: Num; color?: string }>;
  centerLabel?: string; centerValue?: string; testid?: string;
}) {
  const slices = data.filter((d) => isNum(d.value) && (d.value as number) > 0);
  const total = slices.reduce((a, d) => a + (d.value as number), 0);   // geometry: arc fractions
  const r = 48, cx = 60, cy = 60, C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div data-testid={testid} className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="w-32 h-32 shrink-0" role="img" aria-label="Distribution donut">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={LINE} strokeWidth={16} />
        {total > 0 && slices.map((d, i) => {
          const len = ((d.value as number) / total) * C;
          const el = (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none" strokeWidth={16}
              stroke={d.color || SERIES[i % SERIES.length]}
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc}
              transform="rotate(-90 60 60)" />
          );
          acc += len;
          return el;
        })}
        {(centerValue || centerLabel) && (
          <text x="60" y="58" textAnchor="middle" fontSize="15" fontWeight="600" fill={INK}>{centerValue}</text>
        )}
        {centerLabel && <text x="60" y="72" textAnchor="middle" fontSize="8" fill={MUTED}>{centerLabel}</text>}
      </svg>
      <ul className="text-xs space-y-1">
        {slices.map((d, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: d.color || SERIES[i % SERIES.length] }} />
            <span className="text-ink">{d.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- Horizontal bar -----------------------------------------------------------
export function BarH({ data, max, format, testid = "chart-barh" }: {
  data: Array<{ label: string; value: Num; color?: string }>;
  max?: number; format?: (v: number) => string; testid?: string;
}) {
  const vals = data.map((d) => (isNum(d.value) ? (d.value as number) : 0));
  const hi = max ?? Math.max(...vals, 0);      // geometry: bar-width scaling
  const fmt = format || ((v: number) => String(v));
  return (
    <div data-testid={testid} className="space-y-2">
      {data.map((d, i) => {
        const v = isNum(d.value) ? (d.value as number) : 0;
        const pct = hi > 0 ? (v / hi) * 100 : 0;
        return (
          <div key={i} className="text-xs">
            <div className="flex justify-between mb-0.5"><span className="text-ink truncate pr-2">{d.label}</span>
              <span className="text-muted tabular-nums">{isNum(d.value) ? fmt(d.value as number) : "—"}</span></div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: d.color || BRAND }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Vertical bar -------------------------------------------------------------
export function BarV({ data, max, format, testid = "chart-barv" }: {
  data: Array<{ label: string; value: Num; color?: string }>;
  max?: number; format?: (v: number) => string; testid?: string;
}) {
  const vals = data.map((d) => (isNum(d.value) ? (d.value as number) : 0));
  const hi = max ?? Math.max(...vals, 0);
  const fmt = format || ((v: number) => String(v));
  return (
    <div data-testid={testid} className="flex items-end gap-3 h-40">
      {data.map((d, i) => {
        const v = isNum(d.value) ? (d.value as number) : 0;
        const pct = hi > 0 ? (v / hi) * 100 : 0;
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
            <div className="text-[10px] text-muted mb-1 tabular-nums">{isNum(d.value) ? fmt(d.value as number) : "—"}</div>
            <div className="w-full rounded-t-md" style={{ height: `${pct}%`, background: d.color || BRAND, minHeight: v > 0 ? 2 : 0 }} />
            <div className="text-[10px] text-ink mt-1 text-center truncate w-full">{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Stacked bar (e.g. paid vs outstanding) ----------------------------------
export function StackedBar({ rows, format, testid = "chart-stacked" }: {
  rows: Array<{ label: string; segments: Array<{ label: string; value: Num; color?: string }> }>;
  format?: (v: number) => string; testid?: string;
}) {
  const fmt = format || ((v: number) => String(v));
  return (
    <div data-testid={testid} className="space-y-3">
      {rows.map((r, i) => {
        const segs = r.segments.map((s) => ({ ...s, v: isNum(s.value) ? (s.value as number) : 0 }));
        const total = segs.reduce((a, s) => a + s.v, 0);     // geometry: within-row proportions
        return (
          <div key={i} className="text-xs">
            <div className="text-ink mb-0.5">{r.label}</div>
            <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
              {segs.map((s, j) => (
                <div key={j} title={`${s.label}: ${fmt(s.v)}`} style={{ width: total > 0 ? `${(s.v / total) * 100}%` : "0%", background: s.color || SERIES[j % SERIES.length] }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-1">
              {segs.map((s, j) => (
                <span key={j} className="text-[11px] text-muted flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-sm" style={{ background: s.color || SERIES[j % SERIES.length] }} />
                  {s.label}: <span className="text-ink">{isNum(s.value) ? fmt(s.value as number) : "—"}</span></span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Gauge / score dial -------------------------------------------------------
export function Gauge({ value, min = 0, max = 100, label, valueText, bands, testid = "chart-gauge" }: {
  value: Num; min?: number; max?: number; label?: string; valueText?: string;
  bands?: Array<{ upTo: number; color: string }>; testid?: string;
}) {
  const v = isNum(value) ? (value as number) : null;
  const frac = v === null ? 0 : Math.max(0, Math.min(1, (v - min) / (max - min)));   // geometry
  const r = 50, cx = 60, cy = 60;
  const semi = Math.PI * r;                       // half-circumference
  const color = (() => {
    if (v === null || !bands) return BRAND;
    for (const b of bands) if (v <= b.upTo) return b.color;
    return BAD;
  })();
  return (
    <div data-testid={testid} className="flex flex-col items-center">
      <svg viewBox="0 0 120 72" className="w-40 h-24" role="img" aria-label={label || "Gauge"}>
        <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke={LINE} strokeWidth={12} strokeLinecap="round" />
        {v !== null && (
          <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke={color} strokeWidth={12} strokeLinecap="round"
            strokeDasharray={`${frac * semi} ${semi}`} />
        )}
        <text x="60" y="52" textAnchor="middle" fontSize="16" fontWeight="700" fill={INK}>{valueText ?? (v === null ? "—" : String(v))}</text>
      </svg>
      {label && <div className="text-xs text-muted -mt-1">{label}</div>}
    </div>
  );
}

// ---- Sparkline ----------------------------------------------------------------
export function Sparkline({ values, width = 120, height = 32, color = BRAND, testid = "chart-sparkline" }: {
  values: Array<number>; width?: number; height?: number; color?: string; testid?: string;
}) {
  const vs = (values || []).filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (vs.length < 2) return <svg data-testid={testid} width={width} height={height} />;
  const lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;   // geometry
  const pts = vs.map((v, i) => `${(i / (vs.length - 1)) * width},${height - ((v - lo) / span) * height}`).join(" ");
  return (
    <svg data-testid={testid} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---- Quadrant: frequency (x) × severity (y) ----------------------------------
export function Quadrant({ points, xLabel = "Frequency", yLabel = "Severity", xMax, yMax, format, testid = "chart-quadrant" }: {
  points: Array<{ label: string; x: Num; y: Num }>;
  xLabel?: string; yLabel?: string; xMax?: number; yMax?: number; format?: (v: number) => string; testid?: string;
}) {
  const pts = points.filter((p) => isNum(p.x) && isNum(p.y));
  const xm = xMax ?? Math.max(...pts.map((p) => p.x as number), 1);   // geometry: axis scaling
  const ym = yMax ?? Math.max(...pts.map((p) => p.y as number), 1);
  const W = 240, H = 160, pad = 24;
  const fmt = format || ((v: number) => String(v));
  return (
    <div data-testid={testid}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Frequency vs severity quadrant">
        <line x1={pad} y1={H - pad} x2={W - 4} y2={H - pad} stroke={LINE} />
        <line x1={pad} y1={4} x2={pad} y2={H - pad} stroke={LINE} />
        <line x1={(pad + W - 4) / 2} y1={4} x2={(pad + W - 4) / 2} y2={H - pad} stroke={LINE} strokeDasharray="2 3" />
        <line x1={pad} y1={(4 + H - pad) / 2} x2={W - 4} y2={(4 + H - pad) / 2} stroke={LINE} strokeDasharray="2 3" />
        {pts.map((p, i) => {
          const cx = pad + ((p.x as number) / xm) * (W - 4 - pad);
          const cy = (H - pad) - ((p.y as number) / ym) * (H - pad - 4);
          return <circle key={i} cx={cx} cy={cy} r={5} fill={SERIES[i % SERIES.length]} opacity={0.85} />;
        })}
        <text x={W - 6} y={H - pad - 4} textAnchor="end" fontSize="8" fill={MUTED}>{xLabel} →</text>
        <text x={pad + 3} y={10} fontSize="8" fill={MUTED}>{yLabel} ↑</text>
      </svg>
      <ul className="text-[11px] text-muted mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
        {pts.slice(0, 8).map((p, i) => (
          <li key={i} className="flex items-center gap-1 truncate">
            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: SERIES[i % SERIES.length] }} />
            <span className="text-ink truncate">{p.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- Heatmap / matrix ---------------------------------------------------------
export function Heatmap({ cells, xLabels, yLabels, format, testid = "chart-heatmap" }: {
  cells: Array<{ x: number; y: number; value: Num }>; xLabels: string[]; yLabels: string[];
  format?: (v: number) => string; testid?: string;
}) {
  const vals = cells.map((c) => (isNum(c.value) ? (c.value as number) : 0));
  const hi = Math.max(...vals, 0);                 // geometry: colour intensity
  const fmt = format || ((v: number) => String(v));
  const at = (x: number, y: number) => cells.find((c) => c.x === x && c.y === y);
  return (
    <div data-testid={testid} className="overflow-x-auto">
      <table className="text-[11px] border-collapse">
        <thead><tr><th></th>{xLabels.map((x, i) => <th key={i} className="px-1 py-0.5 text-muted font-medium">{x}</th>)}</tr></thead>
        <tbody>
          {yLabels.map((y, yi) => (
            <tr key={yi}><td className="pr-2 text-muted whitespace-nowrap">{y}</td>
              {xLabels.map((_, xi) => {
                const c = at(xi, yi); const v = c && isNum(c.value) ? (c.value as number) : 0;
                const opacity = hi > 0 ? 0.12 + (v / hi) * 0.88 : 0.12;
                return <td key={xi} className="w-8 h-8 text-center" title={c && isNum(c.value) ? fmt(c.value as number) : "—"}
                  style={{ background: `rgba(37,99,235,${opacity})` }} />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
