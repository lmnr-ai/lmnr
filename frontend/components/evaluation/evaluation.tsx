"use client";

import { type Row } from "@tanstack/react-table";
import { debounce } from "lodash";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { shallow } from "zustand/shallow";

import AggregateScoreCards from "@/components/evaluation/aggregate-score-cards";
import EvalTraceLayout from "@/components/evaluation/eval-trace-layout";
import EvaluationDatapointsTable from "@/components/evaluation/evaluation-datapoints-table";
import EvaluationHeader from "@/components/evaluation/evaluation-header";
import { isBinaryDistribution } from "@/components/evaluation/metrics-panel/utils";
import RowScoreChips from "@/components/evaluation/row-score-chips";
import RunScoreCard from "@/components/evaluation/run-score-card";
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
import { type EvalRow, type Evaluation as EvaluationType, type EvaluationResultsInfo } from "@/lib/evaluation/types";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { swrFetcher } from "@/lib/utils";

import TraceView from "../traces/trace-view";

interface EvaluationProps {
  evaluations: EvaluationType[];
  evaluationId: string;
  evaluationName: string;
  initialScoreNames: string[];
}

const PAGE_SIZE = 50;
const BASE_COLUMN_ORDER = ["status", "index", "data", "target", "metadata", "output", "duration", "cost"];
// Forked from the pre-refresh "evaluation" resource so old persisted table
// config never fights the new defaults.
const RESOURCE = "evaluation-v1.1";
// Default visibility: status + index + data + target + metadata + score:*.
const DEFAULT_HIDDEN_COLUMNS = ["output", "duration", "cost"];

