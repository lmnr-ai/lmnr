"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Eye, EyeOff } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
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
import { Switch } from "@/components/ui/switch";
import { useLocalStorage } from "@/hooks/use-local-storage.tsx";
import { AggregationFunction, aggregationLabelMap } from "@/lib/clickhouse/types";
import { type ScoreRange } from "@/lib/colors";
import { type Evaluation } from "@/lib/evaluation/types";
import { track } from "@/lib/posthog";
import { cn, swrFetcher } from "@/lib/utils";

import ClientTimestampFormatter from "../client-timestamp-formatter";
import { higherBetterMenuItem } from "../evaluation/columns/score-cell";
import { useScoreDirections } from "../evaluation/use-score-directions";
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
  scoreRanges: Record<string, ScoreRange>,
  isHigherBetter: (scoreName: string) => boolean,
  onToggleScoreDirection?: (scoreName: string) => void
): ColumnDef<Evaluation>[] {
  return scoreNames.map((scoreName) => {
    const higherBetter = isHigherBetter(scoreName);
    return {
      id: `score:${scoreName}`,
      header: scoreName,
      accessorFn: (row) => scoresByEvalId[row.id]?.[scoreName] ?? null,
      cell: (cell) => {
        const v = cell.getValue() as number | null;
        if (!isValidScore(v)) return <span className="text-muted-foreground">—</span>;
        const range = scoreRanges[scoreName];
        if (heatmapEnabled && range) {
          return (
            <HeatmapValue
              value={v}
              range={range}
              isHigherBetter={higherBetter}
              text={<Mono>{formatScoreValue(v)}</Mono>}
            />
          );
        }
        return <Mono>{Number.isInteger(v) ? v.toString() : v.toFixed(3)}</Mono>;
      },
      size: 120,
      meta: onToggleScoreDirection
        ? {
            customDropdownItems: () => [higherBetterMenuItem(higherBetter, () => onToggleScoreDirection(scoreName))],
          }
        : undefined,
    };
  });
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
  const { effective, isLoading: isViewLoading, setSearchAndFilters, setFilters } = useTableView();
  const { rowSelection, onRowSelectionChange } = useSelection();

  const searchValue = useMemo(
    () => ({ filters: effective.filters, search: effective.search }),
    [effective.filters, effective.search]
  );
  // Canonical group selection lives in the URL via nuqs — read here, written
  // by the groups list. nuqs merges into (never clobbers) the other query params.
  const [groupId] = useQueryState("groupId");
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
  // Off (default): 0–1 scores plot on a fixed 0–1 axis, others on their own min/max.
  // On: every score stretches to its own min/max so it fills the full chart height.
  const [fillHeight, setFillHeight] = useLocalStorage<boolean>(
    `evaluations-chart-fill-height:${params?.projectId}`,
    false
  );
  // Keep the resize handles blue while a drag is in flight (not just on hover),
  // matching the trace-view affordance.
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingChart, setIsResizingChart] = useState(false);

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

  // Resolved eval-score directions (override > app-wide LLM default > true).
  const { isHigherBetter, toggle: toggleScoreDirection } = useScoreDirections(params?.projectId, scoreNames);

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
      ...buildScoreColumns(
        scoreNames,
        scoresByEvalId,
        heatmapEnabled,
        scoreRanges,
        isHigherBetter,
        toggleScoreDirection
      ),
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
      isHigherBetter,
      toggleScoreDirection,
    ]
  );

  // Baseline mode is a strictly single-selection gesture: when EXACTLY one eval is
  // row-selected, the progression charts subtract that run's scores from every other
  // run so it becomes the zero baseline. Multi-select (incl. select-all) is a bulk-action
  // gesture (Delete), so it must NOT hijack the chart into a baseline — otherwise
  // toggling select-all visibly "switches" the chart.
  const selectedEvaluationId = useMemo(() => {
    const ids = Object.keys(rowSelection).filter((id) => rowSelection[id]);
    return ids.length === 1 ? ids[0] : undefined;
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
      <Header
        path={[
          { name: "evaluations", href: `/project/${params?.projectId}/evaluations` },
          ...(groupId ? [{ name: groupId }] : []),
        ]}
      />
      <ResizablePanelGroup
        id="evaluations-sidebar-panels"
        orientation="horizontal"
        className="flex flex-1 overflow-hidden pb-4 px-4"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
      >
        <ResizablePanel
          id="evaluations-groups-panel"
          defaultSize="288px"
          minSize="160px"
          maxSize="50%"
          // Without flex-col the panel's default flex-row content wrapper (min-width:auto)
          // sizes to the widest group and overflows a narrowed panel; flex-col stretches it.
          className="flex flex-col min-w-0 overflow-hidden"
        >
          <GroupsList />
        </ResizablePanel>
        <ResizableHandle
          onDragChange={setIsResizingSidebar}
          className={cn(
            "z-30 mx-3 transition-colors hover:bg-blue-400 hover:scale-200",
            isResizingSidebar && "bg-blue-400"
          )}
        />
        <ResizablePanel id="evaluations-main-panel" className="flex flex-col w-full min-w-0 gap-2 overflow-hidden">
          <div className="flex gap-2 items-center">
            {/* Group name is shown in the breadcrumb; only the aggregation control lives here. */}
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
            <div className="flex items-center gap-2 pl-1 pr-2 border rounded-md bg-background h-7">
              <Switch id="fill-height" checked={fillHeight} onCheckedChange={setFillHeight} />
              <label htmlFor="fill-height" className="text-xs cursor-pointer font-medium text-secondary-foreground">
                Normalize per score
              </label>
            </div>
          </div>
          <ResizablePanelGroup id="evaluations-panels" className="overflow-hidden" orientation="vertical">
            <ResizablePanel className="min-w-0" minSize={160} maxSize={500} defaultSize={220}>
              <ProgressionChart
                data={progression}
                isLoading={isProgressionLoading}
                evaluations={chartEvaluations}
                hiddenEvaluationIds={hiddenEvaluationIds}
                className="h-full"
                baselineEvaluationId={selectedEvaluationId}
                hoveredEvaluationId={hoveredEvaluationId}
                onPointClick={(id) => router.push(`/project/${params?.projectId}/evaluations/${id}`)}
                fillHeight={fillHeight}
              />
            </ResizablePanel>
            <ResizableHandle
              onDragChange={setIsResizingChart}
              className={cn(
                "mb-2 bg-transparent transition-colors hover:bg-blue-400 hover:scale-200",
                isResizingChart && "bg-blue-400"
              )}
            />
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
