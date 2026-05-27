"use client";
import { type Row } from "@tanstack/react-table";
import { isEmpty, map } from "lodash";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSWRConfig } from "swr";
import { shallow } from "zustand/shallow";

import { useTimeSeriesStatsUrl } from "@/components/charts/time-series-chart/use-time-series-stats-url";
import AdvancedSearch from "@/components/common/advanced-search";
import { useTraceViewNavigation } from "@/components/traces/trace-view/navigation-context";
import TracesChart from "@/components/traces/traces-chart";
import { useTracesStoreContext } from "@/components/traces/traces-store";
import {
  defaultTracesColumnOrder,
  filters as staticFilters,
  PREVIEW_COLUMN,
} from "@/components/traces/traces-table/columns";
import TracesColumnsMenu from "@/components/traces/traces-table/traces-columns-menu";
import {
  buildColumnDefs,
  buildFetchParams,
  toColumnsPayload,
} from "@/components/traces/traces-table/traces-table-store";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { useTableConfigStore, useTableView } from "@/components/ui/infinite-datatable/model/table-config-store";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import DataTableFilter from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button.tsx";
import ViewsToolbar from "@/components/ui/infinite-datatable/views/views-toolbar";
import { Switch } from "@/components/ui/switch";
import { useLocalStorage } from "@/hooks/use-local-storage.tsx";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { useToast } from "@/lib/hooks/use-toast";
import { type TraceRow } from "@/lib/traces/types";

const FETCH_SIZE = 50;
const DEFAULT_TARGET_BARS = 48;

const RESOURCE = "traces";

export default function TracesTable() {
  const { projectId } = useParams();
  return (
    <InfiniteDataTableProvider
      defaults={{ columnOrder: defaultTracesColumnOrder }}
      lockedColumns={["status", "preview"]}
      views={{ projectId: String(projectId), resource: RESOURCE }}
    >
      <TracesTableContent />
    </InfiniteDataTableProvider>
  );
}

