"use client";
import { type Row } from "@tanstack/react-table";
import { isEmpty, map } from "lodash";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";

import { useTimeSeriesStatsUrl } from "@/components/charts/time-series-chart/use-time-series-stats-url";
import AdvancedSearch from "@/components/common/advanced-search";
import { useTraceViewNavigation } from "@/components/traces/trace-view/navigation-context";
import TracesChart from "@/components/traces/traces-chart";
import { useTracesStoreContext } from "@/components/traces/traces-store";
import { defaultTracesColumnOrder, filters } from "@/components/traces/traces-table/columns";
import TracesColumnsMenu from "@/components/traces/traces-table/traces-columns-menu";
import { useTracesTableStore } from "@/components/traces/traces-table/traces-table-store";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider, useDataTableStore } from "@/components/ui/infinite-datatable/model/datatable-store";
import DataTableFilter from "@/components/ui/infinite-datatable/ui/datatable-filter";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button.tsx";
import { Switch } from "@/components/ui/switch";
import { useLocalStorage } from "@/hooks/use-local-storage.tsx";
import { useRealtime } from "@/lib/hooks/use-realtime";
import { useToast } from "@/lib/hooks/use-toast";
import { type TraceRow } from "@/lib/traces/types";

const FETCH_SIZE = 50;
const DEFAULT_TARGET_BARS = 48;

