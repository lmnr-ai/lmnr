"use client";
import { type Row } from "@tanstack/react-table";
import { isEmpty, map } from "lodash";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { useTimeSeriesStatsUrl } from "@/components/charts/time-series-chart/use-time-series-stats-url";
import { useTraceViewNavigation } from "@/components/traces/trace-view/navigation-context";
import TracesChart from "@/components/traces/traces-chart";
import { useTracesStoreContext } from "@/components/traces/traces-store";
import { columns, defaultTracesColumnOrder, filters } from "@/components/traces/traces-table/columns";
import SearchTracesInput from "@/components/traces/traces-table/search";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button.tsx";
import { Switch } from "@/components/ui/switch";
import { useLocalStorage } from "@/hooks/use-local-storage.tsx";
import { type Filter } from "@/lib/actions/common/filters";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { useToast } from "@/lib/hooks/use-toast";
import { type TraceRow } from "@/lib/traces/types";

const presetFilters: Filter[] = [];

const FETCH_SIZE = 50;
const DEFAULT_TARGET_BARS = 48;

export default function TracesTable() {
  return (
    <DataTableStateProvider storageKey="traces-table" defaultColumnOrder={defaultTracesColumnOrder}>
      <TracesTableContent />
    </DataTableStateProvider>
  );
}

function TracesTableContent() {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const { projectId } = useParams();
  const { toast } = useToast();
  const chartContainerRef = useRef<HTMLDivElement>(null);

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

  const filter = searchParams.getAll("filter");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const pastHours = searchParams.get("pastHours");
  const textSearchFilter = searchParams.get("search");
  const searchIn = searchParams.getAll("searchIn");

  const [realtimeEnabled, setRealtimeEnabled] = useLocalStorage("traces-table:realtime", false);

  const { setNavigationRefList } = useTraceViewNavigation();
  const isCurrentTimestampIncluded = !!pastHours || (!!endDate && new Date(endDate) >= new Date());

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
    },
    defaultTargetBars: DEFAULT_TARGET_BARS,
  });

  const fetchTraces = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());

        if (pastHours != null) urlParams.set("pastHours", pastHours);
        if (startDate != null) urlParams.set("startDate", startDate);
        if (endDate != null) urlParams.set("endDate", endDate);

        filter.forEach((filter) => urlParams.append("filter", filter));

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
    [endDate, filter, pastHours, projectId, searchIn, startDate, textSearchFilter, toast]
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
    deps: [endDate, filter, pastHours, projectId, searchIn, startDate, textSearchFilter],
  });

  useEffect(() => {
    setNavigationRefList(map(traces, "id"));
  }, [setNavigationRefList, traces]);

  useEffect(() => {
    if (statsUrl) {
      fetchStats(statsUrl);
    }
  }, [statsUrl, fetchStats]);

  const updateRealtimeTrace = useCallback(
    (traceData: TraceRow) => {
      if (!traceData.startTime || !isTraceInTimeRange(traceData.startTime)) {
        return;
      }

      updateData((currentTraces) => {
        if (!currentTraces || currentTraces.length === 0) return currentTraces;

        const existingTraceIndex = currentTraces.findIndex((trace) => trace.id === traceData.id);

        if (existingTraceIndex !== -1) {
          // Update existing trace
          const newTraces = [...currentTraces];
          newTraces[existingTraceIndex] = traceData;
          return newTraces;
        } else {
          // New trace - insert at the beginning
          const newTraces = [traceData, ...currentTraces];

          // Keep only the first FETCH_SIZE traces
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
    [updateData, isTraceInTimeRange]
  );

  const eventHandlers = useMemo(
    () => ({
      trace_update: (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.traces && Array.isArray(payload.traces)) {
            for (const trace of payload.traces) {
              updateRealtimeTrace(trace);
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

      const currentFilters = searchParams.getAll("filter");
      if (currentFilters.length === 0 && presetFilters.length > 0) {
        presetFilters.forEach((filter) => {
          sp.append("filter", JSON.stringify(filter));
        });
      }

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

  const getRowHref = useCallback(
    (row: Row<TraceRow>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("traceId", row.id);
      params.delete("spanId");
      return `${pathName}?${params.toString()}`;
    },
    [pathName, searchParams]
  );

  return (
    <div className="flex flex-1 overflow-hidden px-4 pb-4">
      <InfiniteDataTable<TraceRow>
        className="w-full"
        columns={columns}
        data={traces}
        getRowId={(trace) => trace.id}
        onRowClick={handleRowClick}
        focusedRowId={traceId || searchParams.get("traceId")}
        hasMore={!textSearchFilter && hasMore}
        isFetching={isFetching}
        isLoading={isLoading}
        fetchNextPage={fetchNextPage}
        getRowHref={getRowHref}
        lockedColumns={["status"]}
      >
        <div className="flex flex-1 pt-1 w-full h-full gap-2">
          <DataTableFilter presetFilters={presetFilters} columns={filters} />
          <ColumnsMenu
            lockedColumns={["status"]}
            columnLabels={columns.map((column) => ({
              id: column.id!,
              label: typeof column.header === "string" ? column.header : column.id!,
            }))}
          />
          <DateRangeFilter />
          <RefreshButton onClick={handleRefresh} variant="outline" />
          <div className="flex items-center gap-2 px-2 border rounded-md bg-background h-7">
            <Switch id="realtime" checked={realtimeEnabled} onCheckedChange={setRealtimeEnabled} />
            <span className="text-xs cursor-pointer font-medium text-secondary-foreground">Realtime</span>
          </div>
          <SearchTracesInput />
        </div>
        <DataTableFilterList />
        <TracesChart className="w-full bg-secondary rounded border p-2" containerRef={chartContainerRef} />
      </InfiniteDataTable>
    </div>
  );
}
