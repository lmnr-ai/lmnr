'use client';

import { Evaluation as EvaluationType, EvaluationDatapointPreview, EvaluationDatapointPreviewWithCompared, EvaluationResultsInfo } from "@/lib/evaluation/types";
import { ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { DataTable } from "../ui/datatable";
import { useUserContext } from "@/contexts/user-context";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, USE_REALTIME } from "@/lib/const";
import EvaluationStats from "./evaluation-stats";
import { useProjectContext } from "@/contexts/project-context";
import Header from "../ui/header";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { mergeOriginalWithComparedDatapoints } from "@/lib/evaluation/utils";
import { ArrowRight } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import ClientTimestampFormatter from "../client-timestamp-formatter";
import { Resizable } from "re-resizable";
import TraceView from "../traces/trace-view";

const URL_QUERY_PARAMS = {
  COMPARE_EVAL_ID: 'comparedEvaluationId',
}

interface EvaluationProps {
  evaluationInfo: EvaluationResultsInfo;
  comparedEvaluationInfo?: EvaluationResultsInfo;
  evaluations: EvaluationType[];
}

export default function Evaluation({
  evaluationInfo,
  comparedEvaluationInfo,
  evaluations,
}: EvaluationProps) {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = new URLSearchParams(useSearchParams().toString());

  const { projectId } = useProjectContext();

  const [evaluation, setEvaluation] = useState(evaluationInfo.evaluation);
  const [comparedEvaluation, setComparedEvaluation] = useState(comparedEvaluationInfo?.evaluation);

  let defaultResults = evaluationInfo.results as EvaluationDatapointPreviewWithCompared[];

  let scoreColumns = new Set<string>();
  for (const row of evaluationInfo.results) {
    for (const key of Object.keys(row.scores ?? {})) {
      scoreColumns.add(key);
    }
  }
  if (comparedEvaluationInfo) {
    defaultResults = mergeOriginalWithComparedDatapoints(evaluationInfo.results, comparedEvaluationInfo.results);
    for (const row of comparedEvaluationInfo?.results ?? []) {
      for (const key of Object.keys(row.scores ?? {})) {
        scoreColumns.add(key);
      }
    }
  }

  const [results, setResults] = useState(defaultResults);
  const [selectedDatapoint, setSelectedDatapoint] = useState<EvaluationDatapointPreviewWithCompared | null>(defaultResults.find((result) => result.id === searchParams.get('datapointId')) ?? null);

  let columns: ColumnDef<EvaluationDatapointPreviewWithCompared>[] = []


  if (comparedEvaluation) {
    columns = [
      {
        accessorKey: "status",
        header: "Status",
      },
      {
        accessorFn: (row) => JSON.stringify(row.data),
        header: "Data",
      },
      {
        accessorFn: (row) => row.target ? JSON.stringify(row.target) : "-",
        header: "Target",
      },
    ];
    columns = columns.concat(Array.from(scoreColumns).map((scoreColumn) => ({
      header: scoreColumn,
      cell: (row) => {
        return <div className="flex flex-row items-center space-x-2">
          <div className="text-secondary-foreground">{row.row.original.comparedScores?.[scoreColumn] ?? "-"}</div>
          <ArrowRight className="font-bold" size={12} />
          <div className={comparedEvaluation && "text-blue-300"}>{row.row.original.scores?.[scoreColumn] ?? "-"}</div>
        </div>
      },
    })));

  } else {
    columns = [
      {
        accessorKey: "status",
        header: "Status",
      },
      {
        accessorFn: (row) => JSON.stringify(row.data),
        header: "Data",
      },
      {
        accessorFn: (row) => row.target ? JSON.stringify(row.target) : "-",
        header: "Target",
      },
      {
        accessorFn: (row) => row.executorOutput ? JSON.stringify(row.executorOutput) : "-",
        header: "Output",
      },
    ];
    columns = columns.concat(Array.from(scoreColumns).map((scoreColumn) => ({
      header: scoreColumn,
      accessorFn: (row) => row.scores?.[scoreColumn] ?? "-",
      size: 150,
    })));
  }

  const { supabaseAccessToken } = useUserContext()
  const supabase = useMemo(() => {
    return USE_REALTIME 
    ? createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${supabaseAccessToken}`,
          },
        },
      }
    )
    : null
  }, [])

  supabase?.realtime.setAuth(supabaseAccessToken)

  useEffect(() => {
    if (evaluation.status !== 'Finished') {
      supabase
        ?.channel('table-db-changes')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'evaluation_results',
            filter: `evaluation_id=eq.${evaluation.id}`
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              const camelCasePayload = Object.keys(payload.new).reduce((acc: Record<string, any>, key) => {
                const camelCaseKey = key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
                acc[camelCaseKey] = payload.new[key];
                return acc;
              }, {});

              // mutate(key => key === `/api/projects/${projectId}/evaluations/${evaluation.id}/stats`);
              setResults((prev) => [...prev, camelCasePayload as EvaluationDatapointPreview]);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'evaluations',
            filter: `id=eq.${evaluation.id}`
          },
          (payload) => {
            if (payload.eventType === 'UPDATE') {
              setEvaluation((prev) => ({ ...prev, status: payload.new.status }));
            }
          }
        )
        .subscribe()
    }

    // remove all channels on unmount
    return () => {
      supabase?.removeAllChannels()
    }
  }, [])

  const handleRowClick = (row: EvaluationDatapointPreviewWithCompared) => {
    setSelectedDatapoint(row);
    searchParams.set('datapointId', row.id);
    router.push(`${pathName}?${searchParams.toString()}`);
  }

  const handleComparedEvaluationChange = (comparedEvaluationId: string) => {
    fetch(`/api/projects/${projectId}/evaluations/${comparedEvaluationId}`)
      .then(res => res.json())
      .then((comparedEvaluation) => {
        setComparedEvaluation(comparedEvaluation.evaluation);
        // evaluationInfo.results are always fixed, but the compared results (comparedEvaluation.results) change
        setResults(mergeOriginalWithComparedDatapoints(evaluationInfo.results, comparedEvaluation.results));
      })

    searchParams.set(URL_QUERY_PARAMS.COMPARE_EVAL_ID, comparedEvaluationId);
    router.push(`${pathName}?${searchParams.toString()}`);
  }

  return (
    <div className="h-full flex flex-col">
      <Header path={`evaluations/${evaluation.name}`} />
      <div className="flex flex-grow">
        <div className="flex flex-col flex-grow">
          <div className="flex-none flex space-x-2 h-12 px-4 items-center border-b justify-start">
            <div>
              <Select
                key={comparedEvaluation ? comparedEvaluation.id : Date.now()}
                value={comparedEvaluation ? comparedEvaluation.id : undefined}
                onValueChange={handleComparedEvaluationChange}
                disabled={evaluation.status !== 'Finished'}
              >
                <SelectTrigger className="flex flex-none font-medium max-w-40 text-secondary-foreground h-7">
                  <SelectValue placeholder="select evaluation" />
                </SelectTrigger>
                <SelectContent>
                  {evaluations.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-none text-secondary-foreground"><ArrowRight size={16} /></div>
            <h3 className={cn("text-sm px-3 border rounded-md h-7 items-center flex font-medium", comparedEvaluation && "text-ring")}>
              {evaluation.name}
            </h3>
            <div>
              {!!comparedEvaluation && (
                <Button
                  className="h-6"
                  variant={'secondary'}
                  onClick={() => {
                    setComparedEvaluation(undefined);
                    setResults(evaluationInfo.results);
                    searchParams.delete(URL_QUERY_PARAMS.COMPARE_EVAL_ID);
                    router.push(`${pathName}?${searchParams.toString()}`);
                  }}
                >
                  Reset
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-grow h-full">
            <div className="flex-grow relative">
              <DataTable
                className="border-none absolute top-0 left-0 right-0 bottom-0"
                columns={columns}
                data={results}
                getRowId={(row) => row.id}
                focusedRowId={selectedDatapoint?.id}
                paginated
                onRowClick={(row) => handleRowClick(row.original)}
              />
            </div>
            <div className="flex-none h-full flex">
              {!selectedDatapoint &&
                <EvaluationStats evaluationId={evaluation.id} comparedEvaluationId={comparedEvaluation?.id} />
              }
            </div>
          </div>
        </div>
      </div>

      {selectedDatapoint &&
        <div className='absolute top-0 right-0 bottom-0 bg-background border-l z-50 flex'>
          <Resizable
            enable={
              {
                top: false,
                right: false,
                bottom: false,
                left: true,
                topRight: false,
                bottomRight: false,
                bottomLeft: false,
                topLeft: false
              }
            }
            defaultSize={{
              width: 1000,
            }}
          >
            <div className='w-full h-full flex'>
              <TraceView
                onClose={() => {
                  searchParams.delete('datapointId');
                  searchParams.delete('spanId');
                  setSelectedDatapoint(null);
                  router.push(`${pathName}?${searchParams.toString()}`);
                }}
                traceId={selectedDatapoint?.traceId}
              />
            </div>
          </Resizable>
        </div>
      }
    </div>
  );
}
