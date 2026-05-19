"use client";

import { type Row } from "@tanstack/react-table";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Resizable } from "re-resizable";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { useStore } from "zustand";
import { shallow } from "zustand/shallow";

import fullLogo from "@/assets/logo/logo.svg";
import Chart from "@/components/evaluation/chart";
import EvaluationDatapointsTable from "@/components/evaluation/evaluation-datapoints-table";
import ScoreCard from "@/components/evaluation/score-card";
import {
  buildColumnDefs,
  buildFetchParams,
  buildStatsParams,
  EvalStoreProvider,
  selectVisibleColumnDefs,
  useEvalStore,
} from "@/components/evaluation/store";
import { type EvaluationStatsPayload } from "@/components/evaluation/utils";
import SharedEvalTraceView from "@/components/shared/evaluation/shared-eval-trace-view";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider, useDataTableStore } from "@/components/ui/infinite-datatable/model/datatable-store";
import { Skeleton } from "@/components/ui/skeleton";
import { type EvalRow, type EvaluationResultsInfo } from "@/lib/evaluation/types";
import { useResizableTraceViewWidth } from "@/lib/hooks/use-resizable-trace-view-width";
import { swrFetcher } from "@/lib/utils";

interface SharedEvaluationProps {
  evaluationId: string;
  evaluationName: string;
  initialScoreNames: string[];
}

const PAGE_SIZE = 50;
const BASE_COLUMN_ORDER = ["status", "index", "data", "target", "metadata", "output", "duration", "cost"];

function SharedEvaluationContent({ evaluationId, evaluationName }: SharedEvaluationProps) {
  const searchParams = useSearchParams();
  const { push } = useRouter();
  const pathName = usePathname();

  const search = searchParams.get("search");
  const filter = searchParams.getAll("filter");
  const sortBy = searchParams.get("sortBy");
  const sortDirection = searchParams.get("sortDirection");

  // Shared eval ignores customColumns at render time (buildColumnDefs's isShared
  // branch returns []) but still reads the store via the same selector for
  // structural symmetry with the non-shared page.
  const datatableStore = useDataTableStore<EvalRow>();
  const { customColumns } = useStore(
    datatableStore,
    (s) => ({ customColumns: s.customColumns }),
    shallow
  );

  const scoreNames = useEvalStore((s) => s.scoreNames);
  const isShared = useEvalStore((s) => s.isShared);

  const columnDefs = useMemo(
    () => buildColumnDefs({ scoreNames, customColumns, isShared }),
    [scoreNames, customColumns, isShared]
  );

  const statsUrl = useMemo(() => {
    const base = `/api/shared/evals/${evaluationId}/stats`;
    const urlParams = buildStatsParams({ search, filter, sortBy, sortDirection }, columnDefs, scoreNames);
    const qs = urlParams.toString();
    return qs ? `${base}?${qs}` : base;
  }, [evaluationId, search, filter, sortBy, sortDirection, columnDefs, scoreNames]);

  const { data: statsData, isLoading: isStatsLoading } = useSWR<EvaluationStatsPayload>(statsUrl, swrFetcher, {
    revalidateOnFocus: false,
  });

  const columnSqls = useMemo(() => columnDefs.map((c) => c.meta?.sql).filter(Boolean), [columnDefs]);

  const fetchDatapoints = useCallback(
    async (pageNumber: number) => {
      const urlParams = buildFetchParams(
        { search, filter, sortBy, sortDirection, pageNumber, pageSize: PAGE_SIZE },
        columnDefs
      );
      const url = `/api/shared/evals/${evaluationId}?${urlParams.toString()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch datapoints.");
      const data: EvaluationResultsInfo = await response.json();
      return { items: data.results, count: 0 };
    },
    [evaluationId, search, filter, sortBy, sortDirection, columnDefs]
  );

  const {
    data: allDatapoints,
    hasMore,
    isFetching,
    isLoading: isLoadingDatapoints,
    fetchNextPage,
  } = useInfiniteScroll<EvalRow>({
    fetchFn: fetchDatapoints,
    enabled: !isStatsLoading,
    deps: [search, filter, evaluationId, sortBy, sortDirection, columnSqls],
  });

  // Score-range heatmap input — derived from current data, no storage needed.
  const scoreRanges = useMemo(() => {
    if (!allDatapoints) return {};
    const isValidNumber = (value: unknown): value is number => typeof value === "number" && !isNaN(value);
    return scoreNames.reduce(
      (acc, scoreName) => {
        const values = allDatapoints.map((row) => row[`score:${scoreName}`]).filter(isValidNumber);
        if (values.length === 0) return acc;
        return { ...acc, [scoreName]: { min: Math.min(...values), max: Math.max(...values) } };
      },
      {} as Record<string, { min: number; max: number }>
    );
  }, [allDatapoints, scoreNames]);

  const [selectedScore, setSelectedScore] = useState<string | undefined>(() => scoreNames[0]);
  const [traceId, setTraceId] = useState<string | undefined>(() => searchParams.get("traceId") ?? undefined);
  const [datapointId, setDatapointId] = useState<string | undefined>(
    () => searchParams.get("datapointId") ?? undefined
  );

  if (!selectedScore && scoreNames.length > 0) {
    setSelectedScore(scoreNames[0]);
  }

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

  const handleSort = useCallback(
    (columnId: string, direction: "asc" | "desc") => {
      const next = new URLSearchParams(searchParams.toString());
      if (columnId) {
        next.set("sortBy", columnId);
        next.set("sortDirection", direction.toUpperCase());
      } else {
        next.delete("sortBy");
        next.delete("sortDirection");
      }
      push(`${pathName}?${next.toString()}`);
    },
    [searchParams, push, pathName]
  );

  const visibleColumnDefs = useMemo(() => selectVisibleColumnDefs(columnDefs, false), [columnDefs]);
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
          data={allDatapoints}
          isLoading={isStatsLoading || isLoadingDatapoints}
          isFetching={isFetching}
          hasMore={hasMore}
          fetchNextPage={fetchNextPage}
          columnDefs={columnDefs}
          visibleColumnDefs={visibleColumnDefs}
          isComparison={false}
          scoreRanges={scoreRanges}
          datapointId={datapointId}
          handleRowClick={handleRowClick}
          getRowHref={getRowHref}
          sortBy={sortBy ?? undefined}
          sortDirection={(sortDirection?.toLowerCase() ?? undefined) as "asc" | "desc" | undefined}
          onSort={handleSort}
        />
      </div>
      {traceId && (
        <div className="absolute top-0 right-0 bottom-0 bg-background border-l z-50 flex">
          <Resizable
            onResizeStop={handleResizeStop}
            enable={{ left: true }}
            size={{ width: defaultTraceViewWidth }}
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
  const defaultColumnOrder = useMemo(
    () => [...BASE_COLUMN_ORDER, ...props.initialScoreNames.map((s) => `score:${s}`)],
    [props.initialScoreNames]
  );

  return (
    <EvalStoreProvider key={props.evaluationId} initialScoreNames={props.initialScoreNames} isShared>
      <DataTableStateProvider storageKey="shared-evaluation-datapoints" defaultColumnOrder={defaultColumnOrder}>
        <SharedEvaluationContent {...props} />
      </DataTableStateProvider>
    </EvalStoreProvider>
  );
}
