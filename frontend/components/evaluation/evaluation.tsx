"use client";
import { ArrowRight } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Resizable } from "re-resizable";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import Chart from "@/components/evaluation/chart";
import {
  comparedComplementaryColumns,
  complementaryColumns,
  defaultColumns,
  getScoreColumns,
} from "@/components/evaluation/columns";
import CompareChart from "@/components/evaluation/compare-chart";
import ScoreCard from "@/components/evaluation/score-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserContext } from "@/contexts/user-context";
import {
  Evaluation as EvaluationType,
  EvaluationDatapointPreviewWithCompared,
  EvaluationResultsInfo,
} from "@/lib/evaluation/types";
import { formatTimestamp, swrFetcher } from "@/lib/utils";

import TraceView from "../traces/trace-view";
import { Button } from "../ui/button";
import { DataTable } from "../ui/datatable";
import DownloadButton from "../ui/download-button";
import Header from "../ui/header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

interface EvaluationProps {
  evaluations: EvaluationType[];
  evaluationId: string;
  evaluationName: string;
}

export default function Evaluation({ evaluations, evaluationId, evaluationName }: EvaluationProps) {
  const { push } = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const params = useParams();
  const traceId = searchParams.get("traceId");
  const targetId = searchParams.get("targetId");
  const { data, mutate, isLoading } = useSWR<EvaluationResultsInfo>(
    `/api/projects/${params?.projectId}/evaluations/${evaluationId}`,
    swrFetcher
  );

  const { data: targetData } = useSWR<EvaluationResultsInfo>(
    () => (targetId ? `/api/projects/${params?.projectId}/evaluations/${targetId}` : null),
    swrFetcher
  );

  const [selectedScore, setSelectedScore] = useState<string | undefined>(undefined);
  const evaluation = data?.evaluation;

  const onClose = useCallback(() => {
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
      return [...defaultColumns, ...comparedComplementaryColumns, ...getScoreColumns(scores)];
    }
    return [...defaultColumns, ...complementaryColumns];
  }, [scores, targetId]);

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
        };
      });
    }
    return data?.results || [];
  }, [data?.results, targetData?.results, targetId]);

  const handleRowClick = (row: EvaluationDatapointPreviewWithCompared) => {
    const params = new URLSearchParams(searchParams);
    params.set("datapointId", row.id);
    params.set("traceId", row.traceId);
    push(`${pathName}?${params}`);
  };

  const handleChange = (value?: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set("targetId", value);
    } else {
      params.delete("targetId");
    }
    push(`${pathName}?${params}`);
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
  }, [supabase]);

  return (
    <div className="h-full flex flex-col relative">
      <Header path={`evaluations/${evaluationName}`} />
      <div className="flex-none flex space-x-2 h-12 px-4 items-center border-b justify-start">
        <div>
          <Select key={targetId} value={targetId ?? undefined} onValueChange={handleChange}>
            <SelectTrigger
              disabled={evaluations.length <= 1}
              className="flex font-medium w-40 text-secondary-foreground"
            >
              <SelectValue placeholder="Select compared evaluation">
                {evaluations?.find((evaluation) => evaluation.id === targetId)?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {evaluations
                .filter((item) => item.id != evaluationId)
                .map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    <span>
                      {item.name}
                      <span className="text-secondary-foreground text-xs ml-2">{formatTimestamp(item.createdAt)}</span>
                    </span>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-none text-secondary-foreground">
          <ArrowRight size={16} />
        </div>
        <div>
          <Select
            key={evaluationId}
            value={evaluationId}
            onValueChange={(value) => {
              push(`/project/${params?.projectId}/evaluations/${value}?${searchParams}`);
            }}
          >
            <SelectTrigger className="flex font-medium w-40 text-secondary-foreground">
              <SelectValue placeholder="select evaluation" />
            </SelectTrigger>
            <SelectContent>
              {evaluations
                .filter((item) => item.id != targetId)
                .map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    <span>
                      {item.name}
                      <span className="text-secondary-foreground text-xs ml-2">{formatTimestamp(item.createdAt)}</span>
                    </span>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          {targetId && (
            <Button className="h-6" variant={"secondary"} onClick={() => handleChange(undefined)}>
              Reset
            </Button>
          )}
        </div>
        {targetId && (
          <Select value={selectedScore} onValueChange={setSelectedScore}>
            <SelectTrigger className="w-fit font-medium max-w-40 text-secondary-foreground h-7">
              <SelectValue placeholder="select score" />
            </SelectTrigger>
            <SelectContent>
              {scores.map((score) => (
                <SelectItem key={score} value={score}>
                  {score}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {!targetId && (
          <DownloadButton
            uri={`/api/projects/${params?.projectId}/evaluations/${evaluationId}/download`}
            filenameFallback={`evaluation-results-${evaluationId}`}
            supportedFormats={["csv", "json"]}
          />
        )}
      </div>
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
                  <ScoreCard scoreName={selectedScore} />
                </div>
                <div className="flex-grow">
                  {targetId ? (
                    <CompareChart
                      evaluationId={evaluationId}
                      comparedEvaluationId={targetId}
                      scoreName={selectedScore}
                    />
                  ) : (
                    <Chart className="h-full" evaluationId={evaluationId} scores={scores} />
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
            />
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
            <div className="w-full h-full flex">
              <TraceView onClose={onClose} traceId={traceId} />
            </div>
          </Resizable>
        </div>
      )}
    </div>
  );
}
