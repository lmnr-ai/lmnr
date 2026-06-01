"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Settings as SettingsIcon } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import AdvancedSearch from "@/components/common/advanced-search";
import { createHeatmapStyle, formatScoreValue, isValidScore } from "@/components/evaluation/utils";
import ProgressionChart, { ChartVariantToggle } from "@/components/evaluations/progression-chart";
import { Button } from "@/components/ui/button";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import CopyTooltip from "@/components/ui/copy-tooltip";
import DeleteSelectedRows from "@/components/ui/delete-selected-rows.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll, useSelection } from "@/components/ui/infinite-datatable/hooks";
import { useTableView } from "@/components/ui/infinite-datatable/model/table-config-store";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import DataTableFilter from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import ViewsToolbar from "@/components/ui/infinite-datatable/views/views-toolbar.tsx";
import JsonTooltip from "@/components/ui/json-tooltip.tsx";
import { Switch } from "@/components/ui/switch";
import { AggregationFunction, aggregationLabelMap } from "@/lib/clickhouse/types";
import { type ScoreRange } from "@/lib/colors";
import { type Evaluation, type EvaluationTimeProgression } from "@/lib/evaluation/types";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

import ClientTimestampFormatter from "../client-timestamp-formatter";
import Header from "../ui/header";
import Mono from "../ui/mono";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../ui/resizable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import GroupsList from "./groups-list";

const baseColumns: ColumnDef<Evaluation>[] = [
  {
    accessorKey: "id",
    cell: (row) => {
      const id = String(row.getValue());
      return (
        <CopyTooltip value={id} className="block truncate">
          <Mono>{id}</Mono>
        </CopyTooltip>
      );
    },
    header: "ID",
    id: "id",
    size: 100,
  },
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    size: 300,
  },
  {
    id: "dataPointsCount",
    accessorKey: "dataPointsCount",
    header: "Datapoints",
  },
  {
    id: "metadata",
    accessorKey: "metadata",
    header: "Metadata",
    accessorFn: (row) => row.metadata,
    cell: (row) => <JsonTooltip data={row.getValue()} columnSize={row.column.getSize()} />,
  },
  {
    id: "createdAt",
    header: "Created",
    accessorKey: "createdAt",
    cell: (row) => <ClientTimestampFormatter absolute timestamp={String(row.getValue())} />,
  },
];

function buildScoreColumns(
  scoreNames: string[],
  scoresByEvalId: Record<string, Record<string, number | null>>,
  heatmapEnabled: boolean,
  scoreRanges: Record<string, ScoreRange>
): ColumnDef<Evaluation>[] {
  return scoreNames.map((scoreName) => ({
    id: `score:${scoreName}`,
    header: scoreName,
    accessorFn: (row) => scoresByEvalId[row.id]?.[scoreName] ?? null,
    cell: (cell) => {
      const v = cell.getValue() as number | null;
      if (!isValidScore(v)) return <span className="text-muted-foreground">—</span>;
      const range = scoreRanges[scoreName];
      if (heatmapEnabled && range) {
        const style = createHeatmapStyle(v, range);
        if (style.background === "transparent") {
          return <Mono>{formatScoreValue(v)}</Mono>;
        }
        return (
          <div
            className="px-1 py-0.5 min-w-5 rounded text-center transition-all duration-200 whitespace-nowrap text-xs"
            style={style}
            title={String(v)}
          >
            {formatScoreValue(v)}
          </div>
        );
      }
      return <Mono>{Number.isInteger(v) ? v.toString() : v.toFixed(3)}</Mono>;
    },
    size: 120,
  }));
}

export const defaultEvaluationsColumnOrder = [
  "__row_selection",
  "id",
  "name",
  "dataPointsCount",
  "metadata",
  "createdAt",
];

const filters: ColumnFilter[] = [
  {
    name: "ID",
    key: "id",
    dataType: "string",
  },
  {
    name: "Name",
    key: "name",
    dataType: "string",
  },
  {
    name: "Datapoints Count",
    key: "dataPointsCount",
    dataType: "number",
  },
  {
    name: "Metadata",
    key: "metadata",
    dataType: "json",
  },
];

const FETCH_SIZE = 50;
const RESOURCE = "evaluations";

