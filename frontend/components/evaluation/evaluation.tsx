"use client";

import { type Row } from "@tanstack/react-table";
import { debounce } from "lodash";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { shallow } from "zustand/shallow";

import Chart from "@/components/evaluation/chart";
import CompareChart from "@/components/evaluation/compare-chart";
import EvaluationDatapointsTable from "@/components/evaluation/evaluation-datapoints-table";
import EvaluationHeader from "@/components/evaluation/evaluation-header";
import ScoreCard from "@/components/evaluation/score-card";
import {
  buildColumnDefs,
  buildFetchParams,
  buildStatsParams,
  EvalStoreProvider,
  selectVisibleColumnDefs,
  useEvalStore,
} from "@/components/evaluation/store";
import {
  type EvaluationStatsPayload,
  flattenScores,
  mergeDatapointUpsertIntoRows,
  mergeTraceUpdateIntoRows,
} from "@/components/evaluation/utils";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { useTableConfigStore, useTableView } from "@/components/ui/infinite-datatable/model/table-config-store";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import { Skeleton } from "@/components/ui/skeleton";
import { type EvalRow, type Evaluation as EvaluationType, type EvaluationResultsInfo } from "@/lib/evaluation/types";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { formatTimestamp, swrFetcher } from "@/lib/utils";

import { TraceViewSidePanel } from "../traces/trace-view";
import Header from "../ui/header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

interface EvaluationProps {
  evaluations: EvaluationType[];
  evaluationId: string;
  evaluationName: string;
  initialScoreNames: string[];
}

const PAGE_SIZE = 50;
const BASE_COLUMN_ORDER = ["status", "index", "data", "target", "metadata", "output", "duration", "cost"];
const RESOURCE = "evaluation";

