"use client";

import { type Row } from "@tanstack/react-table";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Resizable } from "re-resizable";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";

import fullLogo from "@/assets/logo/logo.svg";
import Chart from "@/components/evaluation/chart";
import EvaluationDatapointsTable from "@/components/evaluation/evaluation-datapoints-table";
import ScoreCard from "@/components/evaluation/score-card";
import {
  buildColumnDefs,
  buildFetchParams,
  buildStatsParams,
  EvalStoreProvider,
  useEvalStore,
} from "@/components/evaluation/store";
import SharedEvalTraceView from "@/components/shared/evaluation/shared-eval-trace-view";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type EvalRow,
  type Evaluation,
  type EvaluationResultsInfo,
  type EvaluationScoreDistributionBucket,
  type EvaluationScoreStatistics,
} from "@/lib/evaluation/types";
import { useResizableTraceViewWidth } from "@/lib/hooks/use-resizable-trace-view-width";
import { swrFetcher } from "@/lib/utils";

interface SharedEvaluationProps {
  evaluationId: string;
  evaluationName: string;
  initialScoreNames: string[];
}

function SharedEvaluationContent({ evaluationId, evaluationName }: Omit<SharedEvaluationProps, "initialScoreNames">) {
  const searchParams = useSearchParams();
  const { push } = useRouter();
  const pathName = usePathname();
  const search = searchParams.get("search");
  const filter = searchParams.getAll("filter");
  const sortBy = searchParams.get("sortBy");
  const sortDirection = searchParams.get("sortDirection");

  // Store — seeded with `initialScoreNames` and `isShared: true` at
  // provider creation. `columnDefs` is derived in-render via useMemo.
  const scoreNames = useEvalStore((s) => s.scoreNames);
  const customColumns = useEvalStore((s) => s.customColumns);
  const isShared = useEvalStore((s) => s.isShared);

  const columnDefs = useMemo(
    () => buildColumnDefs({ scoreNames, customColumns, isShared }),
    [scoreNames, customColumns, isShared]
  );

  const [selectedScore, setSelectedScore] = useState<string | undefined>(() => scoreNames[0]);
  const [traceId, setTraceId] = useState<string | undefined>(() => searchParams.get("traceId") ?? undefined);
  const [datapointId, setDatapointId] = useState<string | undefined>(
    () => searchParams.get("datapointId") ?? undefined
  );

  const pageSize = 50;

  const statsUrl = useMemo(() => {
    const base = `/api/shared/evals/${evaluationId}/stats`;
    const urlParams = buildStatsParams({ search, filter, sortBy, sortDirection }, columnDefs, scoreNames);
    const qs = urlParams.toString();
    return qs ? `${base}?${qs}` : base;
  }, [evaluationId, search, filter, sortBy, sortDirection, columnDefs, scoreNames]);

  const { data: statsData, isLoading: isStatsLoading } = useSWR<{
    evaluation: Evaluation;
    allStatistics: Record<string, EvaluationScoreStatistics>;
    allDistributions: Record<string, EvaluationScoreDistributionBucket[]>;
  }>(statsUrl, swrFetcher);

  // SQL strings from column defs — only changes when columns structurally change.
  const columnSqls = useMemo(() => columnDefs.map((c) => c.meta?.sql).filter(Boolean), [columnDefs]);

  const onClose = useCallback(() => {
    setTraceId(undefined);
    setDatapointId(undefined);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("traceId");
    params.delete("datapointId");
    params.delete("spanId");
    push(`${pathName}?${params}`);
  }, [searchParams, pathName, push]);

  const fetchDatapoints = useCallback(
    async (pageNumber: number) => {
      const urlParams = buildFetchParams(
        {
          search,
          filter,
          sortBy,
          sortDirection,
          pageNumber,
          pageSize,
        },
        columnDefs
      );

      const url = `/api/shared/evals/${evaluationId}?${urlParams.toString()}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch datapoints.");
      }
      const data: EvaluationResultsInfo = await response.json();

      return { items: data.results, count: 0 };
    },
    [search, filter, evaluationId, pageSize, sortBy, sortDirection, columnDefs]
  );

  const {
    data: allDatapoints,
    hasMore: hasMorePages,
    isFetching: isFetchingPage,
    isLoading: isLoadingDatapoints,
    fetchNextPage,
  } = useInfiniteScroll<EvalRow>({
    fetchFn: fetchDatapoints,
    enabled: !isStatsLoading,
    deps: [search, filter, evaluationId, sortBy, sortDirection, columnSqls],
  });

  const handleRowClick = useCallback((row: Row<EvalRow>) => {
    setTraceId(row.original["traceId"] as string);
    setDatapointId(row.original["id"] as string);
  }, []);

  const getRowHref = useCallback(
    (row: Row<EvalRow>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("traceId", row.original["traceId"] as string);
      params.set("datapointId", row.original["id"] as string);
      return `${pathName}?${params.toString()}`;
    },
    [pathName, searchParams]
  );

  // Shared evals don't get realtime updates, so `scoreNames` never grows;
  // but if the seed list was empty (eval has no scored datapoints yet) and
  // somehow becomes non-empty later, fall through to picking the first.
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
          isLoading={isStatsLoading || isLoadingDatapoints}
          datapointId={datapointId}
          data={allDatapoints}
          scores={scoreNames}
          columnDefs={columnDefs}
          handleRowClick={handleRowClick}
          getRowHref={getRowHref}
          hasMore={hasMorePages}
          isFetching={isFetchingPage}
          fetchNextPage={fetchNextPage}
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
      <DataTableStateProvider storageKey="shared-evaluation-datapoints">
        <SharedEvaluationContent evaluationId={props.evaluationId} evaluationName={props.evaluationName} />
      </DataTableStateProvider>
    </EvalStoreProvider>
  );
}
