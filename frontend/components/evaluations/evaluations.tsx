"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { type LayoutStorage, useDefaultLayout } from "react-resizable-panels";
import { toast } from "sonner";
import useSWR from "swr";

import AdvancedSearch from "@/components/common/advanced-search";
import HeatmapValue from "@/components/evaluation/heatmap-value";
import { formatScoreValue, isValidScore } from "@/components/evaluation/utils";
import ProgressionChart from "@/components/evaluations/progression-chart";
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
import { Eye, EyeOff, Settings as SettingsIcon } from "@/components/ui/icon-lib";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll, useSelection } from "@/components/ui/infinite-datatable/hooks";
import { useTableView } from "@/components/ui/infinite-datatable/model/table-config-store";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import DataTableFilter from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import ViewsToolbar from "@/components/ui/infinite-datatable/views/views-toolbar.tsx";
import JsonTooltip from "@/components/ui/json-tooltip.tsx";
import { Switch } from "@/components/ui/switch";
import { useLocalStorage } from "@/hooks/use-local-storage.tsx";
import { AggregationFunction, aggregationLabelMap } from "@/lib/clickhouse/types";
import { type ScoreRange } from "@/lib/colors";
import { type Evaluation } from "@/lib/evaluation/types";
import { track } from "@/lib/posthog";
import { swrFetcher } from "@/lib/utils";

import ClientTimestampFormatter from "../client-timestamp-formatter";
import Header from "../ui/header";
import Mono from "../ui/mono";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../ui/resizable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import GroupsList from "./groups-list";
import { useEvaluationsProgression } from "./use-evaluations-progression";

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
        return <HeatmapValue value={v} range={range} text={<Mono>{formatScoreValue(v)}</Mono>} />;
      }
      return <Mono>{Number.isInteger(v) ? v.toString() : v.toFixed(3)}</Mono>;
    },
    size: 120,
  }));
}

export const defaultEvaluationsColumnOrder = [
  "__row_selection",
  "__chart_visibility",
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

const EMPTY_HIDDEN_IDS: string[] = [];

// useDefaultLayout's default storage dereferences `localStorage` at call time,
// which throws during SSR — guard it behind a window check.
const layoutStorage: LayoutStorage = {
  getItem: (key) => (typeof window === "undefined" ? null : localStorage.getItem(key)),
  setItem: (key, value) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(key, value);
    }
  },
};

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function Evaluations() {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <InfiniteDataTableProvider
      defaults={{ columnOrder: defaultEvaluationsColumnOrder }}
      lockedColumns={["__row_selection", "__chart_visibility"]}
      views={{ projectId, resource: RESOURCE }}
    >
      <EvaluationsContent />
    </InfiniteDataTableProvider>
  );
}

