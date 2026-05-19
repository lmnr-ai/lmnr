import { type ColumnDef, type Row } from "@tanstack/react-table";
import { Settings as SettingsIcon } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import AdvancedSearch from "@/components/common/advanced-search";
import EvalColumnsMenu from "@/components/evaluation/eval-columns-menu";
import { useEvalStore } from "@/components/evaluation/store";
import { type ScoreRanges } from "@/components/evaluation/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import DataTableFilter from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { Switch } from "@/components/ui/switch";
import { type EvalRow } from "@/lib/evaluation/types";

import EvalTableSkeleton from "./eval-table-skeleton";

interface EvaluationDatapointsTableProps {
  data: EvalRow[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  hasMore: boolean;
  fetchNextPage: () => void;

  /** Full column defs (used by the columns menu and filter list). */
  columnDefs: ColumnDef<EvalRow>[];
  /** Subset rendered in the table (output dropped in comparison mode). */
  visibleColumnDefs: ColumnDef<EvalRow>[];
  /** True when a target evaluation is selected. Drives comparison column rendering. */
  isComparison: boolean;
  /** Min/max per score, derived from data. Used by the heatmap renderer. */
  scoreRanges: ScoreRanges;

  datapointId?: string;
  handleRowClick: (row: Row<EvalRow>) => void;
  getRowHref?: (row: Row<EvalRow>) => string;

  sortBy?: string;
  sortDirection?: "asc" | "desc";
  onSort: (columnId: string, direction: "asc" | "desc") => void;

  /** Heatmap toggle is non-shared only; omit to hide the settings dropdown. */
  heatmapEnabled?: boolean;
  onHeatmapEnabledChange?: (enabled: boolean) => void;
  onDeleteCustomColumn?: (columnId: string) => void;
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
  datapointId,
  handleRowClick,
  getRowHref,
  sortBy,
  sortDirection,
  onSort,
  heatmapEnabled,
  onHeatmapEnabledChange,
  onDeleteCustomColumn,
}: EvaluationDatapointsTableProps) => {
  const { projectId } = useParams<{ projectId: string }>();
  const isShared = useEvalStore((s) => s.isShared);

  const tableMeta = useMemo(
    () => ({
      evalCellMeta: { isComparison, isShared, heatmapEnabled: heatmapEnabled ?? false, scoreRanges },
    }),
    [isComparison, isShared, heatmapEnabled, scoreRanges]
  );

  const columnFilters = useMemo(() => buildColumnFilters(columnDefs), [columnDefs]);
  const search = useSearchParams().get("search");

  if (isLoading) return <EvalTableSkeleton />;

  return (
    <div className="flex overflow-hidden flex-1">
      <InfiniteDataTable
        columns={visibleColumnDefs}
        data={data ?? []}
        meta={tableMeta}
        hasMore={!search && hasMore}
        isFetching={isFetching}
        isLoading={false}
        fetchNextPage={fetchNextPage}
        getRowId={(row) => row["id"] as string}
        focusedRowId={datapointId}
        onRowClick={handleRowClick}
        getRowHref={getRowHref}
        className="flex-1"
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSort={onSort}
      >
        <div className="flex flex-1 w-full space-x-2">
          <DataTableFilter columns={columnFilters} />
          <EvalColumnsMenu
            columnDefs={columnDefs}
            columnLabels={visibleColumnDefs.map((column) => ({
              id: column.id!,
              label: typeof column.header === "string" ? column.header : column.id!,
              ...(column.id!.startsWith("custom:") &&
                onDeleteCustomColumn && {
                  onDelete: () => onDeleteCustomColumn(column.id!),
                }),
            }))}
          />
          {onHeatmapEnabledChange && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-7 w-7" variant="outline" size="icon">
                  <SettingsIcon className="h-4 w-4 text-secondary-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="text-xs font-medium">Settings</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="flex items-center justify-between px-2 py-2">
                  <div className="flex flex-col">
                    <span className="text-xs">Scores Heatmap</span>
                    <span className="text-xs text-muted-foreground">Color-code score values</span>
                  </div>
                  <Switch checked={heatmapEnabled ?? false} onCheckedChange={onHeatmapEnabledChange} />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="w-full">
          <AdvancedSearch
            storageKey={`evaluation-datapoints-${projectId}`}
            filters={columnFilters}
            placeholder="Search in data, targets, scores and spans..."
            className="w-full flex-1"
          />
        </div>
      </InfiniteDataTable>
    </div>
  );
};

export default EvaluationDatapointsTable;
