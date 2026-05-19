import { type Row } from "@tanstack/react-table";
import { debounce } from "lodash";
import { Settings as SettingsIcon } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import useSWR from "swr";
import { useStore } from "zustand";
import { shallow } from "zustand/shallow";

import AdvancedSearch from "@/components/common/advanced-search";
import EvalColumnsMenu from "@/components/evaluation/eval-columns-menu";
import {
  buildColumnDefs,
  buildFetchParams,
  buildStatsParams,
  selectVisibleColumnDefs,
  useEvalStore,
} from "@/components/evaluation/store";
import {
  type EvaluationStatsPayload,
  flattenScores,
  mergeDatapointUpsertIntoRows,
  mergeTraceUpdateIntoRows,
} from "@/components/evaluation/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { useDataTableStore } from "@/components/ui/infinite-datatable/model/datatable-store";
import DataTableFilter from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { Switch } from "@/components/ui/switch";
import { type EvalRow, type EvaluationResultsInfo } from "@/lib/evaluation/types";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { swrFetcher } from "@/lib/utils";

import EvalTableSkeleton from "./eval-table-skeleton";

const PAGE_SIZE = 50;

export interface EvaluationDatapointsTableContentProps {
  evaluationId: string;
  /** Use the eval-specific URL builder. Shared eval substitutes its own. */
  buildDatapointsUrl: (qs: string) => string;
  buildStatsUrl?: (qs: string) => string;
  /** Disable realtime for shared eval. */
  enableRealtime?: boolean;
  handleRowClick: (row: Row<EvalRow>) => void;
  getRowHref?: (row: Row<EvalRow>) => string;
  datapointId?: string;
  onStatsLoaded?: (stats: EvaluationStatsPayload | undefined) => void;
  onTargetStatsLoaded?: (stats: EvaluationStatsPayload | undefined) => void;
  onSelectedRowChange?: (row: EvalRow | undefined) => void;
  /** When true the parent is still loading (e.g. score-name fetch). Skip table render. */
  isParentLoading?: boolean;
}

