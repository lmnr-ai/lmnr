"use client";

import { type Row } from "@tanstack/react-table";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Resizable } from "re-resizable";
import { useCallback, useState } from "react";

import fullLogo from "@/assets/logo/logo.svg";
import Chart from "@/components/evaluation/chart";
import EvaluationDatapointsTable from "@/components/evaluation/evaluation-datapoints-table";
import ScoreCard from "@/components/evaluation/score-card";
import { EvalStoreProvider } from "@/components/evaluation/store";
import { type EvaluationStatsPayload } from "@/components/evaluation/utils";
import SharedEvalTraceView from "@/components/shared/evaluation/shared-eval-trace-view";
import { Skeleton } from "@/components/ui/skeleton";
import { type EvalRow } from "@/lib/evaluation/types";
import { useResizableTraceViewWidth } from "@/lib/hooks/use-resizable-trace-view-width";

interface SharedEvaluationProps {
  evaluationId: string;
  evaluationName: string;
  initialScoreNames: string[];
}

function SharedEvaluationContent({
  evaluationId,
  evaluationName,
  initialScoreNames,
}: SharedEvaluationProps) {
  const searchParams = useSearchParams();
  const { push } = useRouter();
  const pathName = usePathname();

  const [selectedScore, setSelectedScore] = useState<string | undefined>(() => initialScoreNames[0]);
  const [traceId, setTraceId] = useState<string | undefined>(() => searchParams.get("traceId") ?? undefined);
  const [datapointId, setDatapointId] = useState<string | undefined>(
    () => searchParams.get("datapointId") ?? undefined
  );
  const [statsData, setStatsData] = useState<EvaluationStatsPayload | undefined>(undefined);
  const isStatsLoading = statsData === undefined;

  const buildDatapointsUrl = useCallback(
    (qs: string) => `/api/shared/evals/${evaluationId}?${qs}`,
    [evaluationId]
  );
  const buildStatsUrl = useCallback(
    (qs: string) => {
      const base = `/api/shared/evals/${evaluationId}/stats`;
      return qs ? `${base}?${qs}` : base;
    },
    [evaluationId]
  );

  const onClose = useCallback(() => {
    setTraceId(undefined);
    setDatapointId(undefined);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("traceId");
    next.delete("datapointId");
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

  const scoreNames = statsData?.allStatistics
    ? Object.keys(statsData.allStatistics).length > 0
      ? Object.keys(statsData.allStatistics)
      : initialScoreNames
    : initialScoreNames;

  if (!selectedScore && scoreNames.length > 0) {
    setSelectedScore(scoreNames[0]);
  }

  const { width: defaultTraceViewWidth, handleResizeStop } = useResizableTraceViewWidth();

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden relative">
      <div className="flex flex-none items-center border-b px-6 py-3.5 gap-2">
        <Link className="mr-2" href="/projects">
          <Image alt="Laminar logo" src={fullLogo} width={100} height={20} />
        </Link>
        <span className="flex gap-2 items-center pt-0.5">
          <span className="text-secondary-foreground">/</span>
          <span className="text-sm font-medium text-secondary-foreground">
            {statsData?.evaluation?.name || evaluationName}
          </span>
        </span>
        <div className="flex-1" />
        <div className="h-full items-end flex">
          <Link
            href="https://laminar.sh/docs/evaluations/introduction"
            target="_blank"
            className="text-xs text-secondary-foreground hover:underline"
          >
            Learn more about Laminar evals
          </Link>
        </div>
      </div>
      <div className="flex-1 flex flex-col gap-2 overflow-hidden p-4">
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
                  isLoading={isStatsLoading}
                />
              </div>
              <div className="grow">
                <Chart
                  scoreName={selectedScore}
                  distribution={selectedScore ? (statsData?.allDistributions?.[selectedScore] ?? null) : null}
                  isLoading={isStatsLoading}
                />
              </div>
            </>
          )}
        </div>
        <EvaluationDatapointsTable
          evaluationId={evaluationId}
          initialScoreNames={initialScoreNames}
          storageKey="shared-evaluation-datapoints"
          buildDatapointsUrl={buildDatapointsUrl}
          buildStatsUrl={buildStatsUrl}
          enableRealtime={false}
          handleRowClick={handleRowClick}
          getRowHref={getRowHref}
          datapointId={datapointId}
          onStatsLoaded={setStatsData}
        />
      </div>
      {traceId && (
        <div className="absolute top-0 right-0 bottom-0 bg-background border-l z-50 flex">
          <Resizable
            onResizeStop={handleResizeStop}
            enable={{
              left: true,
            }}
            size={{
              width: defaultTraceViewWidth,
            }}
          >
            <div className="w-full h-full flex flex-col">
              <SharedEvalTraceView key={traceId} traceId={traceId} onClose={onClose} />
            </div>
          </Resizable>
        </div>
      )}
    </div>
  );
}

export default function SharedEvaluation(props: SharedEvaluationProps) {
  return (
    <EvalStoreProvider key={props.evaluationId} initialScoreNames={props.initialScoreNames} isShared>
      <SharedEvaluationContent {...props} />
    </EvalStoreProvider>
  );
}