function EvaluationContent({ evaluations, evaluationId }: EvaluationProps) {
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

  // Stats SWR — drives the score chips + charts.
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
        if (targetId) return;
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
        if (targetId) return;
        try {
          const payload = JSON.parse(event.data) as { traces?: Array<Record<string, unknown> & { id: string }> };
          payload.traces?.forEach((trace) => updateData((rows) => mergeTraceUpdateIntoRows(rows, trace)));
        } catch (e) {
          console.warn("Failed to parse realtime trace_update:", e);
        }
      },
    }),
    [updateData, addScoreName, debouncedRevalidateStats, targetId]
  );

  useRealtime({
    key: `evaluation_${evaluationId}`,
    projectId: params.projectId,
    enabled: !targetId,
    eventHandlers: realtimeHandlers,
  });

  // Side-panel + selected-row state for trace view.
  const [traceId, setTraceId] = useState<string | undefined>(() => searchParams.get("traceId") ?? undefined);
  const [datapointId, setDatapointId] = useState<string | undefined>(
    () => searchParams.get("datapointId") ?? undefined
  );

  // Retain the last opened trace so its content stays mounted while the column
  // animates out (onClose clears traceId immediately). Adjust during render
  // rather than in an effect to avoid a cascading commit.
  const [displayTraceId, setDisplayTraceId] = useState<string | undefined>(traceId);
  if (traceId && traceId !== displayTraceId) {
    setDisplayTraceId(traceId);
  }

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

  const visibleColumnDefs = useMemo(
    () => selectVisibleColumnDefs(columnDefs, isComparison),
    [columnDefs, isComparison]
  );

  const hasNonBinary = useMemo(() => {
    const dists = statsData?.allDistributions;
    if (!dists) return true;
    return scoreNames.some((name) => !isBinaryDistribution(dists[name] ?? null));
  }, [scoreNames, statsData?.allDistributions]);

  const onDeleteCustomColumn = useCallback(
    (columnId: string) => removeCustomColumn(columnId.replace("custom:", "")),
    [removeCustomColumn]
  );

  const searchValue = useMemo(
    () => ({ filters: effective.filters, search: effective.search }),
    [effective.filters, effective.search]
  );

  const table = (
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
  );

  // The selected datapoint — drives the per-row score chips above the trace.
  const selectedRow = useMemo(
    () => (datapointId ? allDatapoints?.find((row) => row["id"] === datapointId) : undefined),
    [allDatapoints, datapointId]
  );

  return (
    <>
      <EvaluationHeader
        name={statsData?.evaluation?.name}
        urlKey={statsUrl}
        evaluations={evaluations}
        hasNonBinary={hasNonBinary}
      />
      <div className="flex-1 flex gap-2 flex-col relative overflow-hidden">
        {/* Left + top padding only: the trace panel must run flush to the right
            and bottom edges when open, so those paddings live on the pieces that
            need them (the table's right padding in EvalTraceLayout) rather than
            the wrapper. */}
        <div className="flex flex-col gap-2 flex-1 overflow-hidden pl-4 pt-2">
          {/* Split view.
              LEFT = the whole run (aggregate), above the table: a horizontal
              strip of per-score cards while no trace is open, collapsing to one
              aggregate card with a score picker once a row is selected.
              RIGHT = the single selected datapoint: its score pills (hover shows
              that row's value across previous runs) above the trace view, in a
              panel that runs flush to the right + bottom edges with a top+left
              border and one rounded top-left corner. Left-column right-padding
              is applied in EvalTraceLayout, only when it owns the full row. */}
          <EvalTraceLayout
            showTrace={!!traceId}
            table={
              <div className="flex h-full w-full flex-col gap-2 overflow-hidden">
                {traceId ? (
                  <RunScoreCard
                    scoreNames={scoreNames}
                    allStatistics={statsData?.allStatistics}
                    allDistributions={statsData?.allDistributions}
                    comparedAllStatistics={targetStatsData?.allStatistics}
                    comparedAllDistributions={targetStatsData?.allDistributions}
                    isComparison={isComparison}
                  />
                ) : (
                  <AggregateScoreCards
                    scoreNames={scoreNames}
                    allStatistics={statsData?.allStatistics}
                    allDistributions={statsData?.allDistributions}
                    comparedAllStatistics={targetStatsData?.allStatistics}
                    comparedAllDistributions={targetStatsData?.allDistributions}
                    isComparison={isComparison}
                    isLoading={isStatsLoading}
                  />
                )}
                <div className="flex min-h-0 flex-1 overflow-hidden">{table}</div>
              </div>
            }
            traceColumn={
              <div className="flex h-full flex-col overflow-hidden rounded-tl-lg border-l border-t bg-background">
                <div className="flex-none border-b px-3 py-2">
                  <RowScoreChips
                    projectId={params.projectId}
                    evaluations={evaluations}
                    currentEvaluationId={evaluationId}
                    scoreNames={scoreNames}
                    row={selectedRow}
                  />
                </div>
                <div className="flex min-h-0 flex-1 overflow-hidden">
                  {displayTraceId && <TraceView key={displayTraceId} traceId={displayTraceId} onClose={onClose} />}
                </div>
              </div>
            }
          />
        </div>
      </div>
    </>
  );
}

export default function Evaluation(props: EvaluationProps) {
  const { projectId } = useParams<{ projectId: string }>();

  const defaultColumnOrder = useMemo(
    () => [...BASE_COLUMN_ORDER, ...props.initialScoreNames.map((s) => `score:${s}`)],
    [props.initialScoreNames]
  );

  const defaultColumnVisibility = useMemo(
    () => Object.fromEntries(DEFAULT_HIDDEN_COLUMNS.map((id) => [id, false])),
    []
  );

  return (
    <EvalStoreProvider key={props.evaluationId} initialScoreNames={props.initialScoreNames}>
      <InfiniteDataTableProvider
        key={RESOURCE}
        views={{ projectId, resource: RESOURCE }}
        defaults={{ columnOrder: defaultColumnOrder, columnVisibility: defaultColumnVisibility }}
      >
        <EvaluationContent {...props} />
      </InfiniteDataTableProvider>
    </EvalStoreProvider>
  );
}
