"use client";

import { type Row } from "@tanstack/react-table";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Resizable } from "re-resizable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import fullLogo from "@/assets/logo/logo.svg";
import Chart from "@/components/evaluation/chart";
import {
  buildAllColumnDefs,
  buildColumnsPayload,
  enrichFilter,
  getSortSql,
} from "@/components/evaluation/columns/index";
import EvaluationDatapointsTable from "@/components/evaluation/evaluation-datapoints-table";
import ScoreCard from "@/components/evaluation/score-card";
import SharedEvalTraceView from "@/components/shared/evaluation/shared-eval-trace-view";
import { getDefaultTraceViewWidth } from "@/components/traces/trace-view/utils";
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
import { swrFetcher } from "@/lib/utils";

interface SharedEvaluationProps {
  evaluationId: string;
  evaluationName: string;
}

function SharedEvaluationContent({ evaluationId, evaluationName }: SharedEvaluationProps) {
  const searchParams = useSearchParams();
  const { push } = useRouter();
  const pathName = usePathname();
  const search = searchParams.get("search");
  const filter = searchParams.getAll("filter");
  const searchIn = searchParams.getAll("searchIn");
  const sortBy = searchParams.get("sortBy");
  const sortDirection = searchParams.get("sortDirection");

  const [selectedScore, setSelectedScore] = useState<string | undefined>(undefined);
  const [traceId, setTraceId] = useState<string | undefined>(undefined);
  const [datapointId, setDatapointId] = useState<string | undefined>(undefined);

  const pageSize = 50;

  // Extract score names from filter params so stats URL doesn't depend on statsData
  const filterScoreNames = useMemo(
    () =>
      filter
        .map((f) => {
          try {
            const raw = JSON.parse(f);
            if (typeof raw.column === "string" && raw.column.startsWith("score:")) {
              return raw.column.split(":")[1] as string;
            }
          } catch {
            // skip
          }
          return undefined;
        })
        .filter((n): n is string => !!n),
    [filter]
  );

  const statsUrl = useMemo(() => {
    let url = `/api/shared/evals/${evaluationId}/stats`;
    const urlParams = new URLSearchParams();
    if (search) {
      urlParams.set("search", search);
    }
    searchIn.forEach((value) => {
      urlParams.append("searchIn", value);
    });
    const allColumnDefs = buildAllColumnDefs(filterScoreNames);
    filter.forEach((f) => {
      try {
        const raw = JSON.parse(f);
        const enriched = enrichFilter(raw, allColumnDefs);
        urlParams.append("filter", JSON.stringify(enriched));
      } catch {
        // Skip invalid filters
      }
    });
    if (urlParams.toString()) {
      url += `?${urlParams.toString()}`;
    }
    return url;
  }, [evaluationId, search, searchIn, filter, filterScoreNames]);

  const { data: statsData, isLoading: isStatsLoading } = useSWR<{
    evaluation: Evaluation;
    allStatistics: Record<string, EvaluationScoreStatistics>;
    allDistributions: Record<string, EvaluationScoreDistributionBucket[]>;
    scores: string[];
  }>(statsUrl, swrFetcher);

  const scores = statsData?.scores || [];

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
      const urlParams = new URLSearchParams();
      urlParams.set("pageNumber", pageNumber.toString());
      urlParams.set("pageSize", pageSize.toString());

      if (search) {
        urlParams.set("search", search);
      }

      searchIn.forEach((value) => {
        urlParams.append("searchIn", value);
      });

      // Enrich filters with SQL info from column meta
      const allColumnDefs = buildAllColumnDefs(scores);
      filter.forEach((f) => {
        try {
          const raw = JSON.parse(f);
          const enriched = enrichFilter(raw, allColumnDefs);
          urlParams.append("filter", JSON.stringify(enriched));
        } catch {
          // Skip invalid filters
        }
      });

      // Send columns payload
      const columnsPayload = buildColumnsPayload(scores);
      urlParams.set("columns", JSON.stringify(columnsPayload));

      if (sortBy) {
        urlParams.set("sortBy", sortBy);
        const sortSqlValue = getSortSql(sortBy, allColumnDefs);
        if (sortSqlValue) {
          urlParams.set("sortSql", sortSqlValue);
        }
      }
      if (sortDirection) {
        urlParams.set("sortDirection", sortDirection);
      }

      const url = `/api/shared/evals/${evaluationId}?${urlParams.toString()}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch datapoints.");
      }
      const data: EvaluationResultsInfo = await response.json();

      return { items: data.results, count: 0 };
    },
    [search, searchIn, filter, evaluationId, pageSize, sortBy, sortDirection, scores]
  );

  const {
    data: allDatapoints,
    hasMore: hasMorePages,
    isFetching: isFetchingPage,
    isLoading: _isLoadingDatapoints,
    fetchNextPage,
  } = useInfiniteScroll<EvalRow>({
    fetchFn: fetchDatapoints,
    enabled: true,
    deps: [search, filter, searchIn, evaluationId, sortBy, sortDirection],
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

  useEffect(() => {
    if (scores?.length > 0) {
      setSelectedScore(scores[0]);
    }
  }, [scores]);

  // URL sync on mount
  useEffect(() => {
    const traceId = searchParams.get("traceId");
    const datapointId = searchParams.get("datapointId");
    if (traceId) {
      setTraceId(traceId);
    }
    if (datapointId) {
      setDatapointId(datapointId);
    }
  }, []);

  const [defaultTraceViewWidth, setDefaultTraceViewWidth] = useState(1000);

  const handleResizeStop = useCallback(
    (_event: MouseEvent | TouchEvent, _direction: unknown, _elementRef: HTMLElement, delta: { width: number }) => {
      setDefaultTraceViewWidth((prev) => prev + delta.width);
    },
    []
  );

  const ref = useRef<Resizable>(null);

  useEffect(() => {
    const width = getDefaultTraceViewWidth();
    if (width > window.innerWidth - 180) {
      const newWidth = window.innerWidth - 240;
      setDefaultTraceViewWidth(newWidth);
      ref?.current?.updateSize({ width: newWidth });
    } else {
      setDefaultTraceViewWidth(width);
    }
  }, []);

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
            href="https://docs.laminar.sh/evaluations/introduction"
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
                  scores={scores}
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
          isLoading={isStatsLoading}
          datapointId={datapointId}
          data={allDatapoints}
          scores={scores}
          handleRowClick={handleRowClick}
          getRowHref={getRowHref}
          hasMore={hasMorePages}
          isFetching={isFetchingPage}
          fetchNextPage={fetchNextPage}
          isDisableLongTooltips
        />
      </div>
      {traceId && (
        <div className="absolute top-0 right-0 bottom-0 bg-background border-l z-50 flex">
          <Resizable
            ref={ref}
            onResizeStop={handleResizeStop}
            enable={{
              left: true,
            }}
            defaultSize={{
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
    <DataTableStateProvider storageKey="shared-evaluation-datapoints">
      <SharedEvaluationContent {...props} />
    </DataTableStateProvider>
  );
}
