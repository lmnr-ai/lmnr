"use client";

import { ExternalLink, X } from "lucide-react";
import { useMemo } from "react";
import useSWR from "swr";

import DataChip from "@/components/evaluation/datapoint-overview/data-chip";
import ScoreComparisonCard from "@/components/evaluation/datapoint-overview/score-comparison-card";
import { type ComparisonResponse } from "@/components/evaluation/datapoint-overview/types";
import { formatCostIntl } from "@/components/evaluation/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type EvalRow, type Evaluation as EvaluationType } from "@/lib/evaluation/types";
import { swrFetcher } from "@/lib/utils";

interface DatapointOverviewProps {
  projectId: string;
  evaluationId: string;
  evaluations: EvaluationType[];
  scoreNames: string[];
  row: EvalRow;
  onClose: () => void;
  onOpenTrace: () => void;
}

const formatDuration = (s: number): string => `${s.toFixed(2)}s`;

export default function DatapointOverview({
  projectId,
  evaluationId,
  evaluations,
  scoreNames,
  row,
  onClose,
  onOpenTrace,
}: DatapointOverviewProps) {
  const index = Number(row["index"]);
  const validIndex = Number.isInteger(index) && index >= 0;

  const evaluationIds = useMemo(() => evaluations.map((e) => e.id).join(","), [evaluations]);

  // Fetch the same-index datapoint across every evaluation in the group.
  const url = useMemo(() => {
    if (!validIndex || evaluations.length === 0) return null;
    const sp = new URLSearchParams({ evaluationIds, index: String(index) });
    return `/api/projects/${projectId}/evaluations/datapoint-comparison?${sp.toString()}`;
  }, [validIndex, evaluations.length, projectId, evaluationIds, index]);

  const { data, isLoading } = useSWR<ComparisonResponse>(url, swrFetcher, { revalidateOnFocus: false });

  const rawCost = row["cost"];
  const rawDuration = row["duration"];
  const cost = typeof rawCost === "number" && Number.isFinite(rawCost) ? formatCostIntl(rawCost) : "—";
  const duration =
    typeof rawDuration === "number" && Number.isFinite(rawDuration) ? formatDuration(rawDuration) : "—";
  const idxLabel = validIndex ? String(index) : "—";

  const traceId = row["traceId"] as string | undefined;

  return (
    <div className="relative shrink-0 py-4 px-5 border border-border rounded-[4px] bg-secondary overflow-hidden">
      {/* Compact header: small inline metadata + chips for data/target/output/metadata + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
          <span>
            index <span className="text-foreground font-medium tabular-nums">{idxLabel}</span>
          </span>
          <span className="text-border">·</span>
          <span>
            duration <span className="text-foreground tabular-nums">{duration}</span>
          </span>
          <span className="text-border">·</span>
          <span>
            cost <span className="text-foreground tabular-nums">{cost}</span>
          </span>
          <span className="text-border">·</span>
          <DataChip label="data" value={row["data"]} />
          <DataChip label="target" value={row["target"]} />
          <DataChip label="output" value={row["output"]} />
          <DataChip label="metadata" value={row["metadata"]} />
        </div>
        <div className="flex items-center gap-1.5">
          {traceId && (
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={onOpenTrace}>
              <ExternalLink className="size-3.5" />
              Open trace
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Scores: the main event. */}
      <div className="flex flex-col gap-2 min-w-0">
        <p className="text-xs text-muted-foreground">
          Scores across {evaluations.length} run{evaluations.length === 1 ? "" : "s"} in this group
        </p>
        {isLoading ? (
          <Skeleton className="h-[160px] w-full rounded-[4px]" />
        ) : scoreNames.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">No scores recorded for this datapoint.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {scoreNames.map((name) => (
              <ScoreComparisonCard
                key={name}
                scoreName={name}
                currentEvaluationId={evaluationId}
                evaluations={evaluations}
                rows={data?.rows ?? []}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