function EvaluationContent({ evaluations, evaluationId, evaluationName }: EvaluationProps) {
  const { push } = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const params = useParams<{ projectId: string }>();

  const targetId = searchParams.get("targetId");

  // View-owned params (filter / search / sort) flow through the view layer.
  // `effective` merges URL params with the selected view's baseline.
  const { effective, isLoading: isViewLoading, setSort, setSearchAndFilters } = useTableView();
  const filter = useMemo(() => effective.filters.map((f) => JSON.stringify(f)), [effective.filters]);
  const search = effective.search.length > 0 ? effective.search : null;
  const sortBy = effective.sortBy ?? undefined;
  const sortDirection = effective.sortDirection ?? undefined;

  // Column config layer: customColumns are read from the config store and
  // threaded into the columnDefs / URLs below.
  const { customColumns, removeCustomColumn } = useTableConfigStore(
    (s) => ({ customColumns: s.config.customColumns, removeCustomColumn: s.removeCustomColumn }),
    shallow
  );

  // Eval-specific state lives in EvalStore. customColumns intentionally do not.
  const scoreNames = useEvalStore((s) => s.scoreNames);
  const isShared = useEvalStore((s) => s.isShared);
  const heatmapEnabled = useEvalStore((s) => s.heatmapEnabled);
  const setHeatmapEnabled = useEvalStore((s) => s.setHeatmapEnabled);
  const addScoreName = useEvalStore((s) => s.addScoreName);

  const isComparison = !!targetId;
  const columnDefs = useMemo(
    () => buildColumnDefs({ scoreNames, customColumns, isShared }),
    [scoreNames, customColumns, isShared]
  );

  // Stats SWR — drives the score card + chart.
  const statsUrl = useMemo(() => {
    const base = `/api/projects/${params.projectId}/evaluations/${evaluationId}/stats`;
    const urlParams = buildStatsParams(
      { search, filter, sortBy: sortBy ?? null, sortDirection: sortDirection?.toUpperCase() ?? null },
      columnDefs,
      scoreNames
    );
    const qs = urlParams.toString();
    return qs ? `${base}?${qs}` : base;
  }, [params.projectId, evaluationId, search, filter, sortBy, sortDirection, columnDefs, scoreNames]);

  const {
    data: statsData,
    isLoading: isStatsLoading,
    mutate: mutateStats,
  } = useSWR<EvaluationStatsPayload>(statsUrl, swrFetcher, { revalidateOnFocus: false });

  const targetStatsUrl = useMemo(() => {
    if (!targetId) return null;
    const base = `/api/projects/${params.projectId}/evaluations/${targetId}/stats`;
    const urlParams = buildStatsParams(
      { search, filter, sortBy: sortBy ?? null, sortDirection: sortDirection?.toUpperCase() ?? null },
      columnDefs,
      scoreNames
    );
    const qs = urlParams.toString();
    return qs ? `${base}?${qs}` : base;
  }, [params.projectId, targetId, search, filter, sortBy, sortDirection, columnDefs, scoreNames]);

  const { data: targetStatsData } = useSWR<EvaluationStatsPayload>(targetStatsUrl, swrFetcher, {
    revalidateOnFocus: false,
  });

  // Datapoints fetcher — depends on columnDefs (custom column SQL, etc).
  // SQL strings are stable across cosmetic columnDefs changes; JSON.stringify
  // on `columnSqls` produces the same string → no spurious refetch.
  const columnSqls = useMemo(() => columnDefs.map((c) => c.meta?.sql).filter(Boolean), [columnDefs]);

  const fetchDatapoints = useCallback(
    async (pageNumber: number) => {
      const urlParams = buildFetchParams(
        {
          search,
          filter,
          sortBy: sortBy ?? null,
          sortDirection: sortDirection?.toUpperCase() ?? null,
          targetId,
          pageNumber,
          pageSize: PAGE_SIZE,
        },
        columnDefs
      );
      const url = `/api/projects/${params.projectId}/evaluations/${evaluationId}?${urlParams.toString()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch datapoints.");
      const data: EvaluationResultsInfo = await response.json();
      return { items: data.results, count: 0 };
    },
    [search, filter, params.projectId, evaluationId, sortBy, sortDirection, targetId, columnDefs]
  );

  const {
    data: allDatapoints,
    hasMore,
    isFetching,
    isLoading: isLoadingDatapoints,
    fetchNextPage,
    updateData,
  } = useInfiniteScroll<EvalRow>({
    fetchFn: fetchDatapoints,
    enabled: !isStatsLoading && !isViewLoading,
    deps: [search, filter, evaluationId, sortBy, sortDirection, targetId, columnSqls],
  });

  // Score-range heatmap input — derived from current data, no storage needed.
  const scoreRanges = useMemo(() => {
    if (!allDatapoints) return {};
    const isValidNumber = (value: unknown): value is number => typeof value === "number" && !isNaN(value);
    return scoreNames.reduce(
      (acc, scoreName) => {
        const values = allDatapoints
          .flatMap((row) => {
            const v = [row[`score:${scoreName}`]];
            if (targetId) v.push(row[`compared:score:${scoreName}`]);
            return v;
          })
          .filter(isValidNumber);
        if (values.length === 0) return acc;
        return { ...acc, [scoreName]: { min: Math.min(...values), max: Math.max(...values) } };
      },
      {} as Record<string, { min: number; max: number }>
    );
  }, [allDatapoints, scoreNames, targetId]);

  // Realtime — only on the live (non-comparison) eval page.
  const debouncedRevalidateStats = useMemo(
    () => debounce(() => mutateStats(), 1000, { leading: false, trailing: true }),
    [mutateStats]
  );
  useEffect(() => () => debouncedRevalidateStats.cancel(), [debouncedRevalidateStats]);

  const realtimeHandlers = useMemo(
    () => ({
      datapoint_upsert: (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data) as { datapoints?: Array<EvalRow & { id: string }> };
          payload.datapoints?.forEach((incoming) => {
            const flattened = flattenScores(incoming["scores"]);
            updateData((rows) => mergeDatapointUpsertIntoRows(rows, incoming, flattened));
            if (Object.keys(flattened).length === 0) return;
            Object.keys(flattened).forEach((key) => addScoreName(key.slice("score:".length)));
            debouncedRevalidateStats();
          });
        } catch (e) {
          console.warn("Failed to parse realtime datapoint_upsert:", e);
        }
      },
      trace_update: (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data) as { traces?: Array<Record<string, unknown> & { id: string }> };
          payload.traces?.forEach((trace) => updateData((rows) => mergeTraceUpdateIntoRows(rows, trace)));
        } catch (e) {
          console.warn("Failed to parse realtime trace_update:", e);
        }
      },
    }),
    [updateData, addScoreName, debouncedRevalidateStats]
  );

  useRealtime({
    key: `evaluation_${evaluationId}`,
    projectId: params.projectId,
    enabled: !targetId,
    eventHandlers: realtimeHandlers,
  });

  // Side-panel + selected-row state for trace view.
  const [selectedScore, setSelectedScore] = useState<string | undefined>(() => scoreNames[0]);
  const [traceId, setTraceId] = useState<string | undefined>(() => searchParams.get("traceId") ?? undefined);
  const [datapointId, setDatapointId] = useState<string | undefined>(
    () => searchParams.get("datapointId") ?? undefined
  );

  if (!selectedScore && scoreNames.length > 0) {
    setSelectedScore(scoreNames[0]);
  }

  const selectedRow = useMemo<EvalRow | undefined>(
    () => allDatapoints?.find((row) => row["id"] === datapointId),
    [allDatapoints, datapointId]
  );

  const handleRowClick = useCallback((row: Row<EvalRow>) => {
    setTraceId(row.original["traceId"] as string);
    setDatapointId(row.original["id"] as string);
  }, []);

  const getRowHref = useCallback(
    (row: Row<EvalRow>) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("traceId", row.original["traceId"] as string);
      next.set("datapointId", row.original["id"] as string);
      return `${pathName}?${next.toString()}`;
    },
    [pathName, searchParams]
  );

  const handleSort = useCallback(
    (columnId: string, direction: "asc" | "desc") => {
      setSort(columnId || null, columnId ? direction : null);
    },
    [setSort]
  );

  const onClose = useCallback(() => {
    setTraceId(undefined);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("traceId");
    next.delete("spanId");
    push(`${pathName}?${next}`);
  }, [searchParams, pathName, push]);

  const handleTraceChange = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("traceId", id);
    push(`${pathName}?${next}`);
    setTraceId(id);
  };

  const visibleColumnDefs = useMemo(
    () => selectVisibleColumnDefs(columnDefs, isComparison),
    [columnDefs, isComparison]
  );

  const onDeleteCustomColumn = useCallback(
    (columnId: string) => removeCustomColumn(columnId.replace("custom:", "")),
    [removeCustomColumn]
  );

  const searchValue = useMemo(
    () => ({ filters: effective.filters, search: effective.search }),
    [effective.filters, effective.search]
  );

  return (
    <>
      <Header
        path={[
          { name: "evaluations", href: `/project/${params.projectId}/evaluations` },
          { name: statsData?.evaluation?.name || evaluationName },
        ]}
      />
      <div className="flex-1 flex gap-2 flex-col relative overflow-hidden">
        <EvaluationHeader name={statsData?.evaluation?.name} urlKey={statsUrl} evaluations={evaluations} />
        <div className="flex flex-col gap-2 flex-1 overflow-hidden px-4 pb-4">
          <div className="flex flex-row space-x-4 p-4 border rounded bg-secondary">
            {isStatsLoading ? (
              <>
                <Skeleton className="w-72 h-48" />
                <Skeleton className="w-full h-48" />
              </>
            ) : (
              <>
                <div className="flex-none w-72">
                  <ScoreCard
                    scores={scoreNames}
                    selectedScore={selectedScore}
                    setSelectedScore={setSelectedScore}
                    statistics={selectedScore ? (statsData?.allStatistics?.[selectedScore] ?? null) : null}
                    comparedStatistics={
                      selectedScore ? (targetStatsData?.allStatistics?.[selectedScore] ?? null) : null
                    }
                    isLoading={isStatsLoading}
                  />
                </div>
                <div className="grow">
                  {targetId ? (
                    <CompareChart
                      distribution={selectedScore ? (statsData?.allDistributions?.[selectedScore] ?? null) : null}
                      comparedDistribution={
                        selectedScore ? (targetStatsData?.allDistributions?.[selectedScore] ?? null) : null
                      }
                      isLoading={isStatsLoading}
                    />
                  ) : (
                    <Chart
                      scoreName={selectedScore}
                      distribution={selectedScore ? (statsData?.allDistributions?.[selectedScore] ?? null) : null}
                      isLoading={isStatsLoading}
                    />
                  )}
                </div>
              </>
            )}
          </div>
          <EvaluationDatapointsTable
            data={allDatapoints}
            isLoading={isStatsLoading || isLoadingDatapoints || isViewLoading}
            isFetching={isFetching}
            hasMore={hasMore}
            fetchNextPage={fetchNextPage}
            columnDefs={columnDefs}
            visibleColumnDefs={visibleColumnDefs}
            isComparison={isComparison}
            scoreRanges={scoreRanges}
            datapointId={datapointId}
            handleRowClick={handleRowClick}
            getRowHref={getRowHref}
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={handleSort}
            heatmapEnabled={heatmapEnabled}
            onHeatmapEnabledChange={setHeatmapEnabled}
            onDeleteCustomColumn={onDeleteCustomColumn}
            searchValue={searchValue}
            onSearchChange={setSearchAndFilters}
            viewsResource={RESOURCE}
          />
        </div>
      </div>
      {traceId && (
        <TraceViewSidePanel onClose={onClose} traceId={traceId}>
          {targetId && (
            <div className="h-12 flex flex-none items-center border-b space-x-2 px-4">
              <Select value={traceId} onValueChange={handleTraceChange}>
                <SelectTrigger className="flex font-medium text-secondary-foreground">
                  <SelectValue placeholder="Select evaluation" />
                </SelectTrigger>
                <SelectContent>
                  {(selectedRow?.["traceId"] as string) && (
                    <SelectItem value={selectedRow!["traceId"] as string}>
                      <span>
                        {statsData?.evaluation.name}
                        <span className="text-secondary-foreground text-xs ml-2">
                          {formatTimestamp(String(statsData?.evaluation.createdAt))}
                        </span>
                      </span>
                    </SelectItem>
                  )}
                  {(selectedRow?.["compared:traceId"] as string) && (
                    <SelectItem value={selectedRow!["compared:traceId"] as string}>
                      <span>
                        {targetStatsData?.evaluation.name}
                        <span className="text-secondary-foreground text-xs ml-2">
                          {formatTimestamp(String(targetStatsData?.evaluation.createdAt))}
                        </span>
                      </span>
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </TraceViewSidePanel>
      )}
    </>
  );
}

export default function Evaluation(props: EvaluationProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const defaultColumnOrder = useMemo(
    () => [...BASE_COLUMN_ORDER, ...props.initialScoreNames.map((s) => `score:${s}`)],
    [props.initialScoreNames]
  );

  return (
    <EvalStoreProvider key={props.evaluationId} initialScoreNames={props.initialScoreNames}>
      <InfiniteDataTableProvider
        views={{ projectId, resource: RESOURCE }}
        defaults={{ columnOrder: defaultColumnOrder }}
      >
        <EvaluationContent {...props} />
      </InfiniteDataTableProvider>
    </EvalStoreProvider>
  );
}