const EvaluationDatapointsTableContent = ({
  evaluationId,
  buildDatapointsUrl,
  buildStatsUrl,
  enableRealtime = true,
  handleRowClick,
  getRowHref,
  datapointId,
  onStatsLoaded,
  onTargetStatsLoaded,
  onSelectedRowChange,
  isParentLoading = false,
}: EvaluationDatapointsTableContentProps) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { projectId } = useParams<{ projectId: string }>();

  const search = searchParams.get("search");
  const filter = searchParams.getAll("filter");
  const sortBy = searchParams.get("sortBy");
  const sortDirection = searchParams.get("sortDirection");
  const targetId = searchParams.get("targetId");

  // Eval store: flags + score names. customColumns moved to DataTableStore.
  const isComparison = useEvalStore((s) => s.isComparison);
  const isShared = useEvalStore((s) => s.isShared);
  const heatmapEnabled = useEvalStore((s) => s.heatmapEnabled);
  const scoreRanges = useEvalStore((s) => s.scoreRanges);
  const setHeatmapEnabled = useEvalStore((s) => s.setHeatmapEnabled);
  const setScoreRanges = useEvalStore((s) => s.setScoreRanges);
  const scoreNames = useEvalStore((s) => s.scoreNames);
  const addScoreName = useEvalStore((s) => s.addScoreName);
  const setIsComparison = useEvalStore((s) => s.setIsComparison);

  // customColumns now live in DataTableStore — single source of truth per table.
  const datatableStore = useDataTableStore<EvalRow>();
  const { customColumns, removeCustomColumn } = useStore(
    datatableStore,
    (s) => ({ customColumns: s.customColumns, removeCustomColumn: s.removeCustomColumn }),
    shallow
  );

  const columnDefs = useMemo(
    () => buildColumnDefs({ scoreNames, customColumns, isShared }),
    [scoreNames, customColumns, isShared]
  );

  // Sync comparison state from URL
  useEffect(() => {
    setIsComparison(!!targetId);
  }, [targetId, setIsComparison]);

  // SQL strings — only changes when columns structurally change. JSON.stringify
  // on deps means identical SQL produces identical strings, no spurious refetch.
  const columnSqls = useMemo(() => columnDefs.map((c) => c.meta?.sql).filter(Boolean), [columnDefs]);

  const statsUrl = useMemo(() => {
    if (!buildStatsUrl) return null;
    const urlParams = buildStatsParams({ search, filter, sortBy, sortDirection }, columnDefs, scoreNames);
    return buildStatsUrl(urlParams.toString());
  }, [buildStatsUrl, search, filter, sortBy, sortDirection, columnDefs, scoreNames]);

  const {
    data: statsData,
    isLoading: isStatsLoading,
    mutate: mutateStats,
  } = useSWR<EvaluationStatsPayload>(statsUrl, swrFetcher, { revalidateOnFocus: false });

  const targetStatsUrl = useMemo(() => {
    if (!buildStatsUrl || !targetId) return null;
    const base = `/api/projects/${projectId}/evaluations/${targetId}/stats`;
    const urlParams = buildStatsParams({ search, filter, sortBy, sortDirection }, columnDefs, scoreNames);
    const qs = urlParams.toString();
    return qs ? `${base}?${qs}` : base;
  }, [buildStatsUrl, targetId, projectId, search, filter, sortBy, sortDirection, columnDefs, scoreNames]);

  const { data: targetStatsData } = useSWR<EvaluationStatsPayload>(targetStatsUrl, swrFetcher, {
    revalidateOnFocus: false,
  });

  useEffect(() => {
    onStatsLoaded?.(statsData);
  }, [statsData, onStatsLoaded]);

  useEffect(() => {
    onTargetStatsLoaded?.(targetStatsData);
  }, [targetStatsData, onTargetStatsLoaded]);

  const fetchDatapoints = useCallback(
    async (pageNumber: number) => {
      const urlParams = buildFetchParams(
        { search, filter, sortBy, sortDirection, targetId, pageNumber, pageSize: PAGE_SIZE },
        columnDefs
      );
      const url = buildDatapointsUrl(urlParams.toString());
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch datapoints.");
      }
      const data: EvaluationResultsInfo = await response.json();
      return { items: data.results, count: 0 };
    },
    [buildDatapointsUrl, search, filter, sortBy, sortDirection, targetId, columnDefs]
  );

  const {
    data: allDatapoints,
    hasMore: hasMorePages,
    isFetching: isFetchingPage,
    isLoading: isLoadingDatapoints,
    fetchNextPage,
    updateData,
  } = useInfiniteScroll<EvalRow>({
    fetchFn: fetchDatapoints,
    enabled: !buildStatsUrl || !isStatsLoading,
    deps: [search, filter, evaluationId, sortBy, sortDirection, targetId, columnSqls],
  });

  const selectedRow = useMemo<EvalRow | undefined>(
    () => allDatapoints?.find((row) => row["id"] === datapointId),
    [allDatapoints, datapointId]
  );

  useEffect(() => {
    onSelectedRowChange?.(selectedRow);
  }, [selectedRow, onSelectedRowChange]);

  // Score-range heatmap input — recomputed from data on every refetch.
  useEffect(() => {
    if (!allDatapoints) return;

    const isValidNumber = (value: unknown): value is number => typeof value === "number" && !isNaN(value);

    const ranges = scoreNames.reduce(
      (acc, scoreName) => {
        const allValues = allDatapoints
          .flatMap((row: EvalRow) => {
            const values = [row[`score:${scoreName}`]];
            if (targetId) {
              values.push(row[`compared:score:${scoreName}`]);
            }
            return values;
          })
          .filter(isValidNumber);

        return allValues.length > 0
          ? {
              ...acc,
              [scoreName]: {
                min: Math.min(...allValues),
                max: Math.max(...allValues),
              },
            }
          : acc;
      },
      {} as Record<string, { min: number; max: number }>
    );

    setScoreRanges(ranges);
  }, [allDatapoints, scoreNames, targetId, setScoreRanges]);

  const debouncedRevalidateStats = useMemo(
    () => debounce(() => mutateStats(), 1000, { leading: false, trailing: true }),
    [mutateStats]
  );
  useEffect(() => () => debouncedRevalidateStats.cancel(), [debouncedRevalidateStats]);

  const mergeDatapointUpsert = useCallback(
    (incoming: EvalRow & { id: string }) => {
      if (targetId) return;
      const flattened = flattenScores(incoming["scores"]);
      updateData((rows) => mergeDatapointUpsertIntoRows(rows, incoming, flattened));
      if (Object.keys(flattened).length === 0) return;
      Object.keys(flattened).forEach((key) => addScoreName(key.slice("score:".length)));
      debouncedRevalidateStats();
    },
    [updateData, targetId, addScoreName, debouncedRevalidateStats]
  );

  const mergeTraceUpdate = useCallback(
    (trace: Record<string, unknown> & { id: string }) => {
      if (targetId) return;
      updateData((rows) => mergeTraceUpdateIntoRows(rows, trace));
    },
    [updateData, targetId]
  );

  const realtimeHandlers = useMemo(
    () => ({
      datapoint_upsert: (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data) as { datapoints?: Array<EvalRow & { id: string }> };
          payload.datapoints?.forEach(mergeDatapointUpsert);
        } catch (e) {
          console.warn("Failed to parse realtime datapoint_upsert:", e);
        }
      },
      trace_update: (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data) as {
            traces?: Array<Record<string, unknown> & { id: string }>;
          };
          payload.traces?.forEach(mergeTraceUpdate);
        } catch (e) {
          console.warn("Failed to parse realtime trace_update:", e);
        }
      },
    }),
    [mergeDatapointUpsert, mergeTraceUpdate]
  );

  useRealtime({
    key: `evaluation_${evaluationId}`,
    projectId: projectId,
    enabled: enableRealtime && !targetId,
    eventHandlers: realtimeHandlers,
  });

  const handleSort = useCallback(
    (columnId: string, direction: "asc" | "desc") => {
      const params = new URLSearchParams(searchParams.toString());
      if (columnId) {
        params.set("sortBy", columnId);
        params.set("sortDirection", direction.toUpperCase());
      } else {
        params.delete("sortBy");
        params.delete("sortDirection");
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [searchParams, router, pathname]
  );

  const visibleColumns = useMemo(() => selectVisibleColumnDefs(columnDefs, isComparison), [columnDefs, isComparison]);
  const tableMeta = useMemo(
    () => ({ evalCellMeta: { isComparison, isShared, heatmapEnabled, scoreRanges } }),
    [isComparison, isShared, heatmapEnabled, scoreRanges]
  );

  const columnFilters = useMemo(
    () =>
      columnDefs
        .filter((c) => c.meta?.filterable)
        .map((c) => ({
          key: c.id!,
          name: typeof c.header === "string" ? c.header : c.id!,
          dataType:
            c.meta!.dataType === "json"
              ? ("json" as const)
              : c.meta!.dataType === "number"
                ? ("number" as const)
                : ("string" as const),
        })),
    [columnDefs]
  );

  if (isParentLoading || (buildStatsUrl && isStatsLoading) || isLoadingDatapoints) {
    return <EvalTableSkeleton />;
  }

  return (
    <div className="flex overflow-hidden flex-1">
      <InfiniteDataTable
        columns={visibleColumns}
        data={allDatapoints ?? []}
        meta={tableMeta}
        hasMore={!search && hasMorePages}
        isFetching={isFetchingPage}
        isLoading={false}
        fetchNextPage={fetchNextPage}
        getRowId={(row) => row["id"] as string}
        focusedRowId={datapointId}
        onRowClick={handleRowClick}
        getRowHref={getRowHref}
        className="flex-1"
        sortBy={sortBy ?? undefined}
        sortDirection={(sortDirection?.toLowerCase() ?? undefined) as "asc" | "desc" | undefined}
        onSort={handleSort}
      >
        <div className="flex flex-1 w-full space-x-2">
          <DataTableFilter columns={columnFilters} />
          <EvalColumnsMenu
            columnDefs={columnDefs}
            columnLabels={visibleColumns.map((column) => ({
              id: column.id!,
              label: typeof column.header === "string" ? column.header : column.id!,
              ...(column.id!.startsWith("custom:") && {
                onDelete: () => removeCustomColumn(column.id!.replace("custom:", "")),
              }),
            }))}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-7 w-7" variant="outline" size="icon">
                <SettingsIcon className="h-4 w-4 text-secondary-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel className="text-xs font-medium">Settings</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="flex items-center justify-between px-2 py-2">
                <div className="flex flex-col">
                  <span className="text-xs">Scores Heatmap</span>
                  <span className="text-xs text-muted-foreground">Color-code score values</span>
                </div>
                <Switch checked={heatmapEnabled} onCheckedChange={setHeatmapEnabled} />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="w-full">
          <AdvancedSearch
            storageKey={`evaluation-datapoints-${projectId}`}
            filters={columnFilters}
            placeholder="Search in data, targets, scores and spans..."
            className="w-full flex-1"
          />
        </div>
      </InfiniteDataTable>
    </div>
  );
};

export default EvaluationDatapointsTableContent;
