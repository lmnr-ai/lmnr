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
import FiltersContextProvider from "@/components/ui/datatable-filter/context";
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

export default function Evaluation({
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

  const evaluationUrl = useMemo(() => {
    let url = `/api/projects/${params?.projectId}/evaluations/${evaluationId}`;
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

  const { data, mutate, isLoading } = useSWR<EvaluationResultsInfo>(evaluationUrl, swrFetcher);

  const targetUrl = useMemo(() => {
    if (!targetId) return null;

    let url = `/api/projects/${params?.projectId}/evaluations/${targetId}`;
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

  const { data: targetData } = useSWR<EvaluationResultsInfo>(targetUrl, swrFetcher);

  const evaluation = data?.evaluation;

  const onClose = useCallback(() => {
    setTraceId(undefined);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("traceId");
    params.delete("spanId");
    push(`${pathName}?${params}`);
  }, [searchParams, pathName, push]);

  const scores = useMemo(
    () => [...new Set(data?.results.flatMap((row) => Object.keys(row.scores ?? {})) || [])],
    [data?.results]
  );

  const tableData = useMemo(() => {
    if (targetId) {
      return data?.results?.map((original, index) => {
        const compared = targetData?.results[index];

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
    return data?.results || undefined;
  }, [data?.results, targetData?.results, targetId]);

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
          // for v0 we just re-fetch the whole evaluation.
          // TODO: fix the insert logic so the state is not out of sync.
          await mutate();
        }
      )
      .subscribe();
  }, [evaluation, filter.length, mutate, supabase]);

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
      <div className="h-full flex flex-col relative">
        <Header path={`evaluations/${data?.evaluation?.name || evaluationName}`} />
        <EvaluationHeader name={data?.evaluation?.name} urlKey={evaluationUrl} evaluations={evaluations} />
        <div className="flex flex-grow flex-col">
          <div className="flex flex-col flex-grow">
            <div className="flex flex-row space-x-4 p-4">
              {isLoading ? (
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
                      statistics={selectedScore ? (data?.allStatistics?.[selectedScore] ?? null) : null}
                      comparedStatistics={selectedScore ? (targetData?.allStatistics?.[selectedScore] ?? null) : null}
                      isLoading={isLoading}
                    />
                  </div>
                  <div className="flex-grow">
                    {targetId ? (
                      <CompareChart
                        distribution={selectedScore ? (data?.allDistributions?.[selectedScore] ?? null) : null}
                        comparedDistribution={
                          selectedScore ? (targetData?.allDistributions?.[selectedScore] ?? null) : null
                        }
                        isLoading={isLoading}
                      />
                    ) : (
                      <Chart
                        scoreName={selectedScore}
                        distribution={selectedScore ? (data?.allDistributions?.[selectedScore] ?? null) : null}
                        isLoading={isLoading}
                      />
                    )}
                  </div>
                </>
              )}
            </div>
            <EvaluationDatapointsTable
              datapointId={datapointId}
              data={tableData}
              scores={scores}
              handleRowClick={handleRowClick}
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
                              {data?.evaluation.name}
                              <span className="text-secondary-foreground text-xs ml-2">
                                {formatTimestamp(String(data?.evaluation.createdAt))}
                              </span>
                            </span>
                          </SelectItem>
                        )}
                        {selectedRow?.comparedTraceId && (
                          <SelectItem value={selectedRow?.comparedTraceId}>
                            <span>
                              {targetData?.evaluation.name}
                              <span className="text-secondary-foreground text-xs ml-2">
                                {formatTimestamp(String(targetData?.evaluation.createdAt))}
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
      </div>
    </TraceViewNavigationProvider>
  );
}