export default function Evaluations() {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <InfiniteDataTableProvider
      defaults={{ columnOrder: defaultEvaluationsColumnOrder }}
      lockedColumns={["__row_selection"]}
      views={{ projectId, resource: RESOURCE }}
    >
      <EvaluationsContent />
    </InfiniteDataTableProvider>
  );
}

function EvaluationsContent() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const { effective, isLoading: isViewLoading, setSearchAndFilters, setFilters } = useTableView();
  const searchValue = useMemo(
    () => ({ filters: effective.filters, search: effective.search }),
    [effective.filters, effective.search]
  );
  const groupId = searchParams.get("groupId");
  const filter = useMemo(() => effective.filters.map((f) => JSON.stringify(f)), [effective.filters]);
  const search = effective.search.length > 0 ? effective.search : null;

  useEffect(() => {
    track("evaluations", "page_viewed");
  }, []);

  const [aggregationFunction, setAggregationFunction] = useState<AggregationFunction>(AggregationFunction.AVG);
  const [hoveredEvaluationId, setHoveredEvaluationId] = useState<string | undefined>(undefined);
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);

  const fetchEvaluations = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());

        if (groupId) {
          urlParams.set("groupId", groupId);
        }

        if (search && search.trim() !== "") {
          urlParams.set("search", search);
        }

        filter.forEach((f) => urlParams.append("filter", f));

        const url = `/api/projects/${params?.projectId}/evaluations?${urlParams.toString()}`;

        const res = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          const text = (await res.json()) as { error: string };
          throw new Error(text.error);
        }

        const data = (await res.json()) as { items: Evaluation[]; totalCount: number };
        return { items: data.items, count: data.totalCount };
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load evaluations. Please try again.",
          variant: "destructive",
        });
        throw error;
      }
    },
    [filter, groupId, params?.projectId, search, toast]
  );

  const {
    data: evaluations,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
    refetch,
  } = useInfiniteScroll<Evaluation>({
    fetchFn: fetchEvaluations,
    enabled: !isViewLoading,
    deps: [filter, groupId, params?.projectId, search],
  });

  const { rowSelection, onRowSelectionChange } = useSelection();

  // When exactly one (or more — we take the first) eval is row-selected, the progression
  // charts subtract that run's scores from every other run so it becomes the zero baseline.
  const selectedEvaluationId = useMemo(() => {
    const ids = Object.keys(rowSelection).filter((id) => rowSelection[id]);
    return ids.length > 0 ? ids[0] : undefined;
  }, [rowSelection]);

  // Same progression endpoint the chart hits — SWR dedups so this doesn't fire twice.
  // We use the result to add per-score columns to the table.
  const progressionUrl =
    groupId && evaluations.length > 0
      ? `/api/projects/${params?.projectId}/evaluation-groups/${encodeURIComponent(groupId)}/progression`
      : null;
  const progressionBody = useMemo(
    () => ({ ids: evaluations.map((e) => e.id), aggregate: aggregationFunction }),
    [evaluations, aggregationFunction]
  );
  const { data: progression } = useSWR<EvaluationTimeProgression[]>(
    progressionUrl ? [progressionUrl, progressionBody] : null,
    async ([url, body]: [string, object]) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        throw new Error(err.error);
      }
      return res.json();
    }
  );

  const { scoreNames, scoresByEvalId } = useMemo(() => {
    const names = Array.from(new Set(progression?.flatMap((p) => p.names) ?? [])).sort();
    const byEvalId: Record<string, Record<string, number | null>> = {};
    for (const point of progression ?? []) {
      const map: Record<string, number | null> = {};
      for (const name of names) {
        const idx = point.names.indexOf(name);
        if (idx === -1) {
          map[name] = null;
        } else {
          const v = Number(point.values[idx]);
          map[name] = isNaN(v) ? null : v;
        }
      }
      byEvalId[point.evaluationId] = map;
    }
    return { scoreNames: names, scoresByEvalId: byEvalId };
  }, [progression]);

  // Per-score min/max across the currently-loaded evals. The detail page derives
  // the same range from its currently-loaded datapoints — both shift as infinite
  // scroll brings in more rows, which is intentional.
  const scoreRanges = useMemo<Record<string, ScoreRange>>(() => {
    const out: Record<string, ScoreRange> = {};
    for (const name of scoreNames) {
      let min = Infinity;
      let max = -Infinity;
      for (const evalId of Object.keys(scoresByEvalId)) {
        const v = scoresByEvalId[evalId]?.[name];
        if (typeof v === "number" && !isNaN(v)) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      if (min !== Infinity) out[name] = { min, max };
    }
    return out;
  }, [scoreNames, scoresByEvalId]);

  const columns = useMemo<ColumnDef<Evaluation>[]>(
    () => [...baseColumns, ...buildScoreColumns(scoreNames, scoresByEvalId, heatmapEnabled, scoreRanges)],
    [scoreNames, scoresByEvalId, heatmapEnabled, scoreRanges]
  );

  const handleDeleteEvaluations = async (evaluationIds: string[]) => {
    try {
      const response = await fetch(`/api/projects/${params?.projectId}/evaluations`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          evaluationIds,
        }),
      });

      if (response.ok) {
        await refetch();

        toast({
          title: "Evaluations deleted",
          description: `Successfully deleted ${evaluationIds.length} evaluation(s).`,
        });
      } else {
        throw new Error("Failed to delete evaluations");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete evaluations. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Header path="evaluations" />
      <div className="flex flex-1 overflow-hidden pb-4 px-4 gap-4">
        <GroupsList />
        <div className="flex flex-col w-full min-w-0 gap-2 overflow-hidden">
          <div className="flex gap-4 items-center">
            <div className="font-medium text-lg">{searchParams.get("groupId")}</div>
            <Select
              value={aggregationFunction}
              onValueChange={(value) => setAggregationFunction(value as AggregationFunction)}
            >
              <SelectTrigger className="w-fit">
                <SelectValue placeholder="Aggregate" />
              </SelectTrigger>
              <SelectContent>
                {(Object.values(AggregationFunction) as AggregationFunction[]).map((option) => (
                  <SelectItem key={option} value={option}>
                    {aggregationLabelMap[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ChartVariantToggle />
          </div>
          <ResizablePanelGroup id="evaluations-panels" className="overflow-hidden" orientation="vertical">
            <ResizablePanel className="min-w-0" minSize={20} defaultSize={20}>
              <ProgressionChart
                evaluations={evaluations.map(({ id, name }) => ({ id, name }))}
                className="h-full"
                aggregationFunction={aggregationFunction}
                baselineEvaluationId={selectedEvaluationId}
                hoveredEvaluationId={hoveredEvaluationId}
                onPointClick={(id) => router.push(`/project/${params?.projectId}/evaluations/${id}`)}
              />
            </ResizablePanel>
            <ResizableHandle withHandle className="my-2 bg-transparent transition-colors duration-200" />
            <ResizablePanel className="flex flex-1 w-full overflow-hidden" minSize={40} defaultSize={40}>
              <InfiniteDataTable<Evaluation>
                className="w-full"
                enableRowSelection
                columns={columns}
                data={evaluations}
                getRowId={(evaluation) => evaluation.id}
                getRowHref={(row) => `/project/${params?.projectId}/evaluations/${row.original.id}`}
                hasMore={hasMore}
                isFetching={isFetching}
                isLoading={isLoading || isViewLoading}
                fetchNextPage={fetchNextPage}
                state={{ rowSelection }}
                onRowSelectionChange={onRowSelectionChange}
                onHoveredRowChange={(row) => setHoveredEvaluationId(row?.original.id)}
                selectionPanel={(selectedRowIds) => (
                  <div className="flex flex-col space-y-2">
                    <DeleteSelectedRows
                      selectedRowIds={selectedRowIds}
                      onDelete={handleDeleteEvaluations}
                      entityName="evaluations"
                    />
                  </div>
                )}
              >
                <div className="flex flex-1 w-full space-x-2">
                  <DataTableFilter columns={filters} filters={effective.filters} onFiltersChange={setFilters} />
                  <ColumnsMenu
                    columnLabels={columns.map((column) => ({
                      id: column.id!,
                      label: typeof column.header === "string" ? column.header : column.id!,
                    }))}
                  />
                  <ViewsToolbar projectId={params.projectId} resource={RESOURCE} />
                  {scoreNames.length > 0 && (
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
                  )}
                </div>
                <div className="w-full">
                  <AdvancedSearch
                    value={searchValue}
                    onChange={setSearchAndFilters}
                    storageKey={`evaluations-${params?.projectId}`}
                    filters={filters}
                    placeholder="Search evaluations..."
                    className="w-full flex-1"
                  />
                </div>
              </InfiniteDataTable>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </>
  );
}