function TracesTableContent() {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const { projectId } = useParams();
  const { toast } = useToast();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const { mutate: globalMutate } = useSWRConfig();

  const {
    traceId,
    setTraceId: onRowClick,
    fetchStats,
    incrementStat,
    chartContainerWidth,
    setChartContainerWidth,
    isTraceInTimeRange,
  } = useTracesStoreContext((state) => ({
    traceId: state.traceId,
    setTraceId: state.setTraceId,
    fetchStats: state.fetchStats,
    incrementStat: state.incrementStat,
    chartContainerWidth: state.chartContainerWidth,
    setChartContainerWidth: state.setChartContainerWidth,
    isTraceInTimeRange: state.isTraceInTimeRange,
  }));

  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const pastHours = searchParams.get("pastHours");
  const searchIn = searchParams.getAll("searchIn");

  const { effective, isLoading: isViewLoading, setSort, setSearchAndFilters } = useTableView();

  // Wire-shape: filters as JSON-encoded strings (matches the API + URL convention).
  const filter = useMemo(() => effective.filters.map((f) => JSON.stringify(f)), [effective.filters]);
  const textSearchFilter = effective.search.length > 0 ? effective.search : null;
  const sortBy = effective.sortBy ?? undefined;
  const sortDirection = (effective.sortDirection ?? undefined) as "asc" | "desc" | undefined;

  const [realtimeEnabled, setRealtimeEnabled] = useLocalStorage("traces-table:realtime", false);

  const { setNavigationRefList } = useTraceViewNavigation();
  const isCurrentTimestampIncluded = !!pastHours || (!!endDate && new Date(endDate) >= new Date());

  const { customColumns, removeCustomColumn } = useTableConfigStore(
    (s) => ({
      customColumns: s.config.customColumns,
      removeCustomColumn: s.removeCustomColumn,
    }),
    shallow
  );

  const columnDefs = useMemo(() => buildColumnDefs(customColumns), [customColumns]);

  // Merge static filter definitions with custom column filters.
  const allFilters = useMemo<ColumnFilter[]>(() => {
    const customColumnFilters: ColumnFilter[] = customColumns.map((cc) => ({
      name: cc.name,
      key: `custom:${cc.name}`,
      dataType: cc.dataType === "number" ? ("number" as const) : ("string" as const),
    }));
    return [...staticFilters, ...customColumnFilters];
  }, [customColumns]);

  // SQL strings from column defs — only changes when columns structurally change.
  // useInfiniteScroll uses JSON.stringify on deps, so identical SQL strings
  // produce the same string → no spurious re-fetch.
  const columnSqls = useMemo(() => columnDefs.map((c) => c.meta?.sql).filter(Boolean), [columnDefs]);

  const isSearchActive = typeof textSearchFilter === "string" && textSearchFilter.length > 0;

  const effectiveColumns = useMemo(() => {
    if (!isSearchActive) return columnDefs;
    const statusIdx = columnDefs.findIndex((c) => c.id === "status");
    const cols = [...columnDefs];
    cols.splice(statusIdx + 1, 0, PREVIEW_COLUMN);
    return cols;
  }, [columnDefs, isSearchActive]);

  // "preview" is only mounted when search is active, so the pin list is conditional.
  const pinnedColumns = useMemo(() => (isSearchActive ? ["status", "preview"] : ["status"]), [isSearchActive]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        setChartContainerWidth(width);
      }
    });

    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [setChartContainerWidth]);

  // Build custom columns JSON for the stats endpoint so custom column filters
  // can be resolved server-side.
  const customColumnsJson = useMemo(() => {
    const customCols = toColumnsPayload(columnDefs.filter((c) => c.meta?.isCustom));
    return customCols.length > 0 ? JSON.stringify(customCols) : undefined;
  }, [columnDefs]);

  const statsUrl = useTimeSeriesStatsUrl({
    baseUrl: `/api/projects/${projectId}/traces/stats`,
    chartContainerWidth,
    pastHours,
    startDate,
    endDate,
    filters: filter,
    additionalParams: {
      ...(textSearchFilter && { search: textSearchFilter }),
      ...(searchIn.length > 0 && { searchIn }),
      ...(customColumnsJson && { customColumns: customColumnsJson }),
    },
    defaultTargetBars: DEFAULT_TARGET_BARS,
  });

  const fetchTraces = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = buildFetchParams(
          {
            pageNumber,
            pageSize: FETCH_SIZE,
            filter,
            sortBy: sortBy ?? null,
            sortDirection: sortDirection?.toUpperCase() as string | null,
          },
          columnDefs
        );

        if (pastHours != null) urlParams.set("pastHours", pastHours);
        if (startDate != null) urlParams.set("startDate", startDate);
        if (endDate != null) urlParams.set("endDate", endDate);

        if (typeof textSearchFilter === "string" && textSearchFilter.length > 0) {
          urlParams.set("search", textSearchFilter);
        }

        if (isEmpty(searchIn) || searchIn?.length === 2) {
          urlParams.append("searchIn", "input");
          urlParams.append("searchIn", "output");
        } else if (searchIn?.length > 0) {
          urlParams.set("searchIn", searchIn[0]);
        }

        const url = `/api/projects/${projectId}/traces?${urlParams.toString()}`;

        const res = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          const text = (await res.json()) as { error: string };
          throw new Error(text.error);
        }

        const data = (await res.json()) as { items: TraceRow[] };

        data.items.map((trace) =>
          globalMutate(`/api/projects/${projectId}/traces/${trace.id}/tags`, trace.traceTags ?? [], {
            revalidate: false,
          })
        );

        return { items: data.items, count: 0 };
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to load traces. Please try again.",
          variant: "destructive",
        });
        throw error;
      }
    },
    [
      columnDefs,
      endDate,
      filter,
      pastHours,
      projectId,
      searchIn,
      sortBy,
      sortDirection,
      startDate,
      textSearchFilter,
      toast,
      globalMutate,
    ]
  );

  const {
    data: traces,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
    refetch,
    updateData,
  } = useInfiniteScroll<TraceRow>({
    fetchFn: fetchTraces,
    enabled: !!(pastHours || (startDate && endDate)),
    deps: [
      endDate,
      filter,
      pastHours,
      projectId,
      searchIn,
      sortBy,
      sortDirection,
      startDate,
      textSearchFilter,
      columnSqls,
    ],
  });

  useEffect(() => {
    setNavigationRefList(map(traces, "id"));
  }, [setNavigationRefList, traces]);

  useEffect(() => {
    if (isViewLoading) return;
    if (statsUrl) {
      fetchStats(statsUrl);
    }
  }, [isViewLoading, statsUrl, fetchStats]);

  const updateRealtimeTrace = useCallback(
    (traceData: TraceRow) => {
      if (!traceData.startTime || !isTraceInTimeRange(traceData.startTime)) {
        return;
      }

      updateData((currentTraces) => {
        if (!currentTraces || currentTraces.length === 0) return currentTraces;

        const existingTraceIndex = currentTraces.findIndex((trace) => trace.id === traceData.id);

        if (existingTraceIndex !== -1) {
          const newTraces = [...currentTraces];
          newTraces[existingTraceIndex] = traceData;
          return newTraces;
        } else {
          const newTraces = [traceData, ...currentTraces];

          if (newTraces.length > FETCH_SIZE) {
            newTraces.splice(FETCH_SIZE);
          }

          if (traceData.startTime) {
            incrementStat(traceData.startTime, traceData.status === "error");
          }

          return newTraces;
        }
      });
    },
    [updateData, isTraceInTimeRange, incrementStat]
  );

  const eventHandlers = useMemo(
    () => ({
      trace_update: (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.traces && Array.isArray(payload.traces)) {
            for (const trace of payload.traces) {
              updateRealtimeTrace({ ...trace, spanTags: trace.tags ?? [] });
            }
          }
        } catch (e) {
          console.warn("Failed to parse realtime trace: ", e);
        }
      },
    }),
    [updateRealtimeTrace]
  );

  useRealtime({
    key: "traces",
    projectId: projectId as string,
    enabled: realtimeEnabled && filter.length === 0 && !textSearchFilter && isCurrentTimestampIncluded,
    eventHandlers,
  });

  useEffect(() => {
    if (!pastHours && !startDate && !endDate) {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("pastHours", "24");
      router.replace(`${pathName}?${sp.toString()}`);
    }
  }, [pastHours, startDate, endDate, searchParams, pathName, router]);

  const handleRefresh = useCallback(() => {
    refetch();
    if (statsUrl) {
      fetchStats(statsUrl);
    }
  }, [refetch, statsUrl, fetchStats]);

  const handleRowClick = useCallback(
    (row: Row<TraceRow>) => {
      onRowClick?.(row.id);
    },
    [onRowClick]
  );

  // Auto-open the chat panel for traces with meaningful LLM activity.
  const getRowHref = useCallback(
    (row: Row<TraceRow>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("traceId", row.id);
      params.delete("spanId");
      if (row.original.totalTokens > 1000) {
        params.set("chat", "true");
      } else {
        params.delete("chat");
      }
      return `${pathName}?${params.toString()}`;
    },
    [pathName, searchParams]
  );

  const handleSort = useCallback(
    (columnId: string, direction: "asc" | "desc") => {
      setSort(columnId || null, columnId ? direction : null);
    },
    [setSort]
  );

  // Controlled AdvancedSearch — `value` flows in, `onChange` writes URL via
  // the view layer. No `mode` prop, no key-remount; when the view changes
  // or the user discards, `value` updates and the search bar reflows.
  const searchValue = useMemo(
    () => ({ filters: effective.filters, search: effective.search }),
    [effective.filters, effective.search]
  );

  const columnLabels = useMemo(
    () =>
      columnDefs.map((column) => ({
        id: column.id!,
        label: typeof column.header === "string" ? column.header : column.id!,
        ...(column.id!.startsWith("custom:") && {
          onDelete: () => removeCustomColumn(column.id!.replace("custom:", "")),
        }),
      })),
    [columnDefs, removeCustomColumn]
  );

  return (
    <div className="flex flex-1 overflow-hidden px-4 pb-4">
      <InfiniteDataTable<TraceRow>
        className="w-full"
        columns={effectiveColumns}
        data={traces}
        getRowId={(trace) => trace.id}
        onRowClick={handleRowClick}
        focusedRowId={traceId || searchParams.get("traceId")}
        hasMore={!textSearchFilter && hasMore}
        isFetching={isFetching}
        isLoading={isLoading || isViewLoading}
        fetchNextPage={fetchNextPage}
        getRowHref={getRowHref}
        pinnedColumns={pinnedColumns}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSort={handleSort}
      >
        <div className="flex flex-1 w-full h-full gap-2">
          <DataTableFilter columns={allFilters} />
          <TracesColumnsMenu columnLabels={columnLabels} columnDefs={columnDefs} />
          <ViewsToolbar projectId={String(projectId)} resource={RESOURCE} />
          <DateRangeFilter />
          <RefreshButton onClick={handleRefresh} variant="outline" />
          <div className="flex items-center gap-2 px-2 border rounded-md bg-background h-7">
            <Switch id="realtime" checked={realtimeEnabled} onCheckedChange={setRealtimeEnabled} />
            <span className="text-xs cursor-pointer font-medium text-secondary-foreground">Realtime</span>
          </div>
        </div>
        <div className="w-full px-px">
          <AdvancedSearch
            value={searchValue}
            onChange={setSearchAndFilters}
            filters={allFilters}
            storageKey={`traces-${projectId}`}
            resource="traces"
            placeholder="Search by root span name, tokens, tags, full text and more..."
            className="w-full flex-1"
          />
        </div>
        <TracesChart className="w-full bg-secondary rounded border p-2" containerRef={chartContainerRef} />
      </InfiniteDataTable>
    </div>
  );
}
