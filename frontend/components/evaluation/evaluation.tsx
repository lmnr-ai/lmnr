"use client";

import { type ColumnDef, type Row } from "@tanstack/react-table";
import { debounce } from "lodash";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { shallow } from "zustand/shallow";

import EvaluationDatapointsTable from "@/components/evaluation/evaluation-datapoints-table";
import EvaluationHeader from "@/components/evaluation/evaluation-header";
import MetricsPanel from "@/components/evaluation/metrics-panel";
import { isBinaryDistribution } from "@/components/evaluation/metrics-panel/utils";
import BottomDockLayout from "@/components/evaluation/poc/bottom-dock-layout";
import HoverNavLayout, { type HoverNavMode } from "@/components/evaluation/poc/hover-nav-layout";
import MorphLayout from "@/components/evaluation/poc/morph-layout";
import TraceFirstLayout from "@/components/evaluation/poc/trace-first-layout";
import { useLabelField } from "@/components/evaluation/poc/use-label-field";
import { usePocVariant } from "@/components/evaluation/poc/use-poc-variant";
import VariantControlPanel from "@/components/evaluation/poc/variant-control-panel";
import {
  buildColumnDefs,
  buildFetchParams,
  buildStatsParams,
  EvalStoreProvider,
  selectVisibleColumnDefs,
  useEvalStore,
} from "@/components/evaluation/store";
import {
  type EvaluationStatsPayload,
  flattenScores,
  mergeDatapointUpsertIntoRows,
  mergeTraceUpdateIntoRows,
} from "@/components/evaluation/utils";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { useTableConfigStore, useTableView } from "@/components/ui/infinite-datatable/model/table-config-store";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import { resolveLabelPath } from "@/lib/evaluation/label-path";
import { type EvalRow, type Evaluation as EvaluationType, type EvaluationResultsInfo } from "@/lib/evaluation/types";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { swrFetcher } from "@/lib/utils";

import TraceView from "../traces/trace-view";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../ui/resizable";

interface EvaluationProps {
  evaluations: EvaluationType[];
  evaluationId: string;
  evaluationName: string;
  initialScoreNames: string[];
}

const PAGE_SIZE = 50;
const BASE_COLUMN_ORDER = ["status", "index", "data", "target", "metadata", "output", "duration", "cost"];
const RESOURCE = "evaluation";
// Compact v1 (LAM Round 4) forks saved views/table config from v0 — its own
// resource key so defaults never fight v0's. Bumped to v1.1 when data/target
// became default-visible (defaults only apply to fresh, unpersisted state).
const RESOURCE_V1 = "evaluation-v1.1";
// v1 default visibility: label + data + target + metadata + score:*. Status and
// index stay hidden — the label column inlines both.
const V1_HIDDEN_COLUMNS = ["status", "index", "output", "duration", "cost"];

