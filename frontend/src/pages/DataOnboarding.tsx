import React, { useState, useRef } from "react";
import { api, getToken } from "../lib/api";
import { fmtNumber, fmtConfidencePct } from "../lib/format";
import {
  SectionHeader, Card, DataQualityBadge, CaveatBanner, RestrictedBanner,
  Skeleton, EmptyState, ErrorState, DecisionSummary, SourceEvidenceChip,
} from "../components/ui/primitives";

/** Data Onboarding Wizard — Sprint 27.
 *  5-step governed pipeline: Upload → Mapping → Validate → DQ Score → Review.
 *  All values come from backend APIs. No frontend KPI arithmetic.
 *  Steps post FormData to the onboarding endpoints (profile, mapping, validate, dq-score).
 */

const FILE_KINDS = [
  { value: "policy",  label: "Policy Master",  hint: "Policy terms, SI bands, co-pay, sub-limits." },
  { value: "member",  label: "Member Master",  hint: "Employee and dependent demographics." },
  { value: "claims",  label: "Claims Data",    hint: "Claim-level records from TPA or insurer." },
];

const STEP_LABELS = ["Upload", "Mapping", "Validate", "DQ Score", "Review"];

const READINESS_STYLE: Record<string, string> = {
  "Analytics Ready": "bg-green-50 text-green-700 border-green-200",
  "Conditional":     "bg-amber-50 text-amber-700 border-amber-200",
  "Restricted":      "bg-red-50 text-red-700 border-red-200",
  "No Data":         "bg-slate-100 text-slate-500 border-slate-200",
};

const SEV_STYLE: Record<string, string> = {
  critical: "bg-red-50 border-red-200 text-red-700",
  warning:  "bg-amber-50 border-amber-200 text-amber-700",
  info:     "bg-blue-50 border-blue-200 text-blue-700",
};

/** Thin multipart POST helper — mirrors api.req but sends FormData for onboarding endpoints. */
async function postForm(path: string, form: FormData): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${api.base}${path}`, { method: "POST", headers, body: form });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${txt || res.statusText}`);
  }
  return res.json();
}

// ---- Sub-components -------------------------------------------------------

function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-0 mb-6" role="navigation" aria-label="Onboarding steps">
      {STEP_LABELS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center min-w-[64px]">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2
                ${done ? "bg-brand border-brand text-white" : active ? "bg-brandSoft border-brand text-brand" : "bg-white border-line text-muted"}`}
                aria-current={active ? "step" : undefined} data-testid={`step-indicator-${i}`}>
                {done ? "✓" : i + 1}
              </div>
              <span className={`mt-1 text-[10px] font-medium ${active ? "text-brand" : done ? "text-good" : "text-muted"}`}>
                {label}
              </span>
            </div>
            {i < total - 1 && (
              <div className={`flex-1 h-0.5 mb-4 ${done ? "bg-brand" : "bg-line"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 my-3">
      <div className="h-px flex-1 bg-line" />
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">{label}</span>
      <div className="h-px flex-1 bg-line" />
    </div>
  );
}

