"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Eye, EyeOff } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { type LayoutStorage, useDefaultLayout } from "react-resizable-panels";
import useSWR from "swr";

import HeatmapValue from "@/components/evaluation/heatmap-value";
import { formatScoreValue, isValidScore } from "@/components/evaluation/utils";
import ProgressionChart from "@/components/evaluations/progression-chart";
import { EvaluationsTableContents } from "@/components/evaluations/table-contents";
import { EvaluationsTableControls } from "@/components/evaluations/table-controls";
import { Button } from "@/components/ui/button";
import CopyTooltip from "@/components/ui/copy-tooltip";
import { useSelection } from "@/components/ui/infinite-datatable/hooks";
import { useTableView } from "@/components/ui/infinite-datatable/model/table-config-store";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import JsonTooltip from "@/components/ui/json-tooltip.tsx";
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
import { defaultEvaluationsColumnOrder, RESOURCE } from "./constants";
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

const layoutStorage: LayoutStorage = {
  getItem: (key) => (typeof window === "undefined" ? null : localStorage.getItem(key)),
  setItem: (key, value) => {
    if (typeof window !== "undefined") localStorage.setItem(key, value);
  },
};

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

const EMPTY_HIDDEN_IDS: string[] = [];

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
  const { rowSelection, onRowSelectionChange } = useSelection();

  const searchValue = useMemo(
    () => ({ filters: effective.filters, search: effective.search }),
    [effective.filters, effective.search]
  );
  const groupId = searchParams.get("groupId");
  const filter = useMemo(() => effective.filters.map((f) => JSON.stringify(f)), [effective.filters]);
  const search = effective.search.length > 0 ? effective.search : null;

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
  const [chartEvaluations, setChartEvaluations] = useState<{ id: string; name: string }[]>([]);

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

  const isClient = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);

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
        size: 64,
        header: () => {
          const allHidden = allRunIds.length > 0 && allRunIds.every((id) => hiddenEvaluationIds.includes(id));
          return (
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

  const selectedEvaluationId = useMemo(() => {
    const ids = Object.keys(rowSelection).filter((id) => rowSelection[id]);
    return ids.length > 0 ? ids[0] : undefined;
  }, [rowSelection]);

  const refetchRef = useRef<() => void>(() => {});

  const onEvaluationsChange = useCallback((evals: { id: string; name: string }[]) => {
    // Bail when the id→name set is unchanged so the chart doesn't recompute needlessly.
    setChartEvaluations((prev) => {
      if (prev.length === evals.length && prev.every((p, i) => p.id === evals[i].id && p.name === evals[i].name)) {
        return prev;
      }
      return evals;
    });
  }, []);

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
                evaluations={chartEvaluations}
                hiddenEvaluationIds={hiddenEvaluationIds}
                className="h-full"
                baselineEvaluationId={selectedEvaluationId}
                hoveredEvaluationId={hoveredEvaluationId}
                onPointClick={(id) => router.push(`/project/${params?.projectId}/evaluations/${id}`)}
              />
            </ResizablePanel>
            <ResizableHandle className="my-2 bg-transparent transition-colors duration-200" />
            <ResizablePanel className="flex flex-1 w-full overflow-hidden" minSize={40} defaultSize={40}>
              <EvaluationsTableContents
                filter={filter}
                search={search}
                groupId={groupId}
                isViewLoading={isViewLoading}
                isGroupDefaultPending={isGroupDefaultPending}
                columns={columns}
                hiddenEvaluationIds={hiddenEvaluationIds}
                rowSelection={rowSelection}
                onRowSelectionChange={onRowSelectionChange}
                onHoveredRowChange={setHoveredEvaluationId}
                refetchRef={refetchRef}
                onEvaluationsChange={onEvaluationsChange}
              >
                <EvaluationsTableControls
                  projectId={params.projectId}
                  activeFilters={effective.filters}
                  onFiltersChange={setFilters}
                  columns={columns}
                  scoreNames={scoreNames}
                  heatmapEnabled={heatmapEnabled}
                  onHeatmapEnabledChange={setHeatmapEnabled}
                  searchValue={searchValue}
                  onSearchChange={setSearchAndFilters}
                />
              </EvaluationsTableContents>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </>
  );
}
