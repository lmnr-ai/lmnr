"use client";

import { debounce } from "lodash";
import { useParams, useSearchParams } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useEffect, useMemo } from "react";
import useSWR from "swr";
import { shallow } from "zustand/shallow";

import EvalTraceLayout from "@/components/evaluation/eval-trace-layout";
import EvaluationHeader from "@/components/evaluation/evaluation-header";
import GatesTable from "@/components/evaluation/gates-table";
import RowScoreChips from "@/components/evaluation/row-score-chips";
import RunScoreCard from "@/components/evaluation/run-score-card";
import {
  buildColumnDefs,
  buildFetchParams,
  buildStatsParams,
  EvalStoreProvider,
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
// Default visibility: status + data + score:*.
const DEFAULT_HIDDEN_COLUMNS = ["index", "target", "metadata", "output", "duration", "cost"];

function EvaluationContent({ evaluations, evaluationId }: EvaluationProps) {
  const searchParams = useSearchParams();
  const params = useParams<{ projectId: string }>();

  const targetId = searchParams.get("targetId");

  // View-owned params (filter / search / sort) flow through the view layer.
  // `effective` merges URL params with the selected view's baseline.
  const { effective, isLoading: isViewLoading } = useTableView();
  const filter = useMemo(() => effective.filters.map((f) => JSON.stringify(f)), [effective.filters]);
  const search = effective.search.length > 0 ? effective.search : null;
  const sortBy = effective.sortBy ?? undefined;
  const sortDirection = effective.sortDirection ?? undefined;

  // Column config layer: customColumns are read from the config store and
  // threaded into the columnDefs / URLs below.
  const { customColumns } = useTableConfigStore((s) => ({ customColumns: s.config.customColumns }), shallow);

  // Eval-specific state lives in EvalStore. customColumns intentionally do not.
  const scoreNames = useEvalStore((s) => s.scoreNames);
  const isShared = useEvalStore((s) => s.isShared);
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

  // Selection is DERIVED from the URL, not stored — so a deep link whose
  // datapoint hasn't loaded yet, a filter that drops the selected row, or a
  // back/forward nav can never leave the always-open panel blank or stale.
  // `datapointId` is the source of truth; `traceId` follows the resolved row.
  const [datapointId, setDatapointId] = useQueryState("datapointId", parseAsString);
  const [traceIdParam, setTraceIdParam] = useQueryState("traceId", parseAsString);

  const firstRow = allDatapoints?.[0] as EvalRow | undefined;
  // The open datapoint: the URL-linked row if it's loaded, else the first row.
  const selectedRow = useMemo(() => {
    const byId = datapointId ? allDatapoints?.find((r) => r["id"] === datapointId) : undefined;
    return byId ?? firstRow;
  }, [allDatapoints, datapointId, firstRow]);

  // Prefer the resolved row's trace; fall back to a bare `?traceId` link (older
  // shared links carried traceId without datapointId).
  const traceId = (selectedRow?.["traceId"] as string | undefined) ?? traceIdParam ?? undefined;

  const onGateRowClick = useCallback(
    (row: EvalRow) => {
      setDatapointId(row["id"] as string);
      setTraceIdParam(row["traceId"] as string);
    },
    [setDatapointId, setTraceIdParam]
  );

  const table = (
    <GatesTable
      data={allDatapoints}
      isLoading={isStatsLoading || isLoadingDatapoints || isViewLoading}
      isFetching={isFetching}
      hasMore={hasMore}
      fetchNextPage={fetchNextPage}
      selectedId={(selectedRow?.["id"] as string | undefined) ?? undefined}
      onRowClick={onGateRowClick}
    />
  );

  return (
    <>
      <EvaluationHeader name={statsData?.evaluation?.name} urlKey={statsUrl} evaluations={evaluations} />
      <div className="flex-1 flex gap-2 flex-col relative overflow-hidden">
        {/* Left + top padding only: the trace panel must run flush to the right
            and bottom edges when open, so those paddings live on the pieces that
            need them (the table's right padding in EvalTraceLayout) rather than
            the wrapper. */}
        <div className="flex flex-col gap-2 flex-1 overflow-hidden pl-4 pt-2">
          {/* Split view. LEFT = run aggregate card (score picker) above the table.
              RIGHT = the selected datapoint's score pills above its always-open
              trace view, flush to the right + bottom edges with a rounded top-left. */}
          <EvalTraceLayout
            table={
              <div className="flex h-full w-full flex-col gap-2 overflow-hidden pb-4">
                <RunScoreCard
                  scoreNames={scoreNames}
                  allStatistics={statsData?.allStatistics}
                  allDistributions={statsData?.allDistributions}
                  comparedAllStatistics={targetStatsData?.allStatistics}
                  comparedAllDistributions={targetStatsData?.allDistributions}
                  isComparison={isComparison}
                />
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
                  {/* No onClose ⇒ always-open: the trace header shows no close button. */}
                  {traceId && <TraceView key={traceId} traceId={traceId} />}
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
