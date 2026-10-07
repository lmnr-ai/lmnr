"use client";

import { type ColumnDef, type Row } from "@tanstack/react-table";
import { memo, type PropsWithChildren, useMemo } from "react";

import { type ScoreRanges } from "@/components/evaluation/utils";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { type EvalRow } from "@/lib/evaluation/types";

import EvalTableSkeleton from "./eval-table-skeleton";

interface EvaluationDatapointsTableContentsProps {
  data: EvalRow[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  hasMore: boolean;
  fetchNextPage: () => void;
  visibleColumnDefs: ColumnDef<EvalRow>[];
  isComparison: boolean;
  isShared: boolean;
  scoreRanges: ScoreRanges;
  pinnedLeftColumnIds?: string[];
  datapointId?: string;
  handleRowClick: (row: Row<EvalRow>) => void;
  getRowHref?: (row: Row<EvalRow>) => string;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  onSort: (columnId: string, direction: "asc" | "desc") => void;
  heatmapEnabled?: boolean;
  scoreDirections?: Record<string, boolean>;
  onToggleScoreDirection?: (scoreName: string) => void;
  isSearchActive: boolean;
}

export const EvaluationDatapointsTableContents = memo(function EvaluationDatapointsTableContents({
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
  pinnedLeftColumnIds,
  datapointId,
  handleRowClick,
  getRowHref,
  sortBy,
  sortDirection,
  onSort,
  heatmapEnabled,
  scoreDirections,
  onToggleScoreDirection,
  isSearchActive,
}: PropsWithChildren<EvaluationDatapointsTableContentsProps>) {
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
      },
    }),
    [isComparison, isShared, heatmapEnabled, scoreRanges, scoreDirections, onToggleScoreDirection]
  );

  if (isLoading) return <EvalTableSkeleton />;

  return (
    <InfiniteDataTable
      columns={visibleColumnDefs}
      data={data ?? []}
      meta={meta}
      hasMore={!isSearchActive && hasMore}
      isFetching={isFetching}
      isLoading={false}
      fetchNextPage={fetchNextPage}
      getRowId={(row) => row["id"] as string}
      focusedRowId={datapointId}
      onRowClick={handleRowClick}
      getRowHref={getRowHref}
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