function ConfidencePill({ value }: { value: number }) {
  const cls = value >= 0.80 ? "text-good bg-green-50 border-green-200"
    : value >= 0.60 ? "text-warn bg-amber-50 border-amber-200"
    : "text-bad bg-red-50 border-red-200";
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cls}`}
      data-testid="confidence-pill">{fmtConfidencePct(value)} conf.</span>
  );
}

// ---- Step components -------------------------------------------------------

interface UploadStepProps {
  fileKind: string; setFileKind: (k: string) => void;
  file: File | null; setFile: (f: File | null) => void;
  onNext: () => void; loading: boolean; error: string | null;
  profileResult: any;
}
function UploadStep({ fileKind, setFileKind, file, setFile, onNext, loading, error, profileResult }: UploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">
          Step 1 — Select file type and upload
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4" role="group" aria-label="File kind">
          {FILE_KINDS.map((k) => (
            <button key={k.value} onClick={() => setFileKind(k.value)}
              data-testid={`file-kind-${k.value}`}
              className={`rounded-xl border-2 p-3 text-left transition-all
                ${fileKind === k.value ? "border-brand bg-brandSoft" : "border-line bg-white hover:border-brand/40"}`}>
              <div className={`text-sm font-semibold ${fileKind === k.value ? "text-brand" : "text-ink"}`}>
                {k.label}
              </div>
              <div className="text-[11px] text-muted mt-0.5">{k.hint}</div>
            </button>
          ))}
        </div>
        <SectionDivider label="Choose file" />
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer
            ${file ? "border-brand bg-brandSoft" : "border-line hover:border-brand/40"}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
          role="button" aria-label="Upload file" data-testid="drop-zone">
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-testid="file-input" />
          {file ? (
            <div>
              <div className="text-sm font-semibold text-ink">{file.name}</div>
              <div className="text-xs text-muted mt-0.5">Ready to upload · Click to replace</div>
            </div>
          ) : (
            <div>
              <div className="text-sm font-medium text-ink">Drop CSV or XLSX here, or click to browse</div>
              <div className="text-xs text-muted mt-1">Only masked or synthetic data. No real member or employee PII.</div>
            </div>
          )}
        </div>
        {error && <ErrorState message={error} />}
      </Card>

      {profileResult && (
        <Card className="p-4" data-testid="profile-result">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            File profile
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><span className="text-muted">Rows</span><div className="font-semibold text-ink mt-0.5">{fmtNumber(profileResult.profile?.row_count)}</div></div>
            <div><span className="text-muted">Columns</span><div className="font-semibold text-ink mt-0.5">{fmtNumber(profileResult.profile?.column_count)}</div></div>
            <div><span className="text-muted">Blank rows</span><div className="font-semibold text-ink mt-0.5">{fmtNumber(profileResult.profile?.blank_rows)}</div></div>
            <div><span className="text-muted">Table</span><div className="font-semibold text-ink mt-0.5">{profileResult.table ?? "—"}</div></div>
          </div>
          {profileResult.profile?.headers && (
            <div className="mt-3">
              <div className="text-[10px] text-muted mb-1">Source headers detected</div>
              <div className="flex flex-wrap gap-1">
                {profileResult.profile.headers.map((h: string) => (
                  <SourceEvidenceChip key={h} label={h} />
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="flex justify-end">
        <button onClick={onNext} disabled={!file || loading}
          className="bg-brand text-white text-sm font-medium rounded-xl px-5 py-2 disabled:opacity-50 transition-opacity"
          data-testid="upload-next">
          {loading ? "Profiling…" : profileResult ? "Next — Mapping →" : "Profile file"}
        </button>
      </div>
    </div>
  );
}

interface MappingStepProps {
  suggestions: any[]; headers: string[]; fieldMap: Record<string, string>;
  setFieldMap: (m: Record<string, string>) => void;
  overallConfidence: number; unmappedMandatory: string[];
  onConfirm: () => void; onBack: () => void;
  loading: boolean; error: string | null; confirmed: boolean;
}
function MappingStep({ suggestions, headers, fieldMap, setFieldMap, overallConfidence,
  unmappedMandatory, onConfirm, onBack, loading, error, confirmed }: MappingStepProps) {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">
            Step 2 — Review and confirm column mapping
          </div>
          <ConfidencePill value={overallConfidence} />
        </div>
        {unmappedMandatory.length > 0 && (
          <CaveatBanner caveats={[`Unmapped mandatory fields: ${unmappedMandatory.join(", ")}. Map these before continuing.`]} />
        )}
        <div className="overflow-x-auto mt-3" data-testid="mapping-table">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-line">
                <th className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted px-3 py-2">Source column</th>
                <th className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted px-3 py-2">Maps to (canonical)</th>
                <th className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted px-3 py-2">Confidence</th>
                <th className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((s: any, i: number) => (
                <tr key={i} className={`border-b border-line ${i % 2 === 0 ? "bg-white" : "bg-slate-50"}`}>
                  <td className="px-3 py-2 font-medium text-ink">{s.source_header}</td>
                  <td className="px-3 py-2">
                    <input
                      value={fieldMap[s.source_header] ?? ""}
                      onChange={(e) => setFieldMap({ ...fieldMap, [s.source_header]: e.target.value })}
                      className="border border-line rounded-lg px-2 py-1 text-xs w-full focus:border-brand outline-none"
                      aria-label={`Canonical field for ${s.source_header}`}
                      data-testid={`map-input-${i}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {s.confidence !== undefined ? <ConfidencePill value={s.confidence} /> : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border
                      ${s.status === "mapped" ? "bg-green-50 text-good border-green-200"
                        : s.status === "ignored" ? "bg-slate-100 text-muted border-line"
                        : "bg-amber-50 text-warn border-amber-200"}`}>
                      {s.status ?? "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error && <div className="mt-3"><ErrorState message={error} /></div>}
        {confirmed && (
          <div className="mt-3 bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-xs font-semibold text-good"
            data-testid="mapping-confirmed">
            ✓ Mapping confirmed — proceeding to validation.
          </div>
        )}
      </Card>
      <div className="flex justify-between">
        <button onClick={onBack} className="text-sm font-medium text-muted hover:text-ink px-4 py-2">← Back</button>
        <button onClick={onConfirm} disabled={loading || confirmed}
          className="bg-brand text-white text-sm font-medium rounded-xl px-5 py-2 disabled:opacity-50 transition-opacity"
          data-testid="confirm-mapping">
          {loading ? "Confirming…" : confirmed ? "Confirmed ✓" : "Confirm mapping →"}
        </button>
      </div>
    </div>
  );
}

interface ValidateStepProps {
  counts: { errors?: number; warnings?: number; info?: number; total?: number };
  issues: any[]; onNext: () => void; onBack: () => void;
}
function ValidateStep({ counts, issues, onNext, onBack }: ValidateStepProps) {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">
          Step 3 — Validation results
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4" data-testid="validation-split">
          {[
            { key: "errors",   label: "Critical errors",  val: counts.errors,   sev: "critical" },
            { key: "warnings", label: "Warnings",         val: counts.warnings, sev: "warning"  },
            { key: "info",     label: "Info notices",     val: counts.info,     sev: "info"     },
          ].map((s) => (
            <div key={s.key} className={`rounded-xl border px-4 py-3 ${SEV_STYLE[s.sev]}`}>
              <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{s.label}</div>
              <div className="text-2xl font-bold mt-1" data-testid={`sev-${s.sev}`}>{fmtNumber(s.val ?? 0)}</div>
            </div>
          ))}
        </div>
        {issues.length > 0 && (
          <>
            <SectionDivider label="Issue detail" />
            <div className="space-y-1 max-h-48 overflow-y-auto" data-testid="issue-list">
              {issues.slice(0, 20).map((iss: any, i: number) => (
                <div key={i} className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg border
                  ${iss.severity === "ERROR" ? SEV_STYLE.critical : iss.severity === "WARNING" ? SEV_STYLE.warning : SEV_STYLE.info}`}>
                  <span className="font-semibold shrink-0">{iss.severity}</span>
                  <span>{iss.rule}: row {fmtNumber(iss.row_index + 1)} · {iss.field} = {String(iss.raw_value ?? "—")}</span>
                </div>
              ))}
            </div>
          </>
        )}
        {counts.errors === 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-xs font-semibold text-good mt-3">
            ✓ No critical errors — file is safe to proceed to DQ scoring.
          </div>
        )}
      </Card>
      <div className="flex justify-between">
        <button onClick={onBack} className="text-sm font-medium text-muted hover:text-ink px-4 py-2">← Back</button>
        <button onClick={onNext}
          className="bg-brand text-white text-sm font-medium rounded-xl px-5 py-2"
          data-testid="validate-next">
          Next — DQ Score →
        </button>
      </div>
    </div>
  );
}

