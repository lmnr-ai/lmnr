'use client';
import { ColumnDef } from '@tanstack/react-table';
import { ArrowRight } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Resizable } from 're-resizable';
import { useEffect, useState } from 'react';

import { useProjectContext } from '@/contexts/project-context';
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
}

export default function Evaluation({
  evaluationInfo,
  evaluations
}: EvaluationProps) {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const { toast } = useToast();

  const { projectId } = useProjectContext();

  const evaluation = evaluationInfo.evaluation;

  const [comparedEvaluation, setComparedEvaluation] =
    useState<EvaluationType | null>(null);

  useEffect(() => {
    const comparedEvaluationId = searchParams.get(
      URL_QUERY_PARAMS.COMPARE_EVAL_ID
    );
    handleComparedEvaluationChange(comparedEvaluationId ?? null);
  }, []);

  let defaultResults =
    evaluationInfo.results as EvaluationDatapointPreviewWithCompared[];
  const [results, setResults] = useState(defaultResults);

  let scoreColumns = new Set<string>();
  for (const row of defaultResults) {
    for (const key of Object.keys(row.scores ?? {})) {
      scoreColumns.add(key);
    }
  }

  // TODO: get datapoints paginated.
  const [selectedDatapoint, setSelectedDatapoint] =
    useState<EvaluationDatapointPreviewWithCompared | null>(
      defaultResults.find(
        (result) => result.id === searchParams.get('datapointId')
      ) ?? null
    );

  // Selected score name must usually not be undefined, as we expect
  // to have at least one score, it's done just to not throw error if there are no scores
  const [selectedScoreName, setSelectedScoreName] = useState<string | undefined>(
    scoreColumns.size > 0 ? Array.from(scoreColumns)[0] : undefined
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
              fileFormat="CSV"
              filenameFallback={`evaluation-results-${evaluation.id}.csv`}
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
