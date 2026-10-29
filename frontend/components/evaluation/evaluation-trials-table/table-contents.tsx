"use client";

import { type ColumnDef, type ExpandedState, type Row } from "@tanstack/react-table";
import { memo, type PropsWithChildren, useMemo, useState } from "react";

import { type ScoreRanges } from "@/components/evaluation/utils";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { type EvalRow } from "@/lib/evaluation/types";

import EvalTableSkeleton from "./eval-table-skeleton";

interface EvaluationTrialsTableContentsProps {
  data: EvalRow[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  hasMore: boolean;
  fetchNextPage: () => void;
  visibleColumnDefs: ColumnDef<EvalRow>[];
  isComparison: boolean;
  isShared: boolean;
  scoreRanges: ScoreRanges;
  runningTrials?: number;
  pinnedLeftColumnIds?: string[];
  trialId?: string;
  handleRowClick: (row: Row<EvalRow>) => void;
  getRowHref?: (row: Row<EvalRow>) => string | undefined;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  onSort: (columnId: string, direction: "asc" | "desc") => void;
  heatmapEnabled?: boolean;
  scoreDirections?: Record<string, boolean>;
  onToggleScoreDirection?: (scoreName: string) => void;
  isSearchActive: boolean;
}

const getTaskRowClassName = (row: Row<EvalRow>) => (row.getIsExpanded() ? "eval-task-expanded" : "");

export const EvaluationTrialsTableContents = memo(function EvaluationTrialsTableContents({
  children,
  data,
  isLoading,
  isFetching,
  hasMore,
  fetchNextPage,
  visibleColumnDefs,
  isComparison,
  isShared,
  scoreRanges,
  runningTrials,
  pinnedLeftColumnIds,
  trialId,
  handleRowClick,
  getRowHref,
  sortBy,
  sortDirection,
  onSort,
  heatmapEnabled,
  scoreDirections,
  onToggleScoreDirection,
  isSearchActive,
}: PropsWithChildren<EvaluationTrialsTableContentsProps>) {
  // Stable ref so the cell-content token only changes on a real value change (inline object would defeat cell memoization).
  const meta = useMemo(
    () => ({
      evalCellMeta: {
        isComparison,
        isShared,
        heatmapEnabled: heatmapEnabled ?? false,
        scoreRanges,
        scoreDirections,
        onToggleScoreDirection,
        runningTrials,
      },
    }),
    [isComparison, isShared, heatmapEnabled, scoreRanges, scoreDirections, onToggleScoreDirection, runningTrials]
  );

  const [expanded, setExpanded] = useState<ExpandedState>({});
  // Open the focused Trial's Task once per focus, so the user can still collapse it.
  // A lone Trial is a top-level row until a sibling arrives and nests it under a Task row.
  const [revealedTrialId, setRevealedTrialId] = useState<string>();
  if (trialId && trialId !== revealedTrialId) {
    const taskRow = data?.find((r) => (r["subRows"] as EvalRow[] | undefined)?.some((t) => t["id"] === trialId));
    if (taskRow) {
      setRevealedTrialId(trialId);
      setExpanded((prev) => (prev === true ? prev : { ...prev, [taskRow["id"] as string]: true }));
    }
  }
  const tableState = useMemo(() => ({ expanded }), [expanded]);

  if (isLoading) return <EvalTableSkeleton />;

  return (
    <InfiniteDataTable
      columns={visibleColumnDefs}
      data={data ?? []}
      meta={meta}
      state={tableState}
      onExpandedChange={setExpanded}
      hasMore={!isSearchActive && hasMore}
      isFetching={isFetching}
      isLoading={false}
      fetchNextPage={fetchNextPage}
      getRowId={(row) => row["id"] as string}
      focusedRowId={trialId}
      onRowClick={handleRowClick}
      getRowHref={getRowHref}
      getRowClassName={getTaskRowClassName}
      autoResetExpanded={false}
      pinnedLeftColumnIds={pinnedLeftColumnIds}
      className="flex-1"
      sortBy={sortBy}
      sortDirection={sortDirection}
      onSort={onSort}
    >
      {children}
    </InfiniteDataTable>
  );
});
