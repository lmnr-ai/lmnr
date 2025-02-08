"use client";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowRight } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Resizable } from "re-resizable";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import Chart from "@/components/evaluation/chart";
import CompareChart from "@/components/evaluation/compare-chart";
import DatatableSorts from "@/components/ui/datatable-sorts";
import { useUserContext } from "@/contexts/user-context";
import {
  Evaluation as EvaluationType,
  EvaluationDatapointPreviewWithCompared,
  EvaluationResultsInfo,
} from "@/lib/evaluation/types";
import { getDurationString } from "@/lib/flow/utils";
import { swrFetcher } from "@/lib/utils";

import TraceView from "../traces/trace-view";
import { Button } from "../ui/button";
import { DataTable } from "../ui/datatable";
import DownloadButton from "../ui/download-button";
import Header from "../ui/header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import ScoreCard from "./score-card";

interface EvaluationProps {
  evaluations: EvaluationType[];
  evaluationId: string;
  evaluationName: string;
}

const defaultColumns: ColumnDef<EvaluationDatapointPreviewWithCompared>[] = [
  {
    accessorFn: (row) => row.index,
    header: "Index",
  },
  {
    accessorFn: (row) => JSON.stringify(row.data),
    header: "Data",
  },
  {
    accessorFn: (row) => (row.target ? JSON.stringify(row.target) : "-"),
    header: "Target",
  },
];

const complementaryColumns: ColumnDef<EvaluationDatapointPreviewWithCompared>[] = [
  {
    accessorFn: (row) => (row.executorOutput ? JSON.stringify(row.executorOutput) : "-"),
    header: "Output",
  },
  {
    accessorFn: (row) => getDurationString(row.startTime, row.endTime),
    header: "Duration",
  },
  {
    accessorFn: (row) =>
      new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumSignificantDigits: 5 }).format(
        row.inputCost + row.outputCost
      ),
    header: "Cost",
  },
];

const getScoreColumns = (scores: string[]): ColumnDef<EvaluationDatapointPreviewWithCompared>[] =>
  scores.map((name) => ({
    header: name,
    cell: (row) => (
      <div className="flex flex-row items-center space-x-2">
        <div className="text-green-300">{row.row.original.comparedScores?.[name] ?? "-"}</div>
        <ArrowRight className="font-bold" size={12} />
        <div className="text-blue-300">{row.row.original.scores?.[name] ?? "-"}</div>
      </div>
    ),
  }));

export default function Evaluation({ evaluations, evaluationId, evaluationName }: EvaluationProps) {
  const { push } = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const params = useParams();
  const datapointId = searchParams.get("datapointId");
  const targetId = searchParams.get("targetId");
  const { data, mutate, isLoading } = useSWR<EvaluationResultsInfo>(
    `/api/projects/${params?.projectId}/evaluations/${evaluationId}?${new URLSearchParams(searchParams.getAll("sort").map((param) => ["sort", param]))}`,
    swrFetcher
  );

  const { data: targetData } = useSWR<EvaluationResultsInfo>(
    () =>
      targetId
        ? `/api/projects/${params?.projectId}/evaluations/${targetId}?${new URLSearchParams(searchParams.getAll("sort").map((param) => ["sort", param]))}`
        : null,
    swrFetcher
  );

  const [selectedScore, setSelectedScore] = useState<string | undefined>(undefined);
  const evaluation = data?.evaluation;

  const onClose = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("datapointId");
    params.delete("spanId");
    push(`${pathName}?${params}`);
  }, [searchParams, pathName, push]);

  const scores = useMemo(
    () => [...new Set(data?.results.flatMap((row) => Object.keys(row.scores ?? {})) || [])],
    [data?.results]
  );

  const columns = useMemo(() => {
    if (targetId) {
      return [...defaultColumns, ...getScoreColumns(scores)];
    }
    return [...defaultColumns, ...complementaryColumns];
  }, [scores, targetId]);

  const tableData = useMemo(() => {
    if (targetId) {
      return (data?.results || []).map((original, index) => {
        const compared = targetData?.results[index];

        return {
          ...original,
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
              <SelectValue placeholder="Select compared evaluation" />
            </SelectTrigger>
            <SelectContent>
              {evaluations
                .filter((item) => item.id != evaluationId)
                .map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
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
                    {item.name}
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
          {selectedScore && !isLoading && (
            <div className="flex flex-row space-x-4 p-4 mr-4">
              <div className="flex-none w-72">
                <ScoreCard scoreName={selectedScore} />
              </div>
              <div className="flex-grow">
                {targetId ? (
                  <CompareChart evaluationId={evaluationId} comparedEvaluationId={targetId} scoreName={selectedScore} />
                ) : (
                  <Chart evaluationId={evaluationId} scores={scores} />
                )}
              </div>
            </div>
          )}
          <div className="flex-grow">
            <DataTable
              columns={columns}
              data={tableData}
              getRowId={(row) => row.id}
              focusedRowId={searchParams?.get("datapointId")}
              paginated
              onRowClick={(row) => handleRowClick(row.original)}
            >
              <DatatableSorts columns={["index"]} />
            </DataTable>
          </div>
        </div>
      </div>
      {datapointId && (
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
              <TraceView onClose={onClose} traceId={datapointId} />
            </div>
          </Resizable>
        </div>
      )}
    </div>
  );
}