function EvaluationContent({ evaluations, evaluationId }: EvaluationProps) {
  const { push } = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const params = useParams<{ projectId: string }>();

  const targetId = searchParams.get("targetId");

  // View-owned params (filter / search / sort) flow through the view layer.
  // `effective` merges URL params with the selected view's baseline.
  const { effective, isLoading: isViewLoading, setSort, setSearchAndFilters } = useTableView();
  const filter = useMemo(() => effective.filters.map((f) => JSON.stringify(f)), [effective.filters]);
  const search = effective.search.length > 0 ? effective.search : null;
  const sortBy = effective.sortBy ?? undefined;
  const sortDirection = effective.sortDirection ?? undefined;

  // Column config layer: customColumns are read from the config store and
  // threaded into the columnDefs / URLs below.
  const { customColumns, removeCustomColumn } = useTableConfigStore(
    (s) => ({ customColumns: s.config.customColumns, removeCustomColumn: s.removeCustomColumn }),
    shallow
  );

  // Eval-specific state lives in EvalStore. customColumns intentionally do not.
  const scoreNames = useEvalStore((s) => s.scoreNames);
  const isShared = useEvalStore((s) => s.isShared);
  const heatmapEnabled = useEvalStore((s) => s.heatmapEnabled);
  const setHeatmapEnabled = useEvalStore((s) => s.setHeatmapEnabled);
  const addScoreName = useEvalStore((s) => s.addScoreName);

  const { variant } = usePocVariant();
  const isCompactV1 = variant === "compact-v1";

  // LLM picks the label field ONCE per evaluation (Round 4B); the server
  // samples untruncated rows itself. When a path lands, the label column
  // gains a compiled SQL expression and the table refetches with it.
  const { fieldPath: labelFieldPath } = useLabelField(params.projectId, evaluationId);

  const isComparison = !!targetId;
  const columnDefs = useMemo(
    () => buildColumnDefs({ scoreNames, customColumns, isShared, includeLabel: isCompactV1, labelFieldPath }),
    [scoreNames, customColumns, isShared, isCompactV1, labelFieldPath]
  );

  // Stats SWR — drives the score card + chart.
  const statsUrl = useMemo(() => {
    const base = `/api/projects/${params.projectId}/evaluations/${evaluationId}/stats`;
    const urlParams = buildStatsParams(
      { search, filter, sortBy: sortBy ?? null, sortDirection: sortDirection?.toUpperCase() ?? null },
      columnDefs,
      scoreNames
    );
    const qs = urlParams.toString();
    return qs ? `${base}?${qs}` : base;
  }, [params.projectId, evaluationId, search, filter, sortBy, sortDirection, columnDefs, scoreNames]);

  const {
    data: statsData,
    isLoading: isStatsLoading,
    mutate: mutateStats,
  } = useSWR<EvaluationStatsPayload>(statsUrl, swrFetcher, { revalidateOnFocus: false });

  const targetStatsUrl = useMemo(() => {
    if (!targetId) return null;
    const base = `/api/projects/${params.projectId}/evaluations/${targetId}/stats`;
    const urlParams = buildStatsParams(
      { search, filter, sortBy: sortBy ?? null, sortDirection: sortDirection?.toUpperCase() ?? null },
      columnDefs,
      scoreNames
    );
    const qs = urlParams.toString();
    return qs ? `${base}?${qs}` : base;
  }, [params.projectId, targetId, search, filter, sortBy, sortDirection, columnDefs, scoreNames]);

  const { data: targetStatsData } = useSWR<EvaluationStatsPayload>(targetStatsUrl, swrFetcher, {
    revalidateOnFocus: false,
  });

  // Datapoints fetcher — depends on columnDefs (custom column SQL, etc).
  // SQL strings are stable across cosmetic columnDefs changes; JSON.stringify
  // on `columnSqls` produces the same string → no spurious refetch.
  const columnSqls = useMemo(() => columnDefs.map((c) => c.meta?.sql).filter(Boolean), [columnDefs]);

  const fetchDatapoints = useCallback(
    async (pageNumber: number) => {
      const urlParams = buildFetchParams(
        {
          search,
          filter,
          sortBy: sortBy ?? null,
          sortDirection: sortDirection?.toUpperCase() ?? null,
          targetId,
          pageNumber,
          pageSize: PAGE_SIZE,
        },
        columnDefs
      );
      const url = `/api/projects/${params.projectId}/evaluations/${evaluationId}?${urlParams.toString()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch datapoints.");
      const data: EvaluationResultsInfo = await response.json();
      return { items: data.results, count: 0 };
    },
    [search, filter, params.projectId, evaluationId, sortBy, sortDirection, targetId, columnDefs]
  );

  const {
    data: allDatapoints,
    hasMore,
    isFetching,
    isLoading: isLoadingDatapoints,
    fetchNextPage,
    updateData,
  } = useInfiniteScroll<EvalRow>({
    fetchFn: fetchDatapoints,
    enabled: !isStatsLoading && !isViewLoading,
    deps: [search, filter, evaluationId, sortBy, sortDirection, targetId, columnSqls],
  });

  // Score-range heatmap input — derived from current data, no storage needed.
  const scoreRanges = useMemo(() => {
    if (!allDatapoints) return {};
    const isValidNumber = (value: unknown): value is number => typeof value === "number" && !isNaN(value);
    return scoreNames.reduce(
      (acc, scoreName) => {
        const values = allDatapoints
          .flatMap((row) => {
            const v = [row[`score:${scoreName}`]];
            if (targetId) v.push(row[`compared:score:${scoreName}`]);
            return v;
          })
          .filter(isValidNumber);
        if (values.length === 0) return acc;
        return { ...acc, [scoreName]: { min: Math.min(...values), max: Math.max(...values) } };
      },
      {} as Record<string, { min: number; max: number }>
    );
  }, [allDatapoints, scoreNames, targetId]);

  // Rows fetched with the label query column carry `label` already; the
  // client-side resolve only covers the gap window (rows fetched before the
  // path landed, realtime upserts) — it can miss on truncated data/target.
  // Short-circuits to the same reference when there's no resolved path, so
  // other variants never churn.
  const labeledDatapoints = useMemo(() => {
    if (!labelFieldPath || !allDatapoints) return allDatapoints;
    return allDatapoints.map((row) => ({
      ...row,
      label: (row["label"] as string | undefined) || resolveLabelPath(row, labelFieldPath),
    }));
  }, [allDatapoints, labelFieldPath]);

  // Trace-first sidebar reads labels by row id rather than mutating rows.
  const labelsById = useMemo(() => {
    if (!labelFieldPath || !allDatapoints) return undefined;
    const map: Record<string, string> = {};
    for (const row of allDatapoints) {
      const label = (row["label"] as string | undefined) || resolveLabelPath(row, labelFieldPath);
      if (label) map[String(row["id"])] = label;
    }
    return map;
  }, [allDatapoints, labelFieldPath]);

  // Realtime — only on the live (non-comparison) eval page.
  const debouncedRevalidateStats = useMemo(
    () => debounce(() => mutateStats(), 1000, { leading: false, trailing: true }),
    [mutateStats]
  );
  useEffect(() => () => debouncedRevalidateStats.cancel(), [debouncedRevalidateStats]);

  const realtimeHandlers = useMemo(
    () => ({
      datapoint_upsert: (event: MessageEvent) => {
        if (targetId) return;
        try {
          const payload = JSON.parse(event.data) as { datapoints?: Array<EvalRow & { id: string }> };
          payload.datapoints?.forEach((incoming) => {
            const flattened = flattenScores(incoming["scores"]);
            updateData((rows) => mergeDatapointUpsertIntoRows(rows, incoming, flattened));
            if (Object.keys(flattened).length === 0) return;
            Object.keys(flattened).forEach((key) => addScoreName(key.slice("score:".length)));
            debouncedRevalidateStats();
          });
        } catch (e) {
          console.warn("Failed to parse realtime datapoint_upsert:", e);
        }
      },
      trace_update: (event: MessageEvent) => {
        if (targetId) return;
        try {
          const payload = JSON.parse(event.data) as { traces?: Array<Record<string, unknown> & { id: string }> };
          payload.traces?.forEach((trace) => updateData((rows) => mergeTraceUpdateIntoRows(rows, trace)));
        } catch (e) {
          console.warn("Failed to parse realtime trace_update:", e);
        }
      },
    }),
    [updateData, addScoreName, debouncedRevalidateStats, targetId]
  );

  useRealtime({
    key: `evaluation_${evaluationId}`,
    projectId: params.projectId,
    enabled: !targetId,
    eventHandlers: realtimeHandlers,
  });

  // Side-panel + selected-row state for trace view.
  const [selectedScore, setSelectedScore] = useState<string | undefined>(() => scoreNames[0]);
  const [traceId, setTraceId] = useState<string | undefined>(() => searchParams.get("traceId") ?? undefined);
  const [datapointId, setDatapointId] = useState<string | undefined>(
    () => searchParams.get("datapointId") ?? undefined
  );

  if (!selectedScore && scoreNames.length > 0) {
    setSelectedScore(scoreNames[0]);
  }

  const handleRowClick = useCallback((row: Row<EvalRow>) => {
    setTraceId(row.original["traceId"] as string);
    setDatapointId(row.original["id"] as string);
  }, []);

  // POC sidebar variants select plain EvalRows (no tanstack Row wrapper).
  const handleSelectEvalRow = useCallback((row: EvalRow) => {
    setTraceId(row["traceId"] as string);
    setDatapointId(row["id"] as string);
  }, []);

  // History-block point click: jump to another run's trace (traces are
  // project-scoped, so a cross-eval traceId renders fine on this page).
  const handleSelectTrace = useCallback((id: string) => setTraceId(id), []);

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
      setSort(columnId || null, columnId ? direction : null);
    },
    [setSort]
  );

  const onClose = useCallback(() => {
    setTraceId(undefined);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("traceId");
    next.delete("spanId");
    push(`${pathName}?${next}`);
  }, [searchParams, pathName, push]);

  const visibleColumnDefs = useMemo(
    () => selectVisibleColumnDefs(columnDefs, isComparison),
    [columnDefs, isComparison]
  );

  const hasNonBinary = useMemo(() => {
    const dists = statsData?.allDistributions;
    if (!dists) return true;
    return scoreNames.some((name) => !isBinaryDistribution(dists[name] ?? null));
  }, [scoreNames, statsData?.allDistributions]);

  const onDeleteCustomColumn = useCallback(
    (columnId: string) => removeCustomColumn(columnId.replace("custom:", "")),
    [removeCustomColumn]
  );

  const searchValue = useMemo(
    () => ({ filters: effective.filters, search: effective.search }),
    [effective.filters, effective.search]
  );

  // Extracted so the (long) prop list isn't duplicated across the branches below.
  // `overrides` lets the morph variant swap in a narrower column subset without
  // threading every prop through again. The fetched datapoints live in this
  // parent (useInfiniteScroll), so switching branches only resets the
  // virtualizer's scroll position, not the data.
  const viewsResource = isCompactV1 ? RESOURCE_V1 : RESOURCE;

  const renderTable = useCallback(
    (overrides?: { visibleColumnDefs?: ColumnDef<EvalRow>[]; pinnedLeftColumnIds?: string[] }) => (
      <EvaluationDatapointsTable
        data={labeledDatapoints}
        isLoading={isStatsLoading || isLoadingDatapoints || isViewLoading}
        isFetching={isFetching}
        hasMore={hasMore}
        fetchNextPage={fetchNextPage}
        columnDefs={columnDefs}
        visibleColumnDefs={overrides?.visibleColumnDefs ?? visibleColumnDefs}
        isComparison={isComparison}
        scoreRanges={scoreRanges}
        pinnedLeftColumnIds={overrides?.pinnedLeftColumnIds}
        datapointId={datapointId}
        handleRowClick={handleRowClick}
        getRowHref={getRowHref}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSort={handleSort}
        heatmapEnabled={heatmapEnabled}
        onHeatmapEnabledChange={setHeatmapEnabled}
        onDeleteCustomColumn={onDeleteCustomColumn}
        searchValue={searchValue}
        onSearchChange={setSearchAndFilters}
        viewsResource={viewsResource}
      />
    ),
    [
      labeledDatapoints,
      isStatsLoading,
      isLoadingDatapoints,
      isViewLoading,
      isFetching,
      hasMore,
      fetchNextPage,
      columnDefs,
      visibleColumnDefs,
      isComparison,
      scoreRanges,
      datapointId,
      handleRowClick,
      getRowHref,
      sortBy,
      sortDirection,
      handleSort,
      heatmapEnabled,
      setHeatmapEnabled,
      onDeleteCustomColumn,
      searchValue,
      setSearchAndFilters,
      viewsResource,
    ]
  );

  return (
    <>
      <EvaluationHeader
        name={statsData?.evaluation?.name}
        urlKey={statsUrl}
        evaluations={evaluations}
        hasNonBinary={hasNonBinary}
      />
      <div className="flex-1 flex gap-2 flex-col relative overflow-hidden">
        {variant === "morph" ? (
          <MorphLayout
            rows={allDatapoints}
            isLoading={isStatsLoading || isLoadingDatapoints || isViewLoading}
            isFetching={isFetching}
            hasMore={hasMore}
            fetchNextPage={fetchNextPage}
            scoreNames={scoreNames}
            selectedScore={selectedScore}
            onSelectScore={setSelectedScore}
            allStatistics={statsData?.allStatistics}
            comparedAllStatistics={targetStatsData?.allStatistics}
            isComparison={isComparison}
            traceId={traceId}
            datapointId={datapointId}
            onSelectRow={handleSelectEvalRow}
            onCloseTrace={onClose}
            visibleColumnDefs={visibleColumnDefs}
            renderTable={renderTable}
          />
        ) : variant === "bottom-dock" ? (
          <BottomDockLayout
            scoreNames={scoreNames}
            selectedScore={selectedScore}
            onSelectScore={setSelectedScore}
            allStatistics={statsData?.allStatistics}
            comparedAllStatistics={targetStatsData?.allStatistics}
            isComparison={isComparison}
            traceId={traceId}
            onCloseTrace={onClose}
            renderTable={renderTable}
          />
        ) : variant.startsWith("hover-") ? (
          <HoverNavLayout
            mode={variant.slice("hover-".length) as HoverNavMode}
            rows={allDatapoints}
            isLoading={isStatsLoading || isLoadingDatapoints || isViewLoading}
            isFetching={isFetching}
            hasMore={hasMore}
            fetchNextPage={fetchNextPage}
            scoreNames={scoreNames}
            selectedScore={selectedScore}
            onSelectScore={setSelectedScore}
            allStatistics={statsData?.allStatistics}
            comparedAllStatistics={targetStatsData?.allStatistics}
            isComparison={isComparison}
            traceId={traceId}
            datapointId={datapointId}
            onSelectRow={handleSelectEvalRow}
            onCloseTrace={onClose}
            renderTable={renderTable}
          />
        ) : variant === "compact" || isCompactV1 ? (
          <div className="flex flex-col gap-2 flex-1 overflow-hidden px-4 pb-4">
            {/* Score rows stay full-width on top, above the split view. */}
            <MetricsPanel
              scoreNames={scoreNames}
              selectedScore={selectedScore}
              setSelectedScore={setSelectedScore}
              allStatistics={statsData?.allStatistics}
              allDistributions={statsData?.allDistributions}
              comparedAllStatistics={targetStatsData?.allStatistics}
              comparedAllDistributions={targetStatsData?.allDistributions}
              isComparison={!!targetId}
              isLoading={isStatsLoading}
              cardStyle={isCompactV1 ? "classic" : "mini"}
            />
            {/* Split view: when a trace is open, the datapoints table sits on the left
              (~420px, resizable) and the trace view fills the right. Both panels mount
              together so the pixel `defaultSize` on the left is honored; when no trace is
              open the table renders full-width on its own. */}
            {traceId ? (
              <ResizablePanelGroup orientation="horizontal" className="flex-1 overflow-hidden">
                <ResizablePanel id="eval-table" defaultSize={420} minSize={320} className="flex overflow-hidden">
                  {renderTable({ pinnedLeftColumnIds: isCompactV1 ? ["label"] : undefined })}
                </ResizablePanel>
                <ResizableHandle withHandle className="z-30 bg-transparent mx-1.5" />
                <ResizablePanel id="eval-trace" minSize="30%" className="overflow-hidden">
                  <div className="flex flex-col h-full overflow-hidden border rounded-md bg-background">
                    <div className="flex-1 min-h-0 flex overflow-hidden">
                      <TraceView key={traceId} traceId={traceId} onClose={onClose} />
                    </div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            ) : (
              renderTable({ pinnedLeftColumnIds: isCompactV1 ? ["label"] : undefined })
            )}
          </div>
        ) : (
          <TraceFirstLayout
            projectId={params.projectId}
            evaluationId={evaluationId}
            evaluations={evaluations}
            rows={allDatapoints}
            isLoading={isStatsLoading || isLoadingDatapoints || isViewLoading}
            isFetching={isFetching}
            hasMore={hasMore}
            fetchNextPage={fetchNextPage}
            scoreNames={scoreNames}
            selectedScore={selectedScore}
            onSelectScore={setSelectedScore}
            allStatistics={statsData?.allStatistics}
            comparedAllStatistics={targetStatsData?.allStatistics}
            isComparison={isComparison}
            sortBy={sortBy}
            sortDirection={sortDirection as "asc" | "desc" | undefined}
            setSort={setSort}
            searchValue={searchValue}
            onSearchChange={setSearchAndFilters}
            traceId={traceId}
            datapointId={datapointId}
            onSelectRow={handleSelectEvalRow}
            onSelectTrace={handleSelectTrace}
            onCloseTrace={onClose}
            showHistory={variant === "history"}
            showInsights={variant === "patterns"}
            renderTable={renderTable}
            labelsById={labelsById}
          />
        )}
      </div>
      <VariantControlPanel />
    </>
  );
}

export default function Evaluation(props: EvaluationProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const { variant } = usePocVariant();
  const isCompactV1 = variant === "compact-v1";
  const resource = isCompactV1 ? RESOURCE_V1 : RESOURCE;

  const defaultColumnOrder = useMemo(() => {
    const base = isCompactV1 ? ["label", ...BASE_COLUMN_ORDER] : BASE_COLUMN_ORDER;
    return [...base, ...props.initialScoreNames.map((s) => `score:${s}`)];
  }, [props.initialScoreNames, isCompactV1]);

  const defaultColumnVisibility = useMemo(
    () => (isCompactV1 ? Object.fromEntries(V1_HIDDEN_COLUMNS.map((id) => [id, false])) : {}),
    [isCompactV1]
  );

  return (
    <EvalStoreProvider key={props.evaluationId} initialScoreNames={props.initialScoreNames}>
      <InfiniteDataTableProvider
        key={resource}
        views={{ projectId, resource }}
        defaults={{ columnOrder: defaultColumnOrder, columnVisibility: defaultColumnVisibility }}
      >
        <EvaluationContent {...props} />
      </InfiniteDataTableProvider>
    </EvalStoreProvider>
  );
}
