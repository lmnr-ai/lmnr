import { Settings as SettingsIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  COMPARED_COST_COLUMN,
  COMPARED_DURATION_COLUMN,
  createComparisonScoreColumnDef,
  createScoreColumnDef,
  getFilterableColumns,
  getVisibleStaticColumns,
} from "@/components/evaluation/columns/index";
import SearchEvaluationInput from "@/components/evaluation/search-evaluation-input";
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
  isDisableLongTooltips,
}: EvaluationDatapointsTableProps) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const targetId = searchParams.get("targetId");
  const sortBy = searchParams.get("sortBy") ?? undefined;
  const sortDirection = (searchParams.get("sortDirection")?.toLowerCase() ?? undefined) as "asc" | "desc" | undefined;

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

  const [heatmapEnabled, setHeatmapEnabled] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("evaluation-heatmap-enabled");
      return stored ? JSON.parse(stored) : false;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("evaluation-heatmap-enabled", JSON.stringify(heatmapEnabled));
    }
  }, [heatmapEnabled]);

  // Derive filter definitions from column config
  const columnFilters = useMemo(() => getFilterableColumns(scores), [scores]);

  // Compute score ranges from data
  const scoreRanges = useMemo(() => {
    if (!data) return {};

    const isValidNumber = (value: unknown): value is number => typeof value === "number" && !isNaN(value);

    return scores.reduce(
      (ranges, scoreName) => {
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
              ...ranges,
              [scoreName]: {
                min: Math.min(...allValues),
                max: Math.max(...allValues),
              },
            }
          : ranges;
      },
      {} as Record<string, { min: number; max: number }>
    );
  }, [data, scores, targetId]);

  // Build column defs from the column config
  const columns = useMemo(() => {
    const staticCols = getVisibleStaticColumns();

    if (targetId) {
      // In comparison mode, override duration/cost with comparison renderers
      const baseCols = staticCols.map((c) => {
        if (c.id === "duration") return COMPARED_DURATION_COLUMN;
        if (c.id === "cost") return COMPARED_COST_COLUMN;
        return c;
      });
      const scoreCols = scores.map((name) =>
        createComparisonScoreColumnDef(name, heatmapEnabled, scoreRanges)
      );
      return [...baseCols, ...scoreCols];
    }

    const scoreCols = scores.map((name) =>
      createScoreColumnDef(name, heatmapEnabled, scoreRanges)
    );
    return [...staticCols, ...scoreCols];
  }, [targetId, scores, heatmapEnabled, scoreRanges]);

  return (
    <div className="flex overflow-hidden flex-1">
      <InfiniteDataTable
        columns={columns}
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
            columnLabels={columns.map((column) => ({
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
