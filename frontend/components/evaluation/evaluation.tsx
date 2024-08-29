'use client';

import { EvaluationDatapointPreview, EvaluationDatapointPreviewWithCompared, EvaluationResultsInfo, EvaluationWithPipelineInfo } from "@/lib/evaluation/types";
import { ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { DataTable } from "../ui/datatable";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../ui/resizable";
import { useUserContext } from "@/contexts/user-context";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/const";
import EvaluationPanel from "./evaluation-panel";
import EvaluationStats from "./evaluation-stats";
import { mutate } from "swr";
import { useProjectContext } from "@/contexts/project-context";
import Header from "../ui/header";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { mergeOriginalWithComparedDatapoints } from "@/lib/evaluation/utils";
import { ArrowRight, MoveHorizontal, X } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";

const URL_QUERY_PARAMS = {
  COMPARE_EVAL_ID: 'comparedEvaluationId',
}

interface EvaluationProps {
  evaluationInfo: EvaluationResultsInfo;
  comparedEvaluationInfo?: EvaluationResultsInfo;
  evaluations: EvaluationWithPipelineInfo[];
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

  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [selectedDatapoint, setSelectedDatapoint] = useState<EvaluationDatapointPreviewWithCompared | null>(null);

  const [evaluation, setEvaluation] = useState(evaluationInfo.evaluation);
  const [comparedEvaluation, setComparedEvaluation] = useState(comparedEvaluationInfo?.evaluation);

  let defaultResults = evaluationInfo.results as EvaluationDatapointPreviewWithCompared[];
  if (comparedEvaluationInfo) {
    defaultResults = mergeOriginalWithComparedDatapoints(evaluationInfo.results, comparedEvaluationInfo.results);
  }
  const [results, setResults] = useState(defaultResults);

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
      {
        header: "Score",
        cell: (row) => {
          return <div className="flex flex-row items-center space-x-2">
            <div className="text-secondary-foreground">{row.row.original.comparedScore ?? "-"}</div>
            <ArrowRight className="font-bold" size={12} />
            <div className={comparedEvaluation && "text-blue-300"}>{row.row.original.score ?? "-"}</div>
          </div>
        }
      },
    ];
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
      {
        accessorKey: "score",
        header: "Score",
      },
    ];
  }

  const { supabaseAccessToken } = useUserContext()
  const supabase = useMemo(() => createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${supabaseAccessToken}`,
        },
      },
    }
  ), [])

  supabase.realtime.setAuth(supabaseAccessToken)

  useEffect(() => {
    if (evaluation.status !== 'Finished') {
      supabase
        .channel('table-db-changes')
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

              mutate(key => key === `/api/projects/${projectId}/evaluations/${evaluation.id}/stats`);
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
      supabase.removeAllChannels()
    }
  }, [])

  const handleRowClick = (row: EvaluationDatapointPreviewWithCompared) => {
    setIsSidePanelOpen(true);
    setSelectedDatapoint(row);
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
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel className="flex">

          <div className="flex w-full flex-grow">
            <div className="flex flex-col w-full flex-grow">
              <div className="flex-none flex space-x-2 h-14 px-4 items-center border-b justify-start">
                <div>
                  <Select
                    key={comparedEvaluation ? comparedEvaluation.id : Date.now()}
                    value={comparedEvaluation ? comparedEvaluation.id : undefined}
                    onValueChange={handleComparedEvaluationChange}
                    disabled={evaluation.status !== 'Finished'}
                  >
                    <SelectTrigger className="flex flex-none font-medium max-w-40 text-secondary-foreground">
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
                <h3 className={cn("text-sm px-3 border rounded-md h-[36px] items-center flex font-medium", comparedEvaluation && "text-ring")}>
                  {evaluation.name}
                </h3>
                <div>
                  {!!comparedEvaluation && (
                    <Button
                      className="h-6"
                      variant={'secondary'}
                      onClick={() => {
                        setComparedEvaluation(undefined);
                        searchParams.delete(URL_QUERY_PARAMS.COMPARE_EVAL_ID);
                        router.push(`${pathName}?${searchParams.toString()}`);
                      }}
                    >
                      Reset
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex-grow">
                <DataTable
                  className="border-none"
                  columns={columns}
                  data={results}
                  getRowId={(row) => row.id}
                  focusedRowId={selectedDatapoint?.id}
                  paginated
                  onRowClick={handleRowClick}
                />
              </div>
            </div>
            {!selectedDatapoint &&
              <EvaluationStats evaluationId={evaluation.id} comparedEvaluationId={comparedEvaluation?.id} />
            }
          </div>
        </ResizablePanel>
        <ResizableHandle />
        {isSidePanelOpen && (
          <ResizablePanel
            minSize={50}
          >
            <EvaluationPanel datapointPreview={selectedDatapoint!} onClose={() => {
              setIsSidePanelOpen(false)
              setSelectedDatapoint(null)
            }} />
          </ResizablePanel>
        )}
      </ResizablePanelGroup>
    </div >
  );
}