export default function TracesTable() {
  const customColumns = useTracesTableStore((s) => s.customColumns);
  const defaultColumnOrder = useMemo(
    () => [...defaultTracesColumnOrder, ...customColumns.map((cc) => `custom:${cc.name}`)],
    [customColumns]
  );

  return (
    <DataTableStateProvider storageKey="traces-table" defaultColumnOrder={defaultColumnOrder}>
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
  const sortBy = searchParams.get("sortBy") ?? undefined;
  const sortDirection = (searchParams.get("sortDirection")?.toLowerCase() ?? undefined) as "asc" | "desc" | undefined;

  const [realtimeEnabled, setRealtimeEnabled] = useLocalStorage("traces-table:realtime", false);

  const { setNavigationRefList } = useTraceViewNavigation();
  const isCurrentTimestampIncluded = !!pastHours || (!!endDate && new Date(endDate) >= new Date());

  // Initialize column defs (rebuild when store hydrates custom columns)
  const rebuildColumns = useTracesTableStore((s) => s.rebuildColumns);
  const columnDefs = useTracesTableStore((s) => s.columnDefs);
  const removeCustomColumn = useTracesTableStore((s) => s.removeCustomColumn);
  const buildFetchParams = useTracesTableStore((s) => s.buildFetchParams);

  const customColumns = useTracesTableStore((s) => s.customColumns);

  useEffect(() => {
    rebuildColumns();
  }, [customColumns, rebuildColumns]);

  // SQL strings from column defs — only changes when columns structurally change.
  // useInfiniteScroll uses JSON.stringify on deps, so identical SQL strings
  // produce the same string → no spurious re-fetch.
  const columnSqls = useMemo(() => columnDefs.map((c) => c.meta?.sql).filter(Boolean), [columnDefs]);

  // Sync datatable columnOrder with traces store columnDefs
  const datatableStore = useDataTableStore();
  const { columnOrder, setColumnOrder } = useStore(datatableStore, (s) => ({
    columnOrder: s.columnOrder,
    setColumnOrder: s.setColumnOrder,
  }));

  useEffect(() => {
    // Skip sync before the store has hydrated columnDefs to avoid wiping saved column order.
    if (columnDefs.length === 0) return;

    const visibleIds = columnDefs.map((c) => c.id!);
    const currentSet = new Set(columnOrder);
    const defSet = new Set(visibleIds);

    const toAdd = visibleIds.filter((id) => !currentSet.has(id));
    const toRemove = columnOrder.filter((id) => !defSet.has(id));

    if (toAdd.length > 0 || toRemove.length > 0) {
      const filtered = columnOrder.filter((id) => defSet.has(id));
      setColumnOrder([...filtered, ...toAdd]);
    }
  }, [columnDefs, columnOrder, setColumnOrder]);

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
    defaultTargetBars: DEFAULT_TARGET_BARS,
  });

  // Stores search trace IDs from the traces fetch response so the stats
  // endpoint can reuse them instead of making a duplicate search call.
  // - undefined: no search active, stats fetched normally via GET
  // - null: search active but traces haven't returned yet — skip stats fetch
  // - string[]: search completed, pass IDs to stats endpoint via POST
  const [searchTraceIds, setSearchTraceIds] = useState<string[] | null | undefined>(
    textSearchFilter ? null : undefined
  );

  // Synchronous mirror of the searchTraceIds pending state. Set to true
  // when we know a reset is needed but the state update hasn't applied yet.
  // Checked by the stats effect to avoid firing with stale IDs in the same
  // render cycle that triggers a reset.
  const searchTraceIdsPendingResetRef = useRef(false);

  // Monotonically increasing counter that tracks each new traces fetch.
  // Used to discard stale responses when parameters change mid-flight.
  const fetchVersionRef = useRef(0);

  // Bumped on manual refresh to retrigger the stats effect even when
  // searchTraceIds doesn't change (e.g. no active search).
  const [refreshCounter, setRefreshCounter] = useState(0);

  const fetchTraces = useCallback(
    async (pageNumber: number) => {
      const version = ++fetchVersionRef.current;
      try {
        const urlParams = buildFetchParams({
          pageNumber,
          pageSize: FETCH_SIZE,
          filter,
          sortBy: sortBy ?? null,
          sortDirection: sortDirection?.toUpperCase() as string | null,
        });

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

        const data = (await res.json()) as { items: TraceRow[]; searchTraceIds?: string[] };
        // Only update searchTraceIds if no newer fetch has started,
        // preventing stale responses from overwriting the current state.
        if (fetchVersionRef.current === version) {
          setSearchTraceIds(data.searchTraceIds);
        }
        return { items: data.items, count: 0 };
      } catch (error) {
        // Unblock the stats effect so it isn't permanently stuck at null.
        // An empty array signals "search completed with no results", which
        // causes stats to render empty — consistent with the failed table.
        if (fetchVersionRef.current === version) {
          setSearchTraceIds(textSearchFilter ? [] : undefined);
        }
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to load traces. Please try again.",
          variant: "destructive",
        });
        throw error;
      }
    },
    [
      buildFetchParams,
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

  // Reset searchTraceIds when any search-affecting parameter changes so
  // stats wait for the new traces fetch instead of using stale IDs.
  useEffect(() => {
    // The pending-reset flag prevents the stats effect from firing with
    // stale IDs in the same render cycle. Only set it when:
    // 1. A search is active (otherwise searchTraceIds is undefined and
    //    the flag would never be cleared since setSearchTraceIds is a no-op).
    // 2. searchTraceIds is not already null — if it's null, the stats
    //    effect already skips via the !== null guard, so the flag is
    //    unnecessary. Setting it anyway would leave it unconsumed (since
    //    setSearchTraceIds(null) is a no-op that triggers no re-render)
    //    and it would incorrectly block the next stats fetch.
    if (textSearchFilter && searchTraceIds !== null) {
      searchTraceIdsPendingResetRef.current = true;
    }
    setSearchTraceIds(textSearchFilter ? null : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textSearchFilter, pastHours, startDate, endDate, JSON.stringify(searchIn)]);

  useEffect(() => {
    // When a reset is pending, the searchTraceIds state update hasn't
    // applied yet — skip to avoid firing with stale IDs. The state change
    // will retrigger this effect in the next render.
    if (searchTraceIdsPendingResetRef.current) {
      searchTraceIdsPendingResetRef.current = false;
      return;
    }
    // When searchTraceIds is null, a search is active but traces haven't
    // returned yet — wait before fetching stats to avoid a race condition.
    if (statsUrl && searchTraceIds !== null) {
      fetchStats(statsUrl, searchTraceIds);
    }
  }, [statsUrl, fetchStats, searchTraceIds, refreshCounter]);

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
      router.replace(`${pathName}?${sp.toString()}`);
    }
  }, [pastHours, startDate, endDate, searchParams, pathName, router]);

  const handleRefresh = useCallback(() => {
    if (textSearchFilter) {
      // Block the stats effect until the traces refetch provides fresh IDs,
      // preventing a double fetch from stale IDs followed by new ones.
      setSearchTraceIds(null);
    } else {
      // No search active — bump counter to retrigger the stats effect since
      // searchTraceIds stays undefined and wouldn't retrigger on its own.
      setRefreshCounter((c) => c + 1);
    }
    refetch();
  }, [refetch, textSearchFilter]);

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
      router.push(`${pathName}?${params.toString()}`);
    },
    [searchParams, router, pathName]
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
        columns={columnDefs.length > 0 ? columnDefs : []}
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
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSort={handleSort}
      >
        <div className="flex flex-1 w-full h-full gap-2">
          <DataTableFilter columns={filters} />
          <TracesColumnsMenu lockedColumns={["status"]} columnLabels={columnLabels} />
          <DateRangeFilter />
          <RefreshButton onClick={handleRefresh} variant="outline" />
          <div className="flex items-center gap-2 px-2 border rounded-md bg-background h-7">
            <Switch id="realtime" checked={realtimeEnabled} onCheckedChange={setRealtimeEnabled} />
            <span className="text-xs cursor-pointer font-medium text-secondary-foreground">Realtime</span>
          </div>
        </div>
        <div className="w-full px-px">
          <AdvancedSearch
            filters={filters}
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
