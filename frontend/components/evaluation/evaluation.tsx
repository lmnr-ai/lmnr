"use client";

import { type Row } from "@tanstack/react-table";
import { debounce } from "lodash";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

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
  useEvalStore,
} from "@/components/evaluation/store";
import {
  type EvaluationStatsPayload,
  flattenScores,
  mergeDatapointUpsertIntoRows,
  mergeTraceUpdateIntoRows,
} from "@/components/evaluation/utils";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import { Skeleton } from "@/components/ui/skeleton";
import { type EvalRow, type Evaluation as EvaluationType, type EvaluationResultsInfo } from "@/lib/evaluation/types";
import { useRealtime } from "@/lib/hooks/use-realtime.ts";
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

const pageSize = 50;

function EvaluationContent({ evaluations, evaluationId, evaluationName, initialScoreNames }: EvaluationProps) {
  const { push } = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const params = useParams<{ projectId: string }>();
  const targetId = searchParams.get("targetId");
  const search = searchParams.get("search");
  const filter = searchParams.getAll("filter");
  const sortBy = searchParams.get("sortBy");
  const sortDirection = searchParams.get("sortDirection");

  const [selectedScore, setSelectedScore] = useState<string | undefined>(() => initialScoreNames[0]);
  const [traceId, setTraceId] = useState<string | undefined>(() => searchParams.get("traceId") ?? undefined);
  const [datapointId, setDatapointId] = useState<string | undefined>(
    () => searchParams.get("datapointId") ?? undefined
  );

  const addScoreName = useEvalStore((s) => s.addScoreName);
  const setIsComparison = useEvalStore((s) => s.setIsComparison);
  const scoreNames = useEvalStore((s) => s.scoreNames);
  const customColumns = useEvalStore((s) => s.customColumns);
  const isShared = useEvalStore((s) => s.isShared);

  const columnDefs = useMemo(
    () => buildColumnDefs({ scoreNames, customColumns, isShared }),
    [scoreNames, customColumns, isShared]
  );

  const statsUrl = useMemo(() => {
    const base = `/api/projects/${params.projectId}/evaluations/${evaluationId}/stats`;
    const urlParams = buildStatsParams({ search, filter, sortBy, sortDirection }, columnDefs, scoreNames);
    const qs = urlParams.toString();
    return qs ? `${base}?${qs}` : base;
  }, [params.projectId, evaluationId, search, filter, sortBy, sortDirection, columnDefs, scoreNames]);

  const {
    data: statsData,
    isLoading: isStatsLoading,
    mutate: mutateStats,
  } = useSWR<EvaluationStatsPayload>(statsUrl, swrFetcher, {
    revalidateOnFocus: false,
  });

  // Target statistics URL (if comparing)
  const targetStatsUrl = useMemo(() => {
    if (!targetId) return null;
    const base = `/api/projects/${params.projectId}/evaluations/${targetId}/stats`;
    const urlParams = buildStatsParams({ search, filter, sortBy, sortDirection }, columnDefs, scoreNames);
    const qs = urlParams.toString();
    return qs ? `${base}?${qs}` : base;
  }, [params.projectId, targetId, search, filter, sortBy, sortDirection, columnDefs, scoreNames]);

  const { data: targetStatsData } = useSWR<EvaluationStatsPayload>(targetStatsUrl, swrFetcher, {
    revalidateOnFocus: false,
  });

  // Sync comparison state from URL
  useEffect(() => {
    setIsComparison(!!targetId);
  }, [targetId, setIsComparison]);

  // SQL strings from column defs — only changes when columns structurally change.
  // useInfiniteScroll uses JSON.stringify on deps, so identical SQL strings
  // produce the same string → no spurious re-fetch.
  const columnSqls = useMemo(() => columnDefs.map((c) => c.meta?.sql).filter(Boolean), [columnDefs]);

  const onClose = useCallback(() => {
    setTraceId(undefined);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("traceId");
    params.delete("spanId");
    push(`${pathName}?${params}`);
  }, [searchParams, pathName, push]);

  // Fetch function for datapoints — single query handles comparison via targetId
  const fetchDatapoints = useCallback(
    async (pageNumber: number) => {
      const urlParams = buildFetchParams(
        {
          search,
          filter,
          sortBy,
          sortDirection,
          targetId,
          pageNumber,
          pageSize,
        },
        columnDefs
      );

      const url = `/api/projects/${params.projectId}/evaluations/${evaluationId}?${urlParams.toString()}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch datapoints.");
      }
      const data: EvaluationResultsInfo = await response.json();

      return { items: data.results, count: 0 };
    },
    [search, filter, params.projectId, evaluationId, sortBy, sortDirection, targetId, columnDefs]
  );

  // Use infinite scroll hook — data is now EvalRow (Record<string, unknown>)
  const {
    data: allDatapoints,
    hasMore: hasMorePages,
    isFetching: isFetchingPage,
    isLoading: isLoadingDatapoints,
    fetchNextPage,
    updateData,
  } = useInfiniteScroll<EvalRow>({
    fetchFn: fetchDatapoints,
    enabled: !isStatsLoading,
    deps: [search, filter, evaluationId, sortBy, sortDirection, targetId, columnSqls],
  });

  const selectedRow = useMemo<EvalRow | undefined>(
    () => allDatapoints?.find((row) => row["id"] === searchParams.get("datapointId")),
    [searchParams, allDatapoints]
  );

  const handleRowClick = useCallback((row: Row<EvalRow>) => {
    setTraceId(row.original["traceId"] as string);
    setDatapointId(row.original["id"] as string);
  }, []);

  const getRowHref = useCallback(
    (row: Row<EvalRow>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("traceId", row.original["traceId"] as string);
      params.set("datapointId", row.original["id"] as string);
      return `${pathName}?${params.toString()}`;
    },
    [pathName, searchParams]
  );

  const handleTraceChange = (id: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("traceId", id);
    push(`${pathName}?${params}`);
    setTraceId(id);
  };

  if (!selectedScore && scoreNames.length > 0) {
    setSelectedScore(scoreNames[0]);
  }

  const debouncedRevalidateStats = useMemo(
    () => debounce(() => mutateStats(), 1000, { leading: false, trailing: true }),
    [mutateStats]
  );
  useEffect(() => () => debouncedRevalidateStats.cancel(), [debouncedRevalidateStats]);

  const mergeDatapointUpsert = useCallback(
    (incoming: EvalRow & { id: string }) => {
      if (targetId) return;
      const flattened = flattenScores(incoming["scores"]);
      updateData((rows) => mergeDatapointUpsertIntoRows(rows, incoming, flattened));
      if (Object.keys(flattened).length === 0) return;

      Object.keys(flattened).forEach((key) => addScoreName(key.slice("score:".length)));
      debouncedRevalidateStats();
    },
    [updateData, targetId, addScoreName, debouncedRevalidateStats]
  );

  // Realtime merge of trace stats (cost/duration/status/tokens) onto the row
  const mergeTraceUpdate = useCallback(
    (trace: Record<string, unknown> & { id: string }) => {
      if (targetId) return;
      updateData((rows) => mergeTraceUpdateIntoRows(rows, trace));
    },
    [updateData, targetId]
  );

  const realtimeHandlers = useMemo(
    () => ({
      datapoint_upsert: (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data) as { datapoints?: Array<EvalRow & { id: string }> };
          payload.datapoints?.forEach(mergeDatapointUpsert);
        } catch (e) {
          console.warn("Failed to parse realtime datapoint_upsert:", e);
        }
      },
      trace_update: (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data) as {
            traces?: Array<Record<string, unknown> & { id: string }>;
          };
          payload.traces?.forEach(mergeTraceUpdate);
        } catch (e) {
          console.warn("Failed to parse realtime trace_update:", e);
        }
      },
    }),
    [mergeDatapointUpsert, mergeTraceUpdate]
  );

  useRealtime({
    key: `evaluation_${evaluationId}`,
    projectId: params.projectId,
    enabled: !targetId,
    eventHandlers: realtimeHandlers,
  });

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
            isLoading={isStatsLoading || isLoadingDatapoints}
            datapointId={datapointId}
            data={allDatapoints}
            scores={scoreNames}
            columnDefs={columnDefs}
            handleRowClick={handleRowClick}
            getRowHref={getRowHref}
            hasMore={hasMorePages}
            isFetching={isFetchingPage}
            fetchNextPage={fetchNextPage}
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
  return (
    <EvalStoreProvider key={props.evaluationId} initialScoreNames={props.initialScoreNames}>
      <DataTableStateProvider storageKey="evaluation-datapoints-pagination">
        <EvaluationContent {...props} />
      </DataTableStateProvider>
    </EvalStoreProvider>
  );
}
