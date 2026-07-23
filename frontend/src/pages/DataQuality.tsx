import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtNumber, fmtShare } from "../lib/format";
import {
  SectionHeader, Card, DecisionSummary, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { EvidenceDrawer } from "../components/ui/sandbox";
import { ChartFrame, KpiStat, Gauge, Donut, BarH } from "../components/ui/charts";

/** Source Evidence / Data Quality — the enterprise TRUST command center (Sprint 24).
 *  Every value is a governed API field; the page performs NO arithmetic and never recomputes DQ.
 *  Headline readiness is min-band-gated server-side; the weighted DQ score is the secondary score. */

const BAND_STYLE: Record<string, string> = {
  "Analytics Ready": "bg-green-50 text-good border-green-200",
  "Conditional": "bg-amber-50 text-warn border-amber-200",
  "Restricted": "bg-red-50 text-bad border-red-200",
  "No Data": "bg-slate-100 text-muted border-line",
};
const BAND_COLOR: Record<string, string> = {
  "Analytics Ready": "#16A34A", "Conditional": "#D97706", "Restricted": "#DC2626", "No Data": "#94A3B8",
};
const SEV_COLOR: Record<string, string> = { critical: "#DC2626", warning: "#D97706", info: "#2563EB" };
const GAUGE_BANDS = [{ upTo: 69.99, color: "#DC2626" }, { upTo: 84.99, color: "#D97706" }, { upTo: 100, color: "#16A34A" }];

function BandPill({ band }: { band: string }) {
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${BAND_STYLE[band] || BAND_STYLE["No Data"]}`}>{band}</span>;
}

const VERDICT: Record<string, string> = {
  "Analytics Ready": "Yes — analytics are governed and reliable across the active datasets.",
  "Conditional": "With caution — some datasets carry caveats; read the flagged modules before advising.",
  "Restricted": "Not for client-facing advice — a Restricted dataset gates the book; figures are directional only.",
  "No Data": "Not yet — no active governed datasets are in scope.",
};

export function DataQuality() {
  const [ev, setEv] = useState(false);
  const ov = useQuery({ queryKey: ["dq", "overview"], queryFn: () => api.dataQuality("overview") });
  const iss = useQuery({ queryKey: ["dq", "issues"], queryFn: () => api.dataQuality("issues") });
  const mod = useQuery({ queryKey: ["dq", "module-readiness"], queryFn: () => api.dataQuality("module-readiness") });
  const lin = useQuery({ queryKey: ["dq", "lineage"], queryFn: () => api.dataQuality("lineage") });

  if (ov.isLoading) return <><SectionHeader title="Source Evidence / Data Quality" subtitle="Enterprise trust command center" /><Skeleton rows={4} /></>;
  if (ov.isError) return <><SectionHeader title="Source Evidence / Data Quality" /><ErrorState onRetry={() => ov.refetch()} /></>;

  const d = ov.data;
  const status = d?.data_quality_status || "No Data";
  if (status === "No Data") {
    return <><SectionHeader title="Source Evidence / Data Quality" subtitle="Enterprise trust command center" />
      <EmptyState message="No active governed datasets in scope yet. Complete Data Onboarding to build the trust command center." /></>;
  }

  const v = d.value || {};
  const headline = v.headline_readiness || status;
  const issues = v.issues || {};
  const mapping = v.mapping || {};

  // ---- severity donut (values from /issues, fallback to overview summary) ----
  const sv = (iss.data?.value?.severity_split) || { critical: issues.critical, warning: issues.warning, info: issues.info };
  const sevData = [
    { label: "Critical", value: sv.critical, color: SEV_COLOR.critical },
    { label: "Warning", value: sv.warning, color: SEV_COLOR.warning },
    { label: "Info", value: sv.info, color: SEV_COLOR.info },
  ].filter((x) => x.value);

  const byRule = (iss.data?.value?.by_rule || []).slice(0, 6).map((r: any) => ({
    label: r.rule, value: r.count, color: r.severity === "ERROR" ? SEV_COLOR.critical : r.severity === "WARNING" ? SEV_COLOR.warning : SEV_COLOR.info,
  }));

  // ---- recommended fixes (governed strings from API, no math) ----------------
  const fixes: string[] = [];
  (v.restricted_or_blocked || []).forEach((x: any) => fixes.push(`Raise the ${x.file_kind} dataset above the DQ threshold — it is Restricted and gates the book.`));
  (iss.data?.value?.by_rule || []).slice(0, 3).forEach((r: any) =>
    fixes.push(`Resolve "${r.rule}" — ${fmtNumber(r.count)} issue(s) across ${fmtNumber(r.affected_records)} record(s)${r.affected_fields?.length ? ` on ${r.affected_fields.join(", ")}` : ""}.`));
  if (iss.data?.value?.quarantined?.records) fixes.push(`Review ${fmtNumber(iss.data.value.quarantined.records)} quarantined row(s) in the review queue.`);

  const modules = mod.data?.value?.modules || [];
  const modReady = mod.data?.data_quality_status;
  const files = lin.data?.value?.files || [];

  return (
    <div className="space-y-5">
      <SectionHeader title="Source Evidence / Data Quality" subtitle="Enterprise trust command center — can I trust this, which files, what to fix"
        right={<DataQualityBadge status={status} />} />
      <div data-testid="dq-restricted-wrap"><RestrictedBanner blocked={d.advisory_blocked} /></div>
      <CaveatBanner caveats={d.caveats} />

      {/* ---- trust verdict hero: answer first ---- */}
      <Card className="p-5">
        <div className="grid grid-cols-1 lg:grid-cols-[auto,1fr] gap-5 items-center" data-testid="dq-headline">
          <div className="flex flex-col items-center">
            <Gauge value={v.weighted_dq_score} valueText={v.weighted_dq_score != null ? fmtNumber(v.weighted_dq_score) : "—"}
              label="Weighted DQ score" bands={GAUGE_BANDS} testid="dq-gauge" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-brand">Can I trust this dashboard?</div>
              <BandPill band={headline} />
            </div>
            <div className="text-base font-semibold text-ink mt-1">{VERDICT[headline] || VERDICT["No Data"]}</div>
            <div className="text-sm text-muted mt-1">{v.gating_reason}</div>
            <button onClick={() => setEv(true)} className="mt-3 text-xs font-medium text-brand hover:underline" data-testid="dq-evidence-btn">View evidence &amp; explainability →</button>
          </div>
        </div>
      </Card>

      {/* ---- KPI band ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4" data-testid="dq-kpis">
        <KpiStat label="Weighted DQ" value={v.weighted_dq_score != null ? fmtNumber(v.weighted_dq_score) : "Not available"} sub={`Basis: ${v.weight_basis || "—"}`} badge={<DataQualityBadge status={status} />} testid="dq-kpi-score" />
        <KpiStat label="Active datasets" value={fmtNumber(v.active_dataset_count)} sub={`${fmtNumber(v.uploads_total)} uploads`} testid="dq-kpi-datasets" />
        <KpiStat label="Critical issues" value={fmtNumber(issues.critical)} sub={`${fmtNumber(issues.warning)} warning · ${fmtNumber(issues.info)} info`} testid="dq-kpi-critical" />
        <KpiStat label="Affected records" value={fmtNumber(issues.affected_records)} sub={`${fmtNumber(issues.quarantined)} quarantined`} testid="dq-kpi-records" />
        <KpiStat label="Mapping confidence" value={mapping.avg_confidence != null ? fmtShare(mapping.avg_confidence) : "Not available"} sub={`${fmtNumber(mapping.manual_decisions)} manual decisions`} testid="dq-kpi-mapping" />
      </div>

      {/* ---- recommended fixes ---- */}
      {fixes.length > 0 && (
        <div data-testid="dq-fixes"><DecisionSummary title="Recommended fixes — biggest trust wins first" points={fixes} /></div>
      )}

      {/* ---- issue visuals ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartFrame title="Issue severity" subtitle="Validation issues by severity (critical / warning / info)" status={status}
          evidence={d} evidenceTitle="Data quality evidence" testid="dq-severity"
          empty={sevData.length === 0} emptyMessage="No validation issues in scope.">
          <Donut data={sevData} centerValue={fmtNumber(issues.total)} centerLabel="issues" />
        </ChartFrame>
        <ChartFrame title="Issues by rule" subtitle="Top validation rules by issue count" status={status}
          testid="dq-by-rule" empty={byRule.length === 0} emptyMessage="No rule-level issues in scope.">
          <BarH data={byRule} format={(x) => fmtNumber(x)} />
        </ChartFrame>
      </div>

      {/* ---- module readiness grid ---- */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div><div className="text-sm font-semibold text-ink">Module readiness</div>
            <div className="text-xs text-muted">Advisory readiness from the source dataset — a module is blocked only when its dataset is Restricted</div></div>
          {modReady && <DataQualityBadge status={modReady} />}
        </div>
        {modules.length === 0 ? <div className="text-sm text-muted">Not available — no active datasets to map.</div>
          : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="dq-modules">
              {modules.map((m: any) => (
                <div key={m.module} data-testid="dq-module-card" className="border border-line rounded-xl2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-ink truncate pr-1">{m.module}</div>
                    <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: BAND_COLOR[m.readiness] || BAND_COLOR["No Data"] }} />
                  </div>
                  <div className="mt-1"><BandPill band={m.readiness} /></div>
                  <div className="mt-1 text-[11px] text-muted truncate" title={m.why}>src: {m.source_file_kind || "—"}{m.advisory_fallback ? " (fallback)" : ""}</div>
                </div>))}
            </div>}
      </Card>

      {/* ---- lineage timeline ---- */}
      <Card className="p-4">
        <div className="text-sm font-semibold text-ink mb-1">Source file lineage</div>
        <div className="text-xs text-muted mb-3">Which uploaded files created the analytics — file → batch → active dataset (content-addressed, immutable)</div>
        {files.length === 0 ? <div className="text-sm text-muted">Not available — no uploaded files in scope.</div>
          : <ol className="space-y-2" data-testid="dq-lineage">
              {files.map((f: any) => (
                <li key={f.dataset_version_id} data-testid="dq-lineage-item" className="flex items-start gap-3 border border-line rounded-xl2 p-3">
                  <span className="inline-block w-2.5 h-2.5 mt-1.5 rounded-full shrink-0" style={{ background: f.active ? "#16A34A" : "#94A3B8" }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-ink truncate">{f.file_name || "Not available"}</div>
                      <BandPill band={f.readiness} />
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted flex flex-wrap gap-x-3">
                      <span>kind: {f.file_kind || "—"}</span>
                      <span>v{fmtNumber(f.version_no)} · {f.status}</span>
                      <span>sha {f.sha256_short || "—"}</span>
                      {f.uploaded_by && <span>by {f.uploaded_by}</span>}
                    </div>
                  </div>
                </li>))}
            </ol>}
      </Card>

      {/* ---- impacted KPI / module table ---- */}
      <Card className="p-4">
        <div className="text-sm font-semibold text-ink mb-2">Impacted analytics — which modules a data issue touches</div>
        {modules.length === 0 ? <div className="text-sm text-muted">Not available.</div>
          : <div className="overflow-x-auto"><table className="w-full text-sm" data-testid="dq-impacted">
              <thead><tr className="text-left text-muted border-b border-line">
                <th className="py-2 pr-3 font-medium">Module</th><th className="py-2 pr-3 font-medium">Readiness</th>
                <th className="py-2 pr-3 font-medium">Source</th><th className="py-2 font-medium">Why</th></tr></thead>
              <tbody>
                {modules.map((m: any) => (
                  <tr key={m.module} className="border-b border-line/60">
                    <td className="py-2 pr-3 font-medium text-ink">{m.module}</td>
                    <td className="py-2 pr-3"><BandPill band={m.readiness} /></td>
                    <td className="py-2 pr-3 text-muted">{m.source_file_kind || "—"}</td>
                    <td className="py-2 text-muted">{m.why}</td>
                  </tr>))}
              </tbody></table></div>}
      </Card>

      <FourQuestions
        soWhat={VERDICT[headline] || VERDICT["No Data"]}
        why={v.gating_reason}
        next={fixes.length ? fixes[0] : "No fixes outstanding — datasets are governed and reliable."}
        trust={`Headline via min-band-gates; weighted DQ ${v.weighted_dq_score != null ? fmtNumber(v.weighted_dq_score) : "not available"} (basis: ${v.weight_basis || "—"}). Every figure reconciles to the DQ component breakdown.`} />

      <EvidenceDrawer open={ev} onClose={() => setEv(false)} title="Data quality evidence" evidence={ev ? d : null} />
    </div>
  );
}
