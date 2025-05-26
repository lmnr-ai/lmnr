"use client";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Resizable } from "re-resizable";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import Chart from "@/components/evaluation/chart";
import {
  comparedComplementaryColumns,
  complementaryColumns,
  defaultColumns,
  getComparedScoreColumns,
  getScoreColumns,
} from "@/components/evaluation/columns";
import CompareChart from "@/components/evaluation/compare-chart";
import EvaluationHeader from "@/components/evaluation/evaluation-header";
import ScoreCard from "@/components/evaluation/score-card";
import SearchEvaluationInput from "@/components/evaluation/search-evaluation-input";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserContext } from "@/contexts/user-context";
import {
  Evaluation as EvaluationType,
  EvaluationDatapointPreviewWithCompared,
  EvaluationResultsInfo,
} from "@/lib/evaluation/types";
import { formatTimestamp, swrFetcher } from "@/lib/utils";

import TraceView from "../traces/trace-view";
import { DataTable } from "../ui/datatable";
import DataTableFilter, { ColumnFilter, DataTableFilterList } from "../ui/datatable-filter";
import Header from "../ui/header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

interface EvaluationProps {
  evaluations: EvaluationType[];
  evaluationId: string;
  evaluationName: string;
}

const filters: ColumnFilter[] = [
  { key: "id", name: "ID", dataType: "string" },
  { key: "index", name: "Index", dataType: "number" },
  { key: "traceId", name: "Trace ID", dataType: "string" },
  { key: "startTime", name: "Start Time", dataType: "string" },
  { key: "duration", name: "Duration", dataType: "number" },
  { key: "cost", name: "Cost", dataType: "number" },
];

export default function Evaluation({ evaluations, evaluationId, evaluationName }: EvaluationProps) {
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
    console.log(url);
    return url;
  }, [params?.projectId, evaluationId, search, JSON.stringify(searchIn), JSON.stringify(filter)]);

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
  }, [params?.projectId, targetId, search, JSON.stringify(searchIn), JSON.stringify(filter)]);

  const { data: targetData } = useSWR<EvaluationResultsInfo>(targetUrl, swrFetcher);

  const evaluation = data?.evaluation;

  const onClose = useCallback(() => {
    setTraceId(undefined);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("datapointId");
    params.delete("traceId");
    params.delete("spanId");
    push(`${pathName}?${params}`);
  }, [searchParams, pathName, push]);

  const scores = useMemo(
    () => [...new Set(data?.results.flatMap((row) => Object.keys(row.scores ?? {})) || [])],
    [data?.results]
  );

  const columns = useMemo(() => {
    if (targetId) {
      return [...defaultColumns, ...comparedComplementaryColumns, ...getComparedScoreColumns(scores)];
    }
    return [...defaultColumns, ...complementaryColumns, ...getScoreColumns(scores)];
  }, [scores, targetId]);

  const columnFilters = useMemo<ColumnFilter[]>(
    () => [...filters, ...scores.map((score) => ({ key: `score:${score}`, name: score, dataType: "number" as const }))],
    [scores]
  );

  const tableData = useMemo(() => {
    if (targetId) {
      return (data?.results || []).map((original, index) => {
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

  const handleRowClick = (row: EvaluationDatapointPreviewWithCompared) => {
    setTraceId(row.traceId);
    const params = new URLSearchParams(searchParams);
    params.set("datapointId", row.id);
    params.set("traceId", row.traceId);
    push(`${pathName}?${params}`);
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
    if (traceId) {
      setTraceId(traceId);
    }
  }, []);

  return (
    <div className="h-full flex flex-col relative">
      <Header path={`evaluations/${data?.evaluation?.name || evaluationName}`} />
      <EvaluationHeader name={data?.evaluation?.name} urlKey={evaluationUrl} evaluations={evaluations} />
      <div className="flex flex-grow flex-col">
        <div className="flex flex-col flex-grow">
          <div className="flex flex-row space-x-4 p-4">
            {isLoading || !selectedScore ? (
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
                    statistics={selectedScore ? data?.allStatistics?.[selectedScore] ?? null : null}
                    comparedStatistics={selectedScore ? targetData?.allStatistics?.[selectedScore] ?? null : null}
                    isLoading={isLoading}
                  />
                </div>
                <div className="flex-grow">
                  {targetId ? (
                    <CompareChart
                      evaluationId={evaluationId}
                      comparedEvaluationId={targetId}
                      scoreName={selectedScore}
                      distribution={selectedScore ?
                        data?.allDistributions?.[selectedScore] ?? null : null}
                      comparedDistribution={selectedScore ?
                        targetData?.allDistributions?.[selectedScore] ?? null : null}
                      isLoading={isLoading}
                    />
                  ) : (
                    <Chart
                      className="h-full"
                      evaluationId={evaluationId}
                      scoreName={selectedScore}
                      distribution={selectedScore ?
                        data?.allDistributions?.[selectedScore] ?? null : null}
                      isLoading={isLoading}
                    />
                  )}
                </div>
              </>
            )}
          </div>

          <div className="flex-grow">
            <DataTable
              columns={columns}
              data={tableData}
              getRowId={(row) => row.id}
              focusedRowId={searchParams?.get("datapointId")}
              paginated
              onRowClick={(row) => handleRowClick(row.original)}
              childrenClassName="flex flex-col gap-2 py-2 items-start h-fit space-x-0"
            >
              <div className="flex flex-1 w-full space-x-2">
                <DataTableFilter columns={columnFilters} />
                <SearchEvaluationInput />
              </div>
              <DataTableFilterList />
            </DataTable>
          </div>
        </div>
      </div>
      {traceId && (
        <div className="absolute top-0 right-0 bottom-0 bg-background border-l z-50 flex">
          <Resizable
            enable={{
              left: true,
            }}
            defaultSize={{
              width: 1000,
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
              <TraceView onClose={onClose} traceId={traceId} />
            </div>
          </Resizable>
        </div>
      )}
    </div>
  );
}
