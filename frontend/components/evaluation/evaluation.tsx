'use client';
import { createClient } from '@supabase/supabase-js';
import { ColumnDef } from '@tanstack/react-table';
import { ArrowRight } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Resizable } from 're-resizable';
import { useEffect, useMemo, useState } from 'react';

import { useProjectContext } from '@/contexts/project-context';
import { useUserContext } from '@/contexts/user-context';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/const';
import {
  Evaluation as EvaluationType, EvaluationDatapointPreviewWithCompared, EvaluationResultsInfo
} from '@/lib/evaluation/types';
import { mergeOriginalWithComparedDatapoints } from '@/lib/evaluation/utils';
import { useToast } from '@/lib/hooks/use-toast';

import TraceView from '../traces/trace-view';
import { Button } from '../ui/button';
import { DataTable } from '../ui/datatable';
import DownloadButton from '../ui/download-button';
import Header from '../ui/header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';
import Chart from './chart';
import CompareChart from './compare-chart';
import ScoreCard from './score-card';

const URL_QUERY_PARAMS = {
  COMPARE_EVAL_ID: 'comparedEvaluationId'
};

interface EvaluationProps {
  evaluationInfo: EvaluationResultsInfo;
  evaluations: EvaluationType[];
  isSupabaseEnabled: boolean;
}

