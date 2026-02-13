"use client";

import { type Row } from "@tanstack/react-table";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Resizable, type ResizeCallback } from "re-resizable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import Chart from "@/components/evaluation/chart";
import CompareChart from "@/components/evaluation/compare-chart";
import EvaluationDatapointsTable from "@/components/evaluation/evaluation-datapoints-table";
import EvaluationHeader from "@/components/evaluation/evaluation-header";
import ScoreCard from "@/components/evaluation/score-card";
import { useEvalStore } from "@/components/evaluation/store";
import { getDefaultTraceViewWidth } from "@/components/traces/trace-view/utils";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import { Skeleton } from "@/components/ui/skeleton";
import { setTraceViewWidthCookie } from "@/lib/actions/evaluation/cookies";
import { type EvalRow, type Evaluation as EvaluationType, type EvaluationResultsInfo } from "@/lib/evaluation/types";
import { formatTimestamp, swrFetcher } from "@/lib/utils";

import TraceView from "../traces/trace-view";
import Header from "../ui/header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

interface EvaluationProps {
  evaluations: EvaluationType[];
  evaluationId: string;
  evaluationName: string;
  initialTraceViewWidth?: number;
}

function EvaluationContent({ evaluations, evaluationId, evaluationName, initialTraceViewWidth }: EvaluationProps) {
  const { push } = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const params = useParams();
  const targetId = searchParams.get("targetId");
  const search = searchParams.get("search");
  const filter = searchParams.getAll("filter");
  const searchIn = searchParams.getAll("searchIn");
  const sortBy = searchParams.get("sortBy");
  const sortDirection = searchParams.get("sortDirection");

  const [selectedScore, setSelectedScore] = useState<string | undefined>(undefined);
  const [traceId, setTraceId] = useState<string | undefined>(undefined);
  const [datapointId, setDatapointId] = useState<string | undefined>(undefined);

  // Pagination state
  const pageSize = 50;

  // Store
  const rebuildColumns = useEvalStore((s) => s.rebuildColumns);
  const setIsComparison = useEvalStore((s) => s.setIsComparison);
  const columnDefs = useEvalStore((s) => s.columnDefs);
  const buildStatsParams = useEvalStore((s) => s.buildStatsParams);
  const buildFetchParams = useEvalStore((s) => s.buildFetchParams);

  // Statistics URL (fetches all stats at once)
  const statsUrl = useMemo(() => {
    const base = `/api/projects/${params?.projectId}/evaluations/${evaluationId}/stats`;
    const urlParams = buildStatsParams({ search, searchIn, filter, sortBy, sortDirection });
    const qs = urlParams.toString();
    return qs ? `${base}?${qs}` : base;
  }, [params?.projectId, evaluationId, search, searchIn, filter, sortBy, sortDirection, buildStatsParams, columnDefs]);

  const { data: statsData, isLoading: isStatsLoading } = useSWR<{
    evaluation: EvaluationType;
    allStatistics: Record<string, any>;
    allDistributions: Record<string, any>;
    scores: string[];
  }>(statsUrl, swrFetcher);

  // Target statistics URL (if comparing)
  const targetStatsUrl = useMemo(() => {
    if (!targetId) return null;
    const base = `/api/projects/${params?.projectId}/evaluations/${targetId}/stats`;
    const urlParams = buildStatsParams({ search, searchIn, filter, sortBy, sortDirection });
    const qs = urlParams.toString();
    return qs ? `${base}?${qs}` : base;
  }, [params?.projectId, targetId, search, searchIn, filter, sortBy, sortDirection, buildStatsParams, columnDefs]);

  const { data: targetStatsData } = useSWR<{
    evaluation: EvaluationType;
    allStatistics: Record<string, any>;
    allDistributions: Record<string, any>;
    scores: string[];
  }>(targetStatsUrl, swrFetcher);

  const scores = useMemo(() => statsData?.scores ?? [], [statsData?.scores]);

  // Sync comparison state from URL
  useEffect(() => {
    setIsComparison(!!targetId);
  }, [targetId, setIsComparison]);

  const customColumns = useEvalStore((s) => s.customColumns);

  // Rebuild column defs when scores or custom columns change.
  // This must run before useInfiniteScroll's effect (declaration order).
  useEffect(() => {
    rebuildColumns(scores);
  }, [scores, customColumns, rebuildColumns]);

  // SQL strings from column defs — only changes when columns structurally change.
  // useInfiniteScroll uses JSON.stringify on deps, so identical SQL strings
  // produce the same string → no spurious re-fetch.
  const columnSqls = useMemo(
    () => columnDefs.map((c) => c.meta?.sql).filter(Boolean),
    [columnDefs]
  );

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
      const urlParams = buildFetchParams({
        search,
        searchIn,
        filter,
        sortBy,
        sortDirection,
        targetId,
        pageNumber,
        pageSize,
      });

      const url = `/api/projects/${params?.projectId}/evaluations/${evaluationId}?${urlParams.toString()}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch datapoints.");
      }
      const data: EvaluationResultsInfo = await response.json();

      return { items: data.results, count: 0 };
    },
    [
      search,
      searchIn,
      filter,
      params?.projectId,
      evaluationId,
      pageSize,
      sortBy,
      sortDirection,
      targetId,
      buildFetchParams,
    ]
  );

  // Use infinite scroll hook — data is now EvalRow (Record<string, unknown>)
  const {
    data: allDatapoints,
    hasMore: hasMorePages,
    isFetching: isFetchingPage,
    isLoading: isLoadingDatapoints,
    fetchNextPage,
  } = useInfiniteScroll<EvalRow>({
    fetchFn: fetchDatapoints,
    enabled: !isStatsLoading,
    deps: [search, filter, searchIn, evaluationId, sortBy, sortDirection, targetId, columnSqls],
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

  useEffect(() => {
    if (scores?.length > 0) {
      setSelectedScore(scores[0]);
    }
  }, [scores]);

  useEffect(() => {
    const traceId = searchParams.get("traceId");
    const datapointId = searchParams.get("datapointId");
    if (traceId) {
      setTraceId(traceId);
    }
    if (datapointId) {
      setDatapointId(datapointId);
    }
  }, []);

  const [defaultTraceViewWidth, setDefaultTraceViewWidth] = useState(initialTraceViewWidth || 1000);

  const handleResizeStop: ResizeCallback = (_event, _direction, _elementRef, delta) => {
    const newWidth = defaultTraceViewWidth + delta.width;
    setDefaultTraceViewWidth(newWidth);
    setTraceViewWidthCookie(newWidth).catch((e) => console.warn(`Failed to save value to cookies. ${e}`));
  };

  const ref = useRef<Resizable>(null);

  useEffect(() => {
    if (!initialTraceViewWidth) {
      setDefaultTraceViewWidth(getDefaultTraceViewWidth());
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (defaultTraceViewWidth > window.innerWidth - 180) {
        const newWidth = window.innerWidth - 240;
        setDefaultTraceViewWidth(newWidth);
        setTraceViewWidthCookie(newWidth);
        ref?.current?.updateSize({ width: newWidth });
      }
    }
  }, []);

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
                    scores={scores}
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
            scores={scores}
            handleRowClick={handleRowClick}
            getRowHref={getRowHref}
            hasMore={hasMorePages}
            isFetching={isFetchingPage}
            fetchNextPage={fetchNextPage}
          />
        </div>
      </div>
      {traceId && (
        <div className="absolute top-0 right-0 bottom-0 bg-background border-l z-50 flex">
          <Resizable
            ref={ref}
            onResizeStop={handleResizeStop}
            enable={{
              left: true,
            }}
            defaultSize={{
              width: defaultTraceViewWidth,
            }}
          >
            <div className="w-full h-full flex flex-col">
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
              <TraceView key={traceId} onClose={onClose} traceId={traceId} />
            </div>
          </Resizable>
        </div>
      )}
    </>
  );
}

export default function Evaluation(props: EvaluationProps) {
  return (
    <DataTableStateProvider storageKey="evaluation-datapoints-pagination">
      <EvaluationContent {...props} />
    </DataTableStateProvider>
  );
}
