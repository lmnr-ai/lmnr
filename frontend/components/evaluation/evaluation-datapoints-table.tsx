import { type Row } from "@tanstack/react-table";
import { Settings as SettingsIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  comparedComplementaryColumns,
  complementaryColumns,
  defaultColumns,
  getComparedScoreColumns,
  getScoreColumns,
} from "@/components/evaluation/columns";
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
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { Switch } from "@/components/ui/switch";
import { type EvaluationDatapointPreview, type EvaluationDatapointPreviewWithCompared } from "@/lib/evaluation/types";

interface EvaluationDatapointsTableProps {
  isLoading: boolean;
  datapointId?: string;
  data: EvaluationDatapointPreview[] | undefined;
  scores: string[];
  handleRowClick: (row: Row<EvaluationDatapointPreviewWithCompared>) => void;
  getRowHref?: (row: Row<EvaluationDatapointPreviewWithCompared>) => string;
  hasMore: boolean;
  isFetching: boolean;
  fetchNextPage: () => void;
}

const filters: ColumnFilter[] = [
  { key: "index", name: "Index", dataType: "number" },
  { key: "traceId", name: "Trace ID", dataType: "string" },
  // TODO: Add back but with a custom/calendar UI
  // { key: "startTime", name: "Start Time", dataType: "string" },
  { key: "duration", name: "Duration", dataType: "number" },
  { key: "cost", name: "Cost", dataType: "number" },
  { key: "metadata", name: "Metadata", dataType: "json" },
];

const baseColumnOrder = ["status", "index", "data", "target", "metadata", "output", "duration", "cost"];

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

  const columnFilters = useMemo<ColumnFilter[]>(
    () => [...filters, ...scores.map((score) => ({ key: `score:${score}`, name: score, dataType: "number" as const }))],
    [scores]
  );

  const scoreRanges = useMemo(() => {
    if (!data) return {};

    const isValidNumber = (value: unknown): value is number => typeof value === "number" && !isNaN(value);

    return scores.reduce(
      (ranges, scoreName) => {
        const allValues = data
          .flatMap((row) => [
            row.scores?.[scoreName],
            ...(targetId ? [(row as EvaluationDatapointPreviewWithCompared).comparedScores?.[scoreName]] : []),
          ])
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

  const columns = useMemo(() => {
    if (targetId) {
      return [
        ...defaultColumns,
        ...comparedComplementaryColumns,
        ...getComparedScoreColumns(scores, heatmapEnabled, scoreRanges),
      ];
    }
    return [...defaultColumns, ...complementaryColumns, ...getScoreColumns(scores, heatmapEnabled, scoreRanges)];
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
        getRowId={(row) => row.id}
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

const EvaluationDatapointsTable = (props: EvaluationDatapointsTableProps) => {
  const defaultColumnOrder = useMemo(
    () => [...baseColumnOrder, ...props.scores.flatMap((s) => [`score:${s}`, `comparedScore:${s}`])],
    [props.scores]
  );

  // Delay mounting the store until scores are known, otherwise the store
  // is created with an incomplete defaultColumnOrder and score columns
  // won't be reorderable.
  if (props.isLoading) {
    return null;
  }

  return (
    <DataTableStateProvider storageKey="evaluation-datapoints-table" defaultColumnOrder={defaultColumnOrder}>
      <EvaluationDatapointsTableContent {...props} />
    </DataTableStateProvider>
  );
};

export default EvaluationDatapointsTable;
