import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { fmtNumber } from "../lib/format";
import {
  SectionHeader, Card, DataQualityBadge, RestrictedBanner, CaveatBanner,
  Skeleton, EmptyState, ErrorState, DecisionSummary,
} from "../components/ui/primitives";

export function DataOnboarding() {
  const [batchId, setBatchId] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const batch = useQuery({ queryKey: ["batch", active], queryFn: () => api.batch(active as string), enabled: !!active });
  const review = useQuery({ queryKey: ["rq", active], queryFn: () => api.reviewQueue(active as string), enabled: !!active });

  return (
    <div className="space-y-5">
      <SectionHeader title="Data Onboarding" subtitle="Governed upload → mapping → validation → data-quality → activation" />
      <Card className="p-4">
        <div className="text-sm text-muted mb-2">Track a governed upload batch by its ID (issued at upload).</div>
        <div className="flex gap-2">
          <input aria-label="Batch ID" value={batchId} onChange={(e) => setBatchId(e.target.value)}
            placeholder="batch id" className="flex-1 border border-line rounded-lg px-3 py-2 text-sm" />
          <button onClick={() => setActive(batchId || null)} data-testid="track-batch"
            className="bg-brand text-white text-sm font-medium rounded-lg px-4">Track batch</button>
        </div>
      </Card>

      {!active && <EmptyState title="No batch selected"
        message="Enter a governed batch ID to view its onboarding journey, data-quality status and review queue. Raw data is immutable; corrections are governed overlays." />}

      {active && (batch.isLoading || review.isLoading) && <Skeleton rows={3} />}
      {active && (batch.isError) && <ErrorState message="Batch not found for this tenant." onRetry={() => batch.refetch()} />}

      {active && batch.data && (
        <div className="space-y-4">
          <DecisionSummary title={`Batch status: ${batch.data.status}`} points={[
            `File kind: ${batch.data.file_kind}`,
            batch.data.dataset_version
              ? `Dataset readiness: ${batch.data.dataset_version.readiness_status || "—"} (DQ ${batch.data.dataset_version.dq_score ?? "—"})`
              : "No dataset version yet — run validation and DQ scoring.",
          ]} />
          {batch.data.dataset_version && (
            <RestrictedBanner blocked={batch.data.dataset_version.restricted} />
          )}
          {batch.data.dataset_version?.readiness_status && (
            <div><DataQualityBadge status={
              batch.data.dataset_version.readiness_status.startsWith("Analytics") ? "Analytics Ready"
                : batch.data.dataset_version.readiness_status.startsWith("Conditional") ? "Conditional"
                  : batch.data.dataset_version.restricted ? "Restricted" : "No Data"} /></div>
          )}
          {review.data && (
            <Card className="p-4">
              <div className="text-sm font-medium mb-1">Review queue</div>
              <div className="text-sm text-muted">
                Quarantined rows: <b className="text-ink">{fmtNumber(review.data.quarantined_count)}</b> ·
                total {fmtNumber(review.data.total)}
              </div>
              {review.data.quarantined_count > 0 && (
                <CaveatBanner caveats={["Critical rows are quarantined and excluded from canonical load. Correct via governed overlay and re-validate."]} />
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
