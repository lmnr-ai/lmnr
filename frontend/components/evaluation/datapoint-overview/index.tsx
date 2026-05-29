"use client";

import { ExternalLink, X } from "lucide-react";
import { useMemo } from "react";
import useSWR from "swr";

import DataBlock from "@/components/evaluation/datapoint-overview/data-block";
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
    <div className="relative shrink-0 py-4 border border-border rounded-[4px] bg-secondary overflow-hidden">
      <div className="flex items-start justify-between gap-2 px-5 pb-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Index</span>
            <span className="text-sm font-medium tabular-nums">{idxLabel}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Duration</span>
            <span className="text-sm tabular-nums">{duration}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Cost</span>
            <span className="text-sm tabular-nums">{cost}</span>
          </div>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-5">
        <div className="flex flex-col gap-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Datapoint</p>
          <DataBlock label="Data" value={row["data"]} defaultOpen />
          <DataBlock label="Target" value={row["target"]} />
          <DataBlock label="Output" value={row["output"]} />
          <DataBlock label="Metadata" value={row["metadata"]} />
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Scores across {evaluations.length} run{evaluations.length === 1 ? "" : "s"} in this group
          </p>
          {isLoading ? (
            <Skeleton className="h-[160px] w-full rounded-[4px]" />
          ) : scoreNames.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">No scores recorded for this datapoint.</div>
          ) : (
            scoreNames.map((name) => (
              <ScoreComparisonCard
                key={name}
                scoreName={name}
                currentEvaluationId={evaluationId}
                evaluations={evaluations}
                rows={data?.rows ?? []}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