export default function Evaluation({
  evaluationInfo,
  evaluations,
  isSupabaseEnabled
}: EvaluationProps) {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const { toast } = useToast();
  const { projectId } = useProjectContext();
  const evaluation = evaluationInfo.evaluation;
  const [comparedEvaluation, setComparedEvaluation] =
    useState<EvaluationType | null>(null);
  const defaultResults =
    evaluationInfo.results as EvaluationDatapointPreviewWithCompared[];
  const [results, setResults] = useState(defaultResults);
  // Selected score name must usually not be undefined, as we expect
  // to have at least one score, it's done just to not throw error if there are no scores

  const [scoreColumns, setScoreColumns] = useState<Set<string>>(new Set());
  const [selectedScoreName, setSelectedScoreName] = useState<string | undefined>(
    scoreColumns.size > 0 ? Array.from(scoreColumns)[0] : undefined
  );

  const updateScoreColumns = (rows: EvaluationDatapointPreviewWithCompared[]) => {
    let newScoreColumns = new Set<string>(scoreColumns);
    for (const row of rows) {
      for (const key of Object.keys(row.scores ?? {})) {
        newScoreColumns.add(key);
      }
    }
    setScoreColumns(newScoreColumns);
    setSelectedScoreName(newScoreColumns.size > 0 ? Array.from(newScoreColumns)[0] : undefined);
  };

  useEffect(() => {
    const comparedEvaluationId = searchParams.get(
      URL_QUERY_PARAMS.COMPARE_EVAL_ID
    );
    if (comparedEvaluationId) {
      handleComparedEvaluationChange(comparedEvaluationId);
    }
    updateScoreColumns(defaultResults);
  }, []);

  // TODO: get datapoints paginated.
  const [selectedDatapoint, setSelectedDatapoint] =
    useState<EvaluationDatapointPreviewWithCompared | null>(
      defaultResults.find(
        (result) => result.id === searchParams.get('datapointId')
      ) ?? null
    );

  // Columns used when there is no compared evaluation
  let defaultColumns: ColumnDef<EvaluationDatapointPreviewWithCompared>[] = [
    {
      accessorFn: (row) => JSON.stringify(row.data),
      header: 'Data'
    },
    {
      accessorFn: (row) => (row.target ? JSON.stringify(row.target) : '-'),
      header: 'Target'
    },
    {
      accessorFn: (row) =>
        row.executorOutput ? JSON.stringify(row.executorOutput) : '-',
      header: 'Output'
    }
  ];
  defaultColumns = defaultColumns.concat(
    Array.from(scoreColumns).map((scoreColumn) => ({
      header: scoreColumn,
      accessorFn: (row) => row.scores?.[scoreColumn] ?? '-',
      size: 150
    }))
  );

  const { supabaseAccessToken } = useUserContext();

  const supabase = useMemo(() => {
    if (!isSupabaseEnabled || !supabaseAccessToken) {
      return null;
    }

    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${supabaseAccessToken}`
        }
      }
    });
  }, [isSupabaseEnabled, supabaseAccessToken]);

  if (supabase) {
    supabase.realtime.setAuth(supabaseAccessToken);
  }

  const insertResult = (newRow: { [key: string]: any }) => {
    const newResult = {
      id: newRow.id,
      createdAt: newRow.created_at,
      index: newRow.index,
      evaluationId: newRow.evaluation_id,
      data: newRow.data,
      target: newRow.target,
      executorOutput: newRow.executor_output,
      scores: newRow.scores,
      traceId: newRow.trace_id,
    } as EvaluationDatapointPreviewWithCompared;
    const insertBefore = results.findIndex((result) => result.index > newResult.index);
    if (insertBefore === -1) {
      const newResults = [...results, newResult];
      setResults(newResults);
    } else {
      const newResults = [...results.slice(0, insertBefore), newResult, ...results.slice(insertBefore)];
      setResults(newResults);
    }
    updateScoreColumns([newResult]);
    setColumns(defaultColumns);
  };


  useEffect(() => {
    if (!supabase) {
      return;
    }

    supabase.channel('table-db-changes').unsubscribe();

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
          // FIXME: updates on this break the existing order of the results
          // insertResult(payload.new);
        }
      )
      .subscribe();
  }, [supabase]);

  const [columns, setColumns] = useState(defaultColumns);

  const handleRowClick = (row: EvaluationDatapointPreviewWithCompared) => {
    setSelectedDatapoint(row);
    searchParams.set('datapointId', row.id);

    router.push(`${pathName}?${searchParams.toString()}`);
  };

  const handleComparedEvaluationChange = (
    comparedEvaluationId: string | null
  ) => {
    if (comparedEvaluationId === undefined) {
      console.warn('comparedEvaluationId is undefined');
      return;
    }

    if (comparedEvaluationId === null) {
      setComparedEvaluation(null);
      setResults(evaluationInfo.results);
      setColumns(defaultColumns);
      searchParams.delete(URL_QUERY_PARAMS.COMPARE_EVAL_ID);
      router.push(`${pathName}?${searchParams.toString()}`);
      return;
    }

    fetch(`/api/projects/${projectId}/evaluations/${comparedEvaluationId}`)
      .then((res) => res.json())
      .then((comparedEvaluation) => {
        setComparedEvaluation(comparedEvaluation.evaluation);
        // evaluationInfo.results are always fixed, but the compared results (comparedEvaluation.results) change
        setResults(
          mergeOriginalWithComparedDatapoints(
            evaluationInfo.results,
            comparedEvaluation.results
          )
        );
        let columnsWithCompared: ColumnDef<EvaluationDatapointPreviewWithCompared>[] =
          [
            {
              accessorFn: (row) => JSON.stringify(row.data),
              header: 'Data'
            },
            {
              accessorFn: (row) =>
                row.target ? JSON.stringify(row.target) : '-',
              header: 'Target'
            }
          ];
        columnsWithCompared = columnsWithCompared.concat(
          Array.from(scoreColumns).map((scoreColumn) => ({
            header: scoreColumn,
            cell: (row) => (
              <div className="flex flex-row items-center space-x-2">
                <div className="text-green-300">
                  {row.row.original.comparedScores?.[scoreColumn] ?? '-'}
                </div>
                <ArrowRight className="font-bold" size={12} />
                <div className={comparedEvaluation && 'text-blue-300'}>
                  {row.row.original.scores?.[scoreColumn] ?? '-'}
                </div>
              </div>
            )
          }))
        );
        setColumns(columnsWithCompared);
      });
    searchParams.set(URL_QUERY_PARAMS.COMPARE_EVAL_ID, comparedEvaluationId);
    router.push(`${pathName}?${searchParams.toString()}`);
  };

  return (
    <div className="h-full flex flex-col relative">
      <Header path={`evaluations/${evaluation.name}`} />
      <div className="flex-none flex space-x-2 h-12 px-4 items-center border-b justify-start">
        <div>
          <Select
            key={
              comparedEvaluation
                ? comparedEvaluation.id
                : 'empty-compared-evaluation'
            }
            value={comparedEvaluation?.id ?? undefined}
            onValueChange={handleComparedEvaluationChange}
          >
            <SelectTrigger
              disabled={evaluations.length <= 1}
              className="flex flex-none font-medium max-w-60 text-secondary-foreground h-7"
            >
              <SelectValue placeholder="Select compared evaluation" />
            </SelectTrigger>
            <SelectContent>
              {evaluations
                .filter((item) => item.id != evaluation.id)
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
            key={evaluation.id}
            value={evaluation.id}
            onValueChange={(evaluationId: string) => {
              router.push(`/project/${projectId}/evaluations/${evaluationId}?${searchParams.toString()}`);
            }}
          >
            <SelectTrigger className="flex flex-none font-medium max-w-40 text-secondary-foreground h-7">
              <SelectValue placeholder="select evaluation" />
            </SelectTrigger>
            <SelectContent>
              {evaluations
                .filter(
                  (item) =>
                    comparedEvaluation === null ||
                    item.id != comparedEvaluation.id
                )
                .map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          {!!comparedEvaluation && (
            <Button
              className="h-6"
              variant={'secondary'}
              onClick={() => {
                handleComparedEvaluationChange(null);
              }}
            >
              Reset
            </Button>
          )}
        </div>
        <div>
          {comparedEvaluation !== null && (
            <Select
              value={selectedScoreName}
              onValueChange={setSelectedScoreName}
            >
              <SelectTrigger className="flex flex-none font-medium max-w-40 text-secondary-foreground h-7">
                <SelectValue placeholder="select score" />
              </SelectTrigger>
              <SelectContent>
                {Array.from(scoreColumns).map((scoreName) => (
                  <SelectItem key={scoreName} value={scoreName}>
                    {scoreName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div>
          {comparedEvaluation === null && (
            <DownloadButton
              uri={`/api/projects/${projectId}/evaluations/${evaluation.id}/download`}
              filenameFallback={`evaluation-results-${evaluation.id}`}
              supportedFormats={['csv', 'json']}
            />
          )}
        </div>
      </div>
      <div className="flex flex-grow flex-col">
        <div className="flex flex-col flex-grow">
          {selectedScoreName && (
            <div className="flex flex-row space-x-4 p-4 mr-4">
              <div className="flex-none w-72">
                <ScoreCard scoreName={selectedScoreName} />
              </div>
              <div className="flex-grow">
                {comparedEvaluation !== null ? (
                  <CompareChart
                    evaluationId={evaluation.id}
                    comparedEvaluationId={comparedEvaluation?.id}
                    scoreName={selectedScoreName}
                  />
                ) : (
                  <Chart
                    evaluationId={evaluation.id}
                    allScoreNames={Array.from(scoreColumns)}
                  />
                )}
              </div>
            </div>
          )}
          <div className="flex-grow">
            <DataTable
              className=""
              columns={columns}
              data={results}
              getRowId={(row) => row.id}
              focusedRowId={selectedDatapoint?.id}
              paginated
              onRowClick={(row) => handleRowClick(row.original)}
            />
          </div>
        </div>
      </div>
      {selectedDatapoint && (
        <div className="absolute top-0 right-0 bottom-0 bg-background border-l z-50 flex">
          <Resizable
            enable={{
              top: false,
              right: false,
              bottom: false,
              left: true,
              topRight: false,
              bottomRight: false,
              bottomLeft: false,
              topLeft: false
            }}
            defaultSize={{
              width: 1000
            }}
          >
            <div className="w-full h-full flex">
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
      )}
    </div>
  );
}
