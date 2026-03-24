import { Settings as SettingsIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";

import EvalColumnsMenu from "@/components/evaluation/eval-columns-menu";
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
import {
  selectAllColumnDefs,
  useDataTableStoreSelector,
} from "@/components/ui/infinite-datatable/model/datatable-store";
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

  const heatmapEnabled = useEvalStore((s) => s.heatmapEnabled);
  const setHeatmapEnabled = useEvalStore((s) => s.setHeatmapEnabled);
  const setScoreRanges = useEvalStore((s) => s.setScoreRanges);
  const isComparison = useEvalStore((s) => s.isComparison);

  const allColumnDefs = useDataTableStoreSelector(selectAllColumnDefs);
  const setColumnVisibility = useDataTableStoreSelector((s) => s.setColumnVisibility);
  const columnVisibility = useDataTableStoreSelector((s) => s.columnVisibility);
  useEffect(() => {
    if (isComparison && columnVisibility["output"] !== false) {
      setColumnVisibility({ ...columnVisibility, output: false });
    }
  }, [isComparison, columnVisibility, setColumnVisibility]);

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

  const columnFilters = useMemo(
    () =>
      allColumnDefs
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
    [allColumnDefs]
  );

  return (
    <div className="flex overflow-hidden flex-1">
      <InfiniteDataTable<EvalRow>
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
          <EvalColumnsMenu />
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
