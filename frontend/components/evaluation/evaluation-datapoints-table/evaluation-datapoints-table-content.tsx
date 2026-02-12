import { Settings as SettingsIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";

import { getVisibleColumns } from "@/components/evaluation/store";
import SearchEvaluationInput from "@/components/evaluation/search-evaluation-input";
import { useEvalStore } from "@/components/evaluation/store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { Switch } from "@/components/ui/switch";
import { type EvalRow } from "@/lib/evaluation/types";

import { type EvaluationDatapointsTableProps } from ".";

const EvaluationDatapointsTableContent = ({
  data,
  scores,
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

  const targetId = searchParams.get("targetId");
  const sortBy = searchParams.get("sortBy") ?? undefined;
  const sortDirection = (searchParams.get("sortDirection")?.toLowerCase() ?? undefined) as "asc" | "desc" | undefined;

  // Store state
  const columns = useEvalStore((s) => s.columnDefs);
  const heatmapEnabled = useEvalStore((s) => s.heatmapEnabled);
  const setHeatmapEnabled = useEvalStore((s) => s.setHeatmapEnabled);
  const setScoreRanges = useEvalStore((s) => s.setScoreRanges);

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

  // Filter out hidden columns for rendering
  const visibleColumns = useMemo(() => getVisibleColumns(columns), [columns]);

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
          <ColumnsMenu
            columnLabels={visibleColumns.map((column) => ({
              id: column.id!,
              label: typeof column.header === "string" ? column.header : column.id!,
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
          <SearchEvaluationInput />
        </div>
        <DataTableFilterList />
      </InfiniteDataTable>
    </div>
  );
};

export default EvaluationDatapointsTableContent;
