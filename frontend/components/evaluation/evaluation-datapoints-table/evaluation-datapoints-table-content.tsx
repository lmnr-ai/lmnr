import { Settings as SettingsIcon } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { useStore } from "zustand";

import AdvancedSearch from "@/components/common/advanced-search";
import EvalColumnsMenu from "@/components/evaluation/eval-columns-menu";
import { selectVisibleColumnDefs, useEvalStore } from "@/components/evaluation/store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useDataTableStore } from "@/components/ui/infinite-datatable/model/datatable-store";
import DataTableFilter from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { Switch } from "@/components/ui/switch";
import { type EvalRow } from "@/lib/evaluation/types";

import { type EvaluationDatapointsTableProps } from ".";

const EvaluationDatapointsTableContent = ({
  data,
  scores,
  columnDefs: columns,
  handleRowClick,
  getRowHref,
  datapointId,
  isLoading,
  hasMore,
  isFetching,
  fetchNextPage,
}: EvaluationDatapointsTableProps) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { projectId } = useParams<{ projectId: string }>();

  const targetId = searchParams.get("targetId");
  const sortBy = searchParams.get("sortBy") ?? undefined;
  const sortDirection = (searchParams.get("sortDirection")?.toLowerCase() ?? undefined) as "asc" | "desc" | undefined;

  // Store state
  const isComparison = useEvalStore((s) => s.isComparison);
  const isShared = useEvalStore((s) => s.isShared);
  const heatmapEnabled = useEvalStore((s) => s.heatmapEnabled);
  const scoreRanges = useEvalStore((s) => s.scoreRanges);
  const setHeatmapEnabled = useEvalStore((s) => s.setHeatmapEnabled);
  const setScoreRanges = useEvalStore((s) => s.setScoreRanges);
  const removeCustomColumn = useEvalStore((s) => s.removeCustomColumn);

  // Datatable store for column sync
  const datatableStore = useDataTableStore();
  const { columnOrder, setColumnOrder } = useStore(datatableStore, (s) => ({
    columnOrder: s.columnOrder,
    setColumnOrder: s.setColumnOrder,
  }));

  useEffect(() => {
    const visibleIds = columns.filter((c) => !c.meta?.hidden).map((c) => c.id!);
    const currentSet = new Set(columnOrder);
    const defSet = new Set(visibleIds);

    const toAdd = visibleIds.filter((id) => !currentSet.has(id));
    const toRemove = columnOrder.filter((id) => !defSet.has(id));

    if (toAdd.length > 0 || toRemove.length > 0) {
      const filtered = columnOrder.filter((id) => defSet.has(id));
      setColumnOrder([...filtered, ...toAdd]);
    }
  }, [columns, columnOrder, setColumnOrder]);

  // Compute and set score ranges from data
  useEffect(() => {
    if (!data) return;

    const isValidNumber = (value: unknown): value is number => typeof value === "number" && !isNaN(value);

    const ranges = scores.reduce(
      (acc, scoreName) => {
        const allValues = data
          .flatMap((row: EvalRow) => {
            const values = [row[`score:${scoreName}`]];
            if (targetId) {
              values.push(row[`compared:score:${scoreName}`]);
            }
            return values;
          })
          .filter(isValidNumber);

        return allValues.length > 0
          ? {
              ...acc,
              [scoreName]: {
                min: Math.min(...allValues),
                max: Math.max(...allValues),
              },
            }
          : acc;
      },
      {} as Record<string, { min: number; max: number }>
    );

    setScoreRanges(ranges);
  }, [data, scores, targetId, setScoreRanges]);

  const handleSort = useCallback(
    (columnId: string, direction: "asc" | "desc") => {
      const params = new URLSearchParams(searchParams.toString());
      if (columnId) {
        params.set("sortBy", columnId);
        params.set("sortDirection", direction.toUpperCase());
      } else {
        params.delete("sortBy");
        params.delete("sortDirection");
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [searchParams, router, pathname]
  );

  const visibleColumns = useMemo(() => selectVisibleColumnDefs(columns, isComparison), [columns, isComparison]);
  const tableMeta = useMemo(
    () => ({ evalCellMeta: { isComparison, isShared, heatmapEnabled, scoreRanges } }),
    [isComparison, isShared, heatmapEnabled, scoreRanges]
  );

  // Derive filter definitions from column defs in the store
  const columnFilters = useMemo(
    () =>
      columns
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
        })),
    [columns]
  );

  return (
    <div className="flex overflow-hidden flex-1">
      <InfiniteDataTable
        columns={visibleColumns}
        data={data ?? []}
        meta={tableMeta}
        hasMore={!searchParams.get("search") && hasMore}
        isFetching={isFetching}
        isLoading={isLoading}
        fetchNextPage={fetchNextPage}
        getRowId={(row) => row["id"] as string}
        focusedRowId={datapointId}
        onRowClick={handleRowClick}
        getRowHref={getRowHref}
        className="flex-1"
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSort={handleSort}
      >
        <div className="flex flex-1 w-full space-x-2">
          <DataTableFilter columns={columnFilters} />
          <EvalColumnsMenu
            columnDefs={columns}
            columnLabels={visibleColumns.map((column) => ({
              id: column.id!,
              label: typeof column.header === "string" ? column.header : column.id!,
              ...(column.id!.startsWith("custom:") && {
                onDelete: () => removeCustomColumn(column.id!.replace("custom:", "")),
              }),
            }))}
          />
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
                <Switch checked={heatmapEnabled} onCheckedChange={setHeatmapEnabled} />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
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

export default EvaluationDatapointsTableContent;
