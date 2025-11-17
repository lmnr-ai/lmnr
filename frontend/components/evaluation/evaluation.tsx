"use client";
import { Row } from "@tanstack/react-table";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Resizable, ResizeCallback } from "re-resizable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import Chart from "@/components/evaluation/chart";
import CompareChart from "@/components/evaluation/compare-chart";
import EvaluationDatapointsTable from "@/components/evaluation/evaluation-datapoints-table";
import EvaluationHeader from "@/components/evaluation/evaluation-header";
import ScoreCard from "@/components/evaluation/score-card";
import TraceViewNavigationProvider, {
  getTraceWithDatapointConfig,
} from "@/components/traces/trace-view/navigation-context";
import { getDefaultTraceViewWidth } from "@/components/traces/trace-view/utils";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import FiltersContextProvider from "@/components/ui/infinite-datatable/ui/datatable-filter/context";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserContext } from "@/contexts/user-context";
import { setTraceViewWidthCookie } from "@/lib/actions/evaluation/cookies";
import {
  Evaluation as EvaluationType,
  EvaluationDatapointPreviewWithCompared,
  EvaluationResultsInfo,
} from "@/lib/evaluation/types";
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

function EvaluationContent({
  evaluations,
  evaluationId,
  evaluationName,
  initialTraceViewWidth,
}: EvaluationProps) {
  const { push } = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const params = useParams();
  const targetId = searchParams.get("targetId");
  const search = searchParams.get("search");
  const filter = searchParams.getAll("filter");
  const searchIn = searchParams.getAll("searchIn");

  const [selectedScore, setSelectedScore] = useState<string | undefined>(undefined);
  const [traceId, setTraceId] = useState<string | undefined>(undefined);
  const [datapointId, setDatapointId] = useState<string | undefined>(undefined);

  // Pagination state
  const pageSize = 50;

  // Statistics URL (fetches all stats at once)
  const statsUrl = useMemo(() => {
    let url = `/api/projects/${params?.projectId}/evaluations/${evaluationId}/stats`;
    const urlParams = new URLSearchParams();

    if (search) {
      urlParams.set("search", search);
    }

    searchIn.forEach((value) => {
      urlParams.append("searchIn", value);
    });

    filter.forEach((f) => urlParams.append("filter", f));

    if (urlParams.toString()) {
      url += `?${urlParams.toString()}`;
    }

    return url;
  }, [params?.projectId, evaluationId, search, searchIn, filter]);

  const { data: statsData, isLoading: isStatsLoading } = useSWR<{
    evaluation: EvaluationType;
    allStatistics: Record<string, any>;
    allDistributions: Record<string, any>;
    scores: string[];
  }>(statsUrl, swrFetcher);

  // Target statistics URL (if comparing)
  const targetStatsUrl = useMemo(() => {
    if (!targetId) return null;

    let url = `/api/projects/${params?.projectId}/evaluations/${targetId}/stats`;
    const urlParams = new URLSearchParams();

    if (search) {
      urlParams.set("search", search);
    }

    searchIn.forEach((value) => {
      urlParams.append("searchIn", value);
    });

    filter.forEach((f) => urlParams.append("filter", f));

    if (urlParams.toString()) {
      url += `?${urlParams.toString()}`;
    }

    return url;
  }, [params?.projectId, targetId, search, searchIn, filter]);

  const { data: targetStatsData, isLoading: isTargetStatsLoading } = useSWR<{
    evaluation: EvaluationType;
    allStatistics: Record<string, any>;
    allDistributions: Record<string, any>;
    scores: string[];
  }>(targetStatsUrl, swrFetcher);

  const evaluation = statsData?.evaluation;
  const scores = statsData?.scores || [];

  const onClose = useCallback(() => {
    setTraceId(undefined);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("traceId");
    params.delete("spanId");
    push(`${pathName}?${params}`);
  }, [searchParams, pathName, push]);

  // Fetch function for main evaluation datapoints
  const fetchDatapoints = useCallback(
    async (pageNumber: number) => {
      const urlParams = new URLSearchParams();
      urlParams.set("pageNumber", pageNumber.toString());
      urlParams.set("pageSize", pageSize.toString());

      if (search) {
        urlParams.set("search", search);
      }

      searchIn.forEach((value) => {
        urlParams.append("searchIn", value);
      });

      filter.forEach((f) => urlParams.append("filter", f));

      const url = `/api/projects/${params?.projectId}/evaluations/${evaluationId}?${urlParams.toString()}`;
      const response = await fetch(url);
      const data: EvaluationResultsInfo = await response.json();

      return { items: data.results, count: 0 };
    },
    [search, searchIn, filter, params?.projectId, evaluationId, pageSize]
  );

  // Fetch function for target evaluation datapoints (comparison mode)
  const fetchTargetDatapoints = useCallback(
    async (pageNumber: number) => {
      if (!targetId) return { items: [], count: 0 };

      const urlParams = new URLSearchParams();
      urlParams.set("pageNumber", pageNumber.toString());
      urlParams.set("pageSize", pageSize.toString());

      if (search) {
        urlParams.set("search", search);
      }

      searchIn.forEach((value) => {
        urlParams.append("searchIn", value);
      });

      filter.forEach((f) => urlParams.append("filter", f));

      const url = `/api/projects/${params?.projectId}/evaluations/${targetId}?${urlParams.toString()}`;
      const response = await fetch(url);
      const data: EvaluationResultsInfo = await response.json();

      return { items: data.results, count: 0 };
    },
    [targetId, search, searchIn, filter, params?.projectId, pageSize]
  );

  // Use infinite scroll hook for main datapoints
  const {
    data: allDatapoints,
    hasMore: hasMorePages,
    isFetching: isFetchingPage,
    isLoading: isLoadingDatapoints,
    fetchNextPage,
  } = useInfiniteScroll<EvaluationDatapointPreviewWithCompared>({
    fetchFn: fetchDatapoints,
    enabled: true,
    deps: [search, filter, searchIn, evaluationId],
  });

  // Manually manage target datapoints to avoid store conflicts
  const [targetDatapoints, setTargetDatapoints] = useState<EvaluationDatapointPreviewWithCompared[]>([]);
  const [isFetchingTarget, setIsFetchingTarget] = useState(false);
  const targetPagesFetchedRef = useRef(0);

  // Reset target data when targetId or filters change
  useEffect(() => {
    setTargetDatapoints([]);
    targetPagesFetchedRef.current = 0;
  }, [targetId, search, filter.join(","), searchIn.join(",")]);

  // Fetch target pages to match main datapoints length
  useEffect(() => {
    if (!targetId || isFetchingTarget) return;

    const pagesNeeded = Math.ceil(allDatapoints.length / pageSize);
    const pagesFetched = targetPagesFetchedRef.current;

    if (pagesFetched < pagesNeeded) {
      setIsFetchingTarget(true);

      const fetchTargetPages = async () => {
        try {
          const pagesToFetch = [];
          for (let page = pagesFetched; page < pagesNeeded; page++) {
            pagesToFetch.push(fetchTargetDatapoints(page));
          }

          const results = await Promise.all(pagesToFetch);
          const allItems = results.flatMap(r => r.items);

          setTargetDatapoints(prev => {
            // Only append new items beyond what we already have
            const existingCount = prev.length;
            const offset = Math.max(0, existingCount - pagesFetched * pageSize);
            const newItems = allItems.slice(offset);
            return [...prev, ...newItems];
          });

          targetPagesFetchedRef.current = pagesNeeded;
        } catch (error) {
          console.error("Error fetching target pages:", error);
        } finally {
          setIsFetchingTarget(false);
        }
      };

      fetchTargetPages();
    }
  }, [targetId, allDatapoints.length, isFetchingTarget, fetchTargetDatapoints, pageSize]);

  const tableData = useMemo(() => {
    if (targetId) {
      return allDatapoints.map((original, index) => {
        const compared = targetDatapoints[index];

        return {
          ...original,
          comparedStartTime: compared?.startTime,
          comparedEndTime: compared?.endTime,
          comparedInputCost: compared?.inputCost,
          comparedOutputCost: compared?.outputCost,
          comparedId: compared?.id,
          comparedEvaluationId: compared?.evaluationId,
          comparedScores: compared?.scores,
          comparedTraceId: compared?.traceId,
        };
      });
    }
    return allDatapoints;
  }, [allDatapoints, targetDatapoints, targetId]);

  const selectedRow = useMemo<undefined | EvaluationDatapointPreviewWithCompared>(
    () => tableData?.find((row) => row.id === searchParams.get("datapointId")),
    [searchParams, tableData]
  );

  const handleRowClick = (row: Row<EvaluationDatapointPreviewWithCompared>) => {
    const original = row.original;
    setTraceId(original.traceId);
    setDatapointId(original.id);
    const params = new URLSearchParams(searchParams);
    params.set("traceId", original.traceId);
    params.set("datapointId", original.id);
    push(`${pathName}?${params.toString()}`);
  };

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

  const { supabaseClient: supabase } = useUserContext();

  useEffect(() => {
    if (!supabase || !evaluation) {
      return;
    }

    if (filter.length > 0) {
      supabase.removeAllChannels();
    }

    supabase.channel("table-db-changes").unsubscribe();

    supabase
      .channel("table-db-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "evaluation_results",
          filter: `evaluation_id=eq.${evaluation.id}`,
        },
        async (_) => {
          // Note: Refetching on insert - could be improved with optimistic updates
          window.location.reload();
        }
      )
      .subscribe();
  }, [evaluation, filter.length, supabase]);

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
    <TraceViewNavigationProvider<{ datapointId: string; traceId: string }>
      config={getTraceWithDatapointConfig()}
      onNavigate={(item) => {
        setTraceId(item?.traceId);
        setDatapointId(item?.datapointId);
      }}
    >
      <Header path={`evaluations/${statsData?.evaluation?.name || evaluationName}`} />
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
                    comparedStatistics={selectedScore ? (targetStatsData?.allStatistics?.[selectedScore] ?? null) : null}
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
            isLoading={isLoadingDatapoints}
            datapointId={datapointId}
            data={tableData}
            scores={scores}
            handleRowClick={handleRowClick}
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
                      {selectedRow?.traceId && (
                        <SelectItem value={selectedRow.traceId}>
                          <span>
                            {statsData?.evaluation.name}
                            <span className="text-secondary-foreground text-xs ml-2">
                              {formatTimestamp(String(statsData?.evaluation.createdAt))}
                            </span>
                          </span>
                        </SelectItem>
                      )}
                      {selectedRow?.comparedTraceId && (
                        <SelectItem value={selectedRow?.comparedTraceId}>
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
              <FiltersContextProvider>
                <TraceView key={traceId} onClose={onClose} traceId={traceId} />
              </FiltersContextProvider>
            </div>
          </Resizable>
        </div>
      )}
    </TraceViewNavigationProvider>
  );
}

export default function Evaluation(props: EvaluationProps) {
  return (
    <DataTableStateProvider storageKey="evaluation-datapoints-pagination">
      <EvaluationContent {...props} />
    </DataTableStateProvider>
  );
}
