import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtCurrency, fmtPercent } from "../lib/format";
import {
  SectionHeader, Card, DecisionSummary, DataQualityBadge, CaveatBanner,
  RestrictedBanner, Skeleton, EmptyState, ErrorState, FourQuestions,
} from "../components/ui/primitives";
import { EvidenceDrawer, LeverClassificationBadge } from "../components/ui/sandbox";

const pick = (o: any, keys: string[]) => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

/** Renewal › Recommended Strategy — the governed negotiation position for this
 *  renewal. The stance / defend-negotiate-redesign call comes from the backend
 *  strategy output (never computed in the browser); this screen composes the
 *  governed evidence (ICR, adjusted ICR, balanced-design levers) that supports it. */
export function RecommendedStrategy() {
  const [ev, setEv] = useState<{ title: string; data: any } | null>(null);
  const icr = useQuery({ queryKey: ["m", "icr"], queryFn: () => api.metric("icr") });
  const adjusted = useQuery({ queryKey: ["s", "adjusted-icr"], queryFn: () => api.simulation("adjusted-icr") });
  const balanced = useQuery({ queryKey: ["s", "balanced-design"], queryFn: () => api.simulation("balanced-design") });

  if (icr.isLoading) return <><SectionHeader title="Recommended Strategy" subtitle="Governed renewal negotiation position" /><Skeleton rows={4} /></>;
  if (icr.isError) return <><SectionHeader title="Recommended Strategy" /><ErrorState onRetry={() => icr.refetch()} /></>;

  const status = icr.data?.data_quality_status || "No Data";
  if (status === "No Data")
    return <><SectionHeader title="Recommended Strategy" /><EmptyState message="No activated governed data yet. Complete Data Onboarding to build the renewal strategy." /></>;

  const iv = icr.data.value || {};
  const adj = adjusted.data?.value;
  const levers = balanced.data?.value?.levers || [];
  const blocked = icr.data.advisory_blocked || adjusted.data?.advisory_blocked || balanced.data?.advisory_blocked;
  const adjLine = adj ? `; Adjusted / Defendable ICR ${fmtPercent(adj.adjusted_icr)} on one-off review assumptions` : "";

  // governed strategy fields — displayed only if the backend supplies them
  const strat = balanced.data?.value || {};
  const stance = pick(strat, ["recommended_stance", "negotiation_stance", "stance"]);
  const decision = pick(strat, ["recommendation", "recommended_action", "defend_negotiate_redesign"]);
  const justifications: string[] = pick(strat, ["justifications", "justification_points", "reasons"]) || [];
  const recommendedDesign = pick(strat, ["recommended_design", "recommended_levers"]);

  // employer impact = savings the backend already computed per lever (display only)
  const preferred = levers.filter((l: any) => ["Preferred", "Good option"].includes(l.classification));
  const friction = levers.filter((l: any) => ["High employee impact", "Use carefully"].includes(l.classification));

  return (
    <div className="space-y-5">
      <SectionHeader title="Recommended Strategy" subtitle="Governed renewal negotiation position"
        right={<DataQualityBadge status={status} />} />
      <RestrictedBanner blocked={blocked} />
      <CaveatBanner caveats={icr.data.caveats} />

      <DecisionSummary title={stance ? String(stance) : "Renewal negotiation stance"} points={[
        `Operational ICR ${fmtPercent(iv.operational_icr)}${adjLine}.`,
        preferred.length > 0
          ? `${preferred.length} low-friction saving lever(s) available to defend the account without material employee impact.`
          : "Savings levers are being scored; see Benefit & Savings Sandbox and Balanced Benefit Design.",
      ]} />

      <Card className="p-5 border-l-4 border-l-brand">
        <div className="text-xs font-semibold uppercase tracking-wide text-brand mb-1">{"Defend / negotiate / redesign"}</div>
        {decision ? (
          <h3 className="text-base font-semibold text-ink">{String(decision)}</h3>
        ) : (
          <>
            <h3 className="text-base font-semibold text-ink">Governed recommendation pending strategy endpoint</h3>
            <p className="text-sm text-muted mt-1 max-w-2xl">
              The defend, negotiate or redesign call is produced by the governed backend strategy engine and
              is not computed in the browser. The supporting evidence below (ICR, adjusted ICR, scored levers)
              is live now; the explicit recommendation surfaces once the strategy endpoint returns it.
            </p>
          </>
        )}
        {Array.isArray(justifications) && justifications.length > 0 && (
          <ul className="mt-3 list-disc pl-5 text-sm text-ink/80 space-y-0.5">
            {justifications.map((j, i) => <li key={i}>{j}</li>)}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <div className="text-sm font-medium mb-2">{"Operational vs Adjusted / Defendable ICR"}</div>
        <div className="grid grid-cols-2 gap-4">
          <div><div className="text-xs text-muted">Operational ICR (unchanged)</div>
            <div className="text-xl font-semibold" data-testid="rs-op-icr">{fmtPercent(iv.operational_icr)}</div></div>
          <div><div className="text-xs text-muted">{"Adjusted / Defendable ICR"}</div>
            <div className="text-xl font-semibold text-warn" data-testid="rs-adj-icr">{adj ? fmtPercent(adj.adjusted_icr) : "—"}</div></div>
        </div>
        <p className="text-xs text-muted mt-2">{"Operational ICR is never replaced; the Adjusted / Defendable view reflects one-off claim-review assumptions from the governed simulation."}</p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-sm font-medium mb-2">Employer impact — defensible saving levers</div>
          {preferred.length > 0 ? (
            <ul className="space-y-2">
              {preferred.map((l: any) => (
                <li key={l.lever} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink capitalize">{String(l.lever).split("_").join(" ")}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-ink font-medium">{fmtCurrency(l.expected_saving)}</span>
                    <LeverClassificationBadge classification={l.classification} />
                  </span>
                </li>
              ))}
            </ul>
          ) : <div className="text-sm text-muted">No low-friction levers scored yet.</div>}
        </Card>
        <Card className="p-4">
          <div className="text-sm font-medium mb-2">Employee impact — handle with care</div>
          {friction.length > 0 ? (
            <ul className="space-y-2">
              {friction.map((l: any) => (
                <li key={l.lever} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink capitalize">{String(l.lever).split("_").join(" ")}</span>
                  <LeverClassificationBadge classification={l.classification} />
                </li>
              ))}
            </ul>
          ) : <div className="text-sm text-muted">No high-friction levers flagged.</div>}
        </Card>
      </div>

      {recommendedDesign && (
        <Card className="p-4 border-l-4 border-l-green-400">
          <div className="text-xs font-semibold uppercase tracking-wide text-good mb-1">Recommended design</div>
          <div className="text-sm text-ink">{String(recommendedDesign)}</div>
        </Card>
      )}

      <FourQuestions
        soWhat={decision ? `Recommended position: ${String(decision)}.` : "The governed renewal stance is composed from ICR, adjusted ICR and scored levers; the explicit call surfaces from the backend strategy engine."}
        why={adj ? `Operational ICR ${fmtPercent(iv.operational_icr)} vs Adjusted / Defendable ${fmtPercent(adj.adjusted_icr)}, weighed against defensible saving levers.` : `Operational ICR ${fmtPercent(iv.operational_icr)}, weighed against defensible saving levers.`}
        next="Use the defensible levers to defend the account; where employee-impact levers are needed, sequence them with change management."
        trust={`Composed only from governed metric and simulation APIs on ${status} data. The defend / negotiate / redesign call is never computed in the browser — a pending-state is shown until the backend returns it.`} />

      <button className="text-xs font-medium text-brand hover:underline"
        onClick={() => setEv({ title: "Strategy evidence", data: icr.data })}>
        View evidence &amp; caveats →
      </button>
      <EvidenceDrawer open={!!ev} onClose={() => setEv(null)} title={ev?.title} evidence={ev?.data || null} />
    </div>
  );
}