function EvaluationsContent() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { effective, isLoading: isViewLoading, setSearchAndFilters, setFilters } = useTableView();
  const searchValue = useMemo(
    () => ({ filters: effective.filters, search: effective.search }),
    [effective.filters, effective.search]
  );
  const groupId = searchParams.get("groupId");
  const filter = useMemo(() => effective.filters.map((f) => JSON.stringify(f)), [effective.filters]);
  const search = effective.search.length > 0 ? effective.search : null;

  // The groups list defaults groupId to the first group on load. Until that default
  // resolves, hold off fetching so the table never flashes the unfiltered (all-groups) list.
  const { data: groups, isLoading: isGroupsLoading } = useSWR<{ groupId: string }[]>(
    `/api/projects/${params?.projectId}/evaluation-groups`,
    swrFetcher
  );
  const isGroupDefaultPending = isGroupsLoading || (!groupId && (groups?.length ?? 0) > 0);

  useEffect(() => {
    track("evaluations", "page_viewed");
  }, []);

  const [aggregationFunction, setAggregationFunction] = useState<AggregationFunction>(AggregationFunction.AVG);
  const [hoveredEvaluationId, setHoveredEvaluationId] = useState<string | undefined>(undefined);
  const [heatmapEnabled, setHeatmapEnabled] = useState(true);

  const [hiddenEvaluationIds, setHiddenEvaluationIds] = useLocalStorage<string[]>(
    `evaluations-chart-hidden:${params?.projectId}:${groupId ?? ""}`,
    EMPTY_HIDDEN_IDS
  );

  const toggleEvaluationVisibility = useCallback(
    (evaluationId: string) => {
      setHiddenEvaluationIds((prev) =>
        prev.includes(evaluationId) ? prev.filter((id) => id !== evaluationId) : [...prev, evaluationId]
      );
    },
    [setHiddenEvaluationIds]
  );

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "evaluations-sidebar-layout",
    storage: layoutStorage,
  });

  // Mount the panel group only on the client so the persisted layout is
  // available at Group registration time (same pattern as queue-content.tsx).
  const isClient = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);

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
        toast.error(error instanceof Error ? error.message : "Failed to load evaluations. Please try again.");
        throw error;
      }
    },
    [filter, groupId, params?.projectId, search]
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
    enabled: !isViewLoading && !isGroupDefaultPending,
    deps: [filter, groupId, params?.projectId, search],
  });

  const { rowSelection, onRowSelectionChange } = useSelection();

  // When exactly one (or more — we take the first) eval is row-selected, the progression
  // charts subtract that run's scores from every other run so it becomes the zero baseline.
  const selectedEvaluationId = useMemo(() => {
    const ids = Object.keys(rowSelection).filter((id) => rowSelection[id]);
    return ids.length > 0 ? ids[0] : undefined;
  }, [rowSelection]);

  // Single source for the group-scoped progression (no `ids` ⇒ every run in the
  // group). Drives the table's per-score columns, the heatmap ranges, and the
  // full run set for the chart's Hide-all / visibility — all parsed once.
  const {
    progression,
    isLoading: isProgressionLoading,
    scoreNames,
    scoresByEvalId,
    scoreRanges,
    allRunIds,
  } = useEvaluationsProgression(params?.projectId, groupId, aggregationFunction);

  const columns = useMemo<ColumnDef<Evaluation>[]>(
    () => [
      {
        id: "__chart_visibility",
        enableResizing: false,
        // Cells render with px-4 padding inside an overflow-hidden wrapper,
        // so the 28px icon button needs at least 28 + 32 = 60px of column width.
        size: 64,
        header: () => {
          const allHidden = allRunIds.length > 0 && allRunIds.every((id) => hiddenEvaluationIds.includes(id));
          return (
            // pr-4 mirrors the cell's symmetric px-4 (the header wrapper only has
            // left padding), so the header icon centers over the cell icons.
            <div className="flex items-center justify-center pr-4">
              <Button
                variant="ghost"
                size="icon"
                className={allHidden ? "text-muted-foreground" : ""}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setHiddenEvaluationIds(allHidden ? [] : allRunIds);
                }}
                title={allHidden ? "Show all" : "Hide all"}
              >
                {allHidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </Button>
            </div>
          );
        },
        cell: ({ row }) => {
          const hidden = hiddenEvaluationIds.includes(row.original.id);
          return (
            <div className="flex items-center justify-center">
              <Button
                variant="ghost"
                size="icon"
                className={hidden ? "text-muted-foreground" : ""}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleEvaluationVisibility(row.original.id);
                }}
                title={hidden ? "Show evaluation in chart" : "Hide evaluation from chart"}
              >
                {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </Button>
            </div>
          );
        },
      },
      ...baseColumns,
      ...buildScoreColumns(scoreNames, scoresByEvalId, heatmapEnabled, scoreRanges),
    ],
    [
      scoreNames,
      scoresByEvalId,
      heatmapEnabled,
      scoreRanges,
      hiddenEvaluationIds,
      toggleEvaluationVisibility,
      setHiddenEvaluationIds,
      allRunIds,
    ]
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

        toast("Evaluations deleted", { description: `Successfully deleted ${evaluationIds.length} evaluation(s).` });
      } else {
        throw new Error("Failed to delete evaluations");
      }
    } catch (error) {
      toast.error("Error", { description: "Failed to delete evaluations. Please try again." });
    }
  };

  if (!isClient) {
    return <Header path="evaluations" />;
  }

  return (
    <>
      <Header path="evaluations" />
      <ResizablePanelGroup
        id="evaluations-sidebar-panels"
        orientation="horizontal"
        className="flex flex-1 overflow-hidden pb-4 px-4"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
      >
        <ResizablePanel id="evaluations-groups-panel" defaultSize="288px" minSize="160px" maxSize="50%">
          <GroupsList />
        </ResizablePanel>
        <ResizableHandle className="z-30 mx-2 bg-transparent transition-colors duration-200" />
        <ResizablePanel id="evaluations-main-panel" className="flex flex-col w-full min-w-0 gap-2 overflow-hidden">
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
          </div>
          <ResizablePanelGroup id="evaluations-panels" className="overflow-hidden" orientation="vertical">
            <ResizablePanel className="min-w-0" minSize={20} defaultSize={20}>
              <ProgressionChart
                data={progression}
                isLoading={isProgressionLoading}
                evaluations={evaluations.map(({ id, name }) => ({ id, name }))}
                hiddenEvaluationIds={hiddenEvaluationIds}
                className="h-full"
                baselineEvaluationId={selectedEvaluationId}
                hoveredEvaluationId={hoveredEvaluationId}
                onPointClick={(id) => router.push(`/project/${params?.projectId}/evaluations/${id}`)}
              />
            </ResizablePanel>
            <ResizableHandle className="my-2 bg-transparent transition-colors duration-200" />
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
                isLoading={isLoading || isViewLoading || isGroupDefaultPending}
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
                    columnLabels={columns
                      .filter((column) => column.id !== "__chart_visibility")
                      .map((column) => ({
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
        </ResizablePanel>
      </ResizablePanelGroup>
    </>
  );
}
