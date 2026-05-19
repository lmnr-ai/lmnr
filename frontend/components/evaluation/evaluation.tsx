"use client";

import { type Row } from "@tanstack/react-table";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import Chart from "@/components/evaluation/chart";
import CompareChart from "@/components/evaluation/compare-chart";
import EvaluationDatapointsTable from "@/components/evaluation/evaluation-datapoints-table";
import EvaluationHeader from "@/components/evaluation/evaluation-header";
import ScoreCard from "@/components/evaluation/score-card";
import { EvalStoreProvider } from "@/components/evaluation/store";
import { type EvaluationStatsPayload } from "@/components/evaluation/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { type EvalRow, type Evaluation as EvaluationType } from "@/lib/evaluation/types";
import { formatTimestamp } from "@/lib/utils";

import { TraceViewSidePanel } from "../traces/trace-view";
import Header from "../ui/header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

interface EvaluationProps {
  evaluations: EvaluationType[];
  evaluationId: string;
  evaluationName: string;
  initialScoreNames: string[];
}

function EvaluationContent({ evaluations, evaluationId, evaluationName, initialScoreNames }: EvaluationProps) {
  const { push } = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const params = useParams<{ projectId: string }>();
  const targetId = searchParams.get("targetId");

  const [selectedScore, setSelectedScore] = useState<string | undefined>(() => initialScoreNames[0]);
  const [traceId, setTraceId] = useState<string | undefined>(() => searchParams.get("traceId") ?? undefined);
  const [datapointId, setDatapointId] = useState<string | undefined>(
    () => searchParams.get("datapointId") ?? undefined
  );
  const [selectedRow, setSelectedRow] = useState<EvalRow | undefined>(undefined);
  const [statsData, setStatsData] = useState<EvaluationStatsPayload | undefined>(undefined);
  const [targetStatsData, setTargetStatsData] = useState<EvaluationStatsPayload | undefined>(undefined);

  const isStatsLoading = statsData === undefined;

  const buildDatapointsUrl = useCallback(
    (qs: string) => `/api/projects/${params.projectId}/evaluations/${evaluationId}?${qs}`,
    [params.projectId, evaluationId]
  );
  const buildStatsUrl = useCallback(
    (qs: string) => {
      const base = `/api/projects/${params.projectId}/evaluations/${evaluationId}/stats`;
      return qs ? `${base}?${qs}` : base;
    },
    [params.projectId, evaluationId]
  );

  const onClose = useCallback(() => {
    setTraceId(undefined);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("traceId");
    next.delete("spanId");
    push(`${pathName}?${next}`);
  }, [searchParams, pathName, push]);

  const handleRowClick = useCallback((row: Row<EvalRow>) => {
    setTraceId(row.original["traceId"] as string);
    setDatapointId(row.original["id"] as string);
  }, []);

  const getRowHref = useCallback(
    (row: Row<EvalRow>) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("traceId", row.original["traceId"] as string);
      next.set("datapointId", row.original["id"] as string);
      return `${pathName}?${next.toString()}`;
    },
    [pathName, searchParams]
  );

  const handleTraceChange = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("traceId", id);
    push(`${pathName}?${next}`);
    setTraceId(id);
  };

  const scoreNames = statsData?.evaluation
    ? Object.keys(statsData.allStatistics ?? {}).length > 0
      ? Object.keys(statsData.allStatistics)
      : initialScoreNames
    : initialScoreNames;

  if (!selectedScore && scoreNames.length > 0) {
    setSelectedScore(scoreNames[0]);
  }

  const statsUrl = useMemo(() => buildStatsUrl(""), [buildStatsUrl]);

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
                    scores={scoreNames}
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
            evaluationId={evaluationId}
            initialScoreNames={initialScoreNames}
            buildDatapointsUrl={buildDatapointsUrl}
            buildStatsUrl={buildStatsUrl}
            handleRowClick={handleRowClick}
            getRowHref={getRowHref}
            datapointId={datapointId}
            onStatsLoaded={setStatsData}
            onTargetStatsLoaded={setTargetStatsData}
            onSelectedRowChange={setSelectedRow}
          />
        </div>
      </div>
      {traceId && (
        <TraceViewSidePanel onClose={onClose} traceId={traceId}>
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
        </TraceViewSidePanel>
      )}
    </>
  );
}

export default function Evaluation(props: EvaluationProps) {
  return (
    <EvalStoreProvider key={props.evaluationId} initialScoreNames={props.initialScoreNames}>
      <EvaluationContent {...props} />
    </EvalStoreProvider>
  );
}