interface DQStepProps {
  dq: any; loading: boolean; onNext: () => void; onBack: () => void;
}
function DQStep({ dq, loading, onNext, onBack }: DQStepProps) {
  const score = dq?.overall ?? 0;
  const band  = dq?.band ?? "No Data";
  const components: any[] = dq?.components ?? [];
  const WEIGHT_LABELS: Record<string, string> = {
    completeness:          "Completeness",
    critical_error_rate:   "Critical error rate",
    mapping_confidence:    "Mapping confidence",
    mandatory_coverage:    "Mandatory field coverage",
    row_count_adequacy:    "Row count adequacy",
    version_lineage:       "Version lineage",
    date_range_coverage:   "Date range coverage",
    referential_integrity: "Referential integrity",
  };
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">
            Step 4 — Data Readiness Score
          </div>
          <DataQualityBadge status={band} />
        </div>
        {loading ? <Skeleton rows={3} /> : (
          <>
            <div className="flex items-end gap-4 mb-4">
              <div className="text-5xl font-black text-ink" data-testid="dq-overall">{score.toFixed(1)}</div>
              <div className="text-sm text-muted mb-1">/ 100 · weighted DQ score</div>
            </div>
            <div className="bg-line rounded-full h-2 mb-4">
              <div className={`h-2 rounded-full transition-all ${band === "Analytics Ready" ? "bg-good" : band === "Conditional" ? "bg-warn" : "bg-bad"}`}
                style={{ width: `${Math.min(score, 100)}%` }} data-testid="dq-bar" />
            </div>
            <SectionDivider label="8-component breakdown" />
            <div className="space-y-2" data-testid="dq-components">
              {components.map((c: any, i: number) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className="min-w-[180px] text-muted text-xs">{WEIGHT_LABELS[c.name] || c.name}</div>
                  <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${c.score >= 80 ? "bg-good" : c.score >= 60 ? "bg-warn" : "bg-bad"}`}
                      style={{ width: `${Math.min(c.score, 100)}%` }} />
                  </div>
                  <div className="min-w-[48px] text-right text-xs font-semibold text-ink">{c.score.toFixed(0)}</div>
                  <div className="text-[10px] text-muted min-w-[40px]">w={c.weight}</div>
                </div>
              ))}
            </div>
            {dq?.caveats && dq.caveats.length > 0 && <div className="mt-3"><CaveatBanner caveats={dq.caveats} /></div>}
          </>
        )}
      </Card>
      <div className="flex justify-between">
        <button onClick={onBack} className="text-sm font-medium text-muted hover:text-ink px-4 py-2">← Back</button>
        <button onClick={onNext}
          className="bg-brand text-white text-sm font-medium rounded-xl px-5 py-2"
          data-testid="dq-next" disabled={loading}>
          Next — Review →
        </button>
      </div>
    </div>
  );
}

interface ReviewStepProps {
  dq: any; reviewQueue: any; fileKind: string; validationCounts: any; onReset: () => void;
}
function ReviewStep({ dq, reviewQueue, fileKind, validationCounts, onReset }: ReviewStepProps) {
  const band = dq?.band ?? "No Data";
  const quarantined = reviewQueue?.quarantined_count ?? 0;
  const eligible = reviewQueue?.analytics_eligible_count ?? 0;
  const score = dq?.overall ?? 0;
  const NEXT_ACTION: Record<string, string> = {
    "Analytics Ready":
      "Dataset meets the Analytics Ready threshold. Contact your Admin to approve and activate this dataset for governed analytics.",
    "Conditional":
      "Dataset is Conditional — analytics may proceed with caveats. An Admin can activate with override, and modules will surface a caveat banner. Resolve flagged issues before client-facing use.",
    "Restricted":
      "Dataset is Restricted (DQ below 70). Analytics are blocked for client-facing advice. Resolve critical errors, re-upload, and re-run the pipeline.",
    "No Data": "Upload and profile a file to begin.",
  };
  return (
    <div className="space-y-4">
      <DecisionSummary
        title={`Onboarding complete — ${band}`}
        points={[
          `File kind: ${fileKind} · DQ score: ${score.toFixed(1)} / 100`,
          `Validation: ${fmtNumber(validationCounts?.errors ?? 0)} errors · ${fmtNumber(validationCounts?.warnings ?? 0)} warnings`,
          `Review queue: ${fmtNumber(quarantined)} quarantined · ${fmtNumber(eligible)} analytics-eligible`,
          NEXT_ACTION[band] ?? "Proceed with caution.",
        ]}
      />
      <div data-testid="review-summary"><Card className="p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">
          Step 5 — Review & readiness
        </div>
        <div className="flex items-center gap-3 mb-4">
          <DataQualityBadge status={band} />
          <RestrictedBanner blocked={band === "Restricted"} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><span className="text-muted text-xs">DQ score</span><div className="font-bold text-2xl text-ink mt-0.5">{score.toFixed(1)}</div></div>
          <div><span className="text-muted text-xs">Quarantined rows</span><div className="font-semibold text-bad text-xl mt-0.5">{fmtNumber(quarantined)}</div></div>
          <div><span className="text-muted text-xs">Analytics-eligible</span><div className="font-semibold text-good text-xl mt-0.5">{fmtNumber(eligible)}</div></div>
          <div><span className="text-muted text-xs">Errors</span><div className="font-semibold text-ink text-xl mt-0.5">{fmtNumber(validationCounts?.errors ?? 0)}</div></div>
        </div>
        {quarantined > 0 && (
          <div className="mt-4">
            <CaveatBanner caveats={[
              `${fmtNumber(quarantined)} row(s) are quarantined and excluded from canonical load. Correct data via governed overlay and re-run the pipeline.`,
            ]} />
          </div>
        )}
        <div className="mt-4 p-3 bg-brandSoft border border-brand/20 rounded-xl text-xs text-ink/80">
          <span className="font-semibold text-brand">Next step: </span>{NEXT_ACTION[band]}
        </div>
      </Card></div>
      <div className="flex justify-between items-center">
        <div className="text-xs text-muted">Raw file is immutable. Corrections are governed overlays — raw data is never mutated.</div>
        <button onClick={onReset}
          className="text-sm font-medium text-brand hover:underline px-4 py-2"
          data-testid="onboard-another">
          Onboard another file
        </button>
      </div>
    </div>
  );
}

// ---- Main wizard ----------------------------------------------------------

export function DataOnboarding() {
  const [step, setStep] = useState(0);
  const [fileKind, setFileKind] = useState("claims");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // step data
  const [profileResult, setProfileResult] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fieldMap, setFieldMap] = useState<Record<string, string>>({});
  const [overallConfidence, setOverallConfidence] = useState(0);
  const [unmappedMandatory, setUnmappedMandatory] = useState<string[]>([]);
  const [mappingConfirmed, setMappingConfirmed] = useState(false);
  const [validationCounts, setValidationCounts] = useState<any>({});
  const [validationIssues, setValidationIssues] = useState<any[]>([]);
  const [dqResult, setDqResult] = useState<any>(null);
  const [reviewQueue, setReviewQueue] = useState<any>(null);

  function reset() {
    setStep(0); setFile(null); setProfileResult(null); setSuggestions([]); setHeaders([]);
    setFieldMap({}); setOverallConfidence(0); setUnmappedMandatory([]); setMappingConfirmed(false);
    setValidationCounts({}); setValidationIssues([]); setDqResult(null); setReviewQueue(null);
    setError(null);
  }

  // Step 0 → 1: profile then mapping/suggest
  async function handleUploadNext() {
    if (!file) return;
    setLoading(true); setError(null);
    try {
      const form1 = new FormData();
      form1.append("file", file); form1.append("file_kind", fileKind);
      const prof = await postForm("/onboarding/profile", form1);
      setProfileResult(prof);

      const form2 = new FormData();
      form2.append("file", file); form2.append("file_kind", fileKind);
      const mapSug = await postForm("/onboarding/mapping/suggest", form2);
      const sugs: any[] = mapSug.suggestions ?? [];
      setSuggestions(sugs);
      const hdrs = sugs.map((s: any) => s.source_header);
      setHeaders(hdrs);
      const autoMap: Record<string, string> = {};
      sugs.forEach((s: any) => { if (s.suggested_canonical) autoMap[s.source_header] = s.suggested_canonical; });
      setFieldMap(autoMap);
      setOverallConfidence(mapSug.overall_confidence ?? 0);
      setUnmappedMandatory(mapSug.unmapped_mandatory ?? []);
      setStep(1);
    } catch (e: any) {
      setError(e.message ?? "Profile failed. Check the file format and try again.");
    } finally { setLoading(false); }
  }

  // Step 1 → 2: confirm mapping then validate
  async function handleConfirmMapping() {
    if (!file) return;
    setLoading(true); setError(null);
    try {
      const form = new FormData();
      form.append("file_kind", fileKind);
      form.append("headers", JSON.stringify(headers));
      form.append("field_map", JSON.stringify(fieldMap));
      form.append("save_as_profile", "false");
      await postForm("/onboarding/mapping/confirm", form);
      setMappingConfirmed(true);

      const form2 = new FormData();
      form2.append("file", file); form2.append("file_kind", fileKind);
      form2.append("field_map", JSON.stringify(fieldMap));
      const val = await postForm("/onboarding/validate", form2);
      setValidationCounts(val.counts ?? {});
      setValidationIssues(val.issues ?? []);
      setStep(2);
    } catch (e: any) {
      setError(e.message ?? "Mapping confirmation failed.");
    } finally { setLoading(false); }
  }

  // Step 2 → 3: DQ score (full pipeline)
  async function handleRunDQ() {
    if (!file) return;
    setLoading(true); setError(null);
    try {
      const form = new FormData();
      form.append("file", file); form.append("file_kind", fileKind);
      form.append("field_map", JSON.stringify(fieldMap));
      const res = await postForm("/onboarding/dq-score", form);
      setDqResult(res.dq_score ?? null);
      setReviewQueue(res.review_queue ?? null);
      setStep(3);
    } catch (e: any) {
      setError(e.message ?? "DQ scoring failed.");
    } finally { setLoading(false); }
  }

  // Step 3 → 4: move to review
  function handleDQNext() { setStep(4); }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Data Onboarding"
        subtitle="Governed upload pipeline — Upload → Mapping → Validate → DQ Score → Review"
      />
      <StepIndicator step={step} total={5} />

      {step === 0 && (
        <UploadStep
          fileKind={fileKind} setFileKind={setFileKind}
          file={file} setFile={setFile}
          onNext={handleUploadNext} loading={loading} error={error}
          profileResult={profileResult}
        />
      )}
      {step === 0 && !file && (
        <EmptyState
          title="No file selected"
          message="Select a file type, drop or browse a CSV or XLSX, then profile it to begin the governed onboarding pipeline."
        />
      )}
      {step === 1 && suggestions.length === 0 && (
        <EmptyState title="No mapping suggestions" message="Re-upload the file to regenerate mapping suggestions." />
      )}
      {step === 1 && suggestions.length > 0 && (
        <MappingStep
          suggestions={suggestions} headers={headers} fieldMap={fieldMap} setFieldMap={setFieldMap}
          overallConfidence={overallConfidence} unmappedMandatory={unmappedMandatory}
          onConfirm={handleConfirmMapping} onBack={() => setStep(0)}
          loading={loading} error={error} confirmed={mappingConfirmed}
        />
      )}
      {step === 2 && (
        <ValidateStep
          counts={validationCounts} issues={validationIssues}
          onNext={handleRunDQ} onBack={() => setStep(1)}
        />
      )}
      {step === 3 && dqResult && (
        <DQStep dq={dqResult} loading={loading} onNext={handleDQNext} onBack={() => setStep(2)} />
      )}
      {step === 3 && !dqResult && (
        <EmptyState title="DQ score not available" message="Go back and re-run the pipeline." />
      )}
      {step === 4 && (
        <ReviewStep
          dq={dqResult} reviewQueue={reviewQueue} fileKind={fileKind}
          validationCounts={validationCounts} onReset={reset}
        />
      )}
    </div>
  );
}
