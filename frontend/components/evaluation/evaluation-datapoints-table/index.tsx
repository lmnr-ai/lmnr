import { type ColumnDef, type Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";

import { type AdvancedSearchValue } from "@/components/common/advanced-search";
import { useEvalStore } from "@/components/evaluation/store";
import { type ScoreRanges } from "@/components/evaluation/utils";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { type Filter } from "@/lib/actions/common/filters";
import { type EvalRow } from "@/lib/evaluation/types";

import { EvaluationDatapointsChrome } from "./chrome";
import { EvaluationDatapointsGrid } from "./grid";

interface EvaluationDatapointsTableProps {
  data: EvalRow[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  hasMore: boolean;
  fetchNextPage: () => void;
  columnDefs: ColumnDef<EvalRow>[];
  visibleColumnDefs: ColumnDef<EvalRow>[];
  isComparison: boolean;
  scoreRanges: ScoreRanges;
  pinnedLeftColumnIds?: string[];
  datapointId?: string;
  handleRowClick: (row: Row<EvalRow>) => void;
  getRowHref?: (row: Row<EvalRow>) => string;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  onSort: (columnId: string, direction: "asc" | "desc") => void;
  heatmapEnabled?: boolean;
  onHeatmapEnabledChange?: (enabled: boolean) => void;
  onDeleteCustomColumn?: (columnId: string) => void;
  searchValue: AdvancedSearchValue;
  onSearchChange: (next: AdvancedSearchValue) => void;
  viewsResource?: string;
}

const buildColumnFilters = (columnDefs: ColumnDef<EvalRow>[]): ColumnFilter[] =>
  columnDefs
    .filter((c) => c.meta?.filterable)
    .map((c) => ({
      key: c.id!,
      name: typeof c.header === "string" ? c.header : c.id!,
      dataType:
        c.meta!.dataType === "json"
          ? ("json" as const)
          : c.meta!.dataType === "number"
            ? ("number" as const)
            : ("string" as const),
    }));

const EvaluationDatapointsTable = ({
  data,
  isLoading,
  isFetching,
  hasMore,
  fetchNextPage,
  columnDefs,
  visibleColumnDefs,
  isComparison,
  scoreRanges,
  pinnedLeftColumnIds,
  datapointId,
  handleRowClick,
  getRowHref,
  sortBy,
  sortDirection,
  onSort,
  heatmapEnabled,
  onHeatmapEnabledChange,
  onDeleteCustomColumn,
  searchValue,
  onSearchChange,
  viewsResource,
}: EvaluationDatapointsTableProps) => {
  const isShared = useEvalStore((s) => s.isShared);
  const columnFilters = useMemo(() => buildColumnFilters(columnDefs), [columnDefs]);
  const isSearchActive = searchValue.search.length > 0;

  const onFiltersChange = useCallback(
    (next: Filter[]) => onSearchChange({ ...searchValue, filters: next }),
    [onSearchChange, searchValue]
  );

  const chrome = (
    <EvaluationDatapointsChrome
      columnFilters={columnFilters}
      columnDefs={columnDefs}
      visibleColumnDefs={visibleColumnDefs}
      activeFilters={searchValue.filters}
      onFiltersChange={onFiltersChange}
      heatmapEnabled={heatmapEnabled}
      onHeatmapEnabledChange={onHeatmapEnabledChange}
      onDeleteCustomColumn={onDeleteCustomColumn}
      searchValue={searchValue}
      onSearchChange={onSearchChange}
      viewsResource={viewsResource}
    />
  );

  return (
    <div className="flex overflow-hidden flex-1">
      <EvaluationDatapointsGrid
        chrome={chrome}
        data={data}
        isLoading={isLoading}
        isFetching={isFetching}
        hasMore={hasMore}
        fetchNextPage={fetchNextPage}
        visibleColumnDefs={visibleColumnDefs}
        isComparison={isComparison}
        isShared={isShared}
        scoreRanges={scoreRanges}
        pinnedLeftColumnIds={pinnedLeftColumnIds}
        datapointId={datapointId}
        handleRowClick={handleRowClick}
        getRowHref={getRowHref}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSort={onSort}
        heatmapEnabled={heatmapEnabled}
        isSearchActive={isSearchActive}
      />
    </div>
  );
};

export default EvaluationDatapointsTable;
