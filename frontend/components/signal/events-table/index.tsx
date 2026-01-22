"use client";

import { type Row } from "@tanstack/react-table";
import { format, formatRelative } from "date-fns";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef } from "react";

import { useTimeSeriesStatsUrl } from "@/components/charts/time-series-chart/use-time-series-stats-url.ts";
import EventsChart from "@/components/signal/events-chart";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import { type EventNavigationItem } from "@/components/signal/utils.ts";
import { useTraceViewNavigation } from "@/components/traces/trace-view/navigation-context.tsx";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { type EventRow } from "@/lib/events/types";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils.ts";

import { defaultEventsColumnOrder, eventsTableColumns, eventsTableFilters } from "./columns";

const FETCH_SIZE = 50;

function PureEventsTable() {
  const { toast } = useToast();
  const params = useParams<{ projectId: string }>();

  const { signal, clusterConfig, lastEvent } = useSignalStoreContext((state) => ({
    signal: state.signal,
    clusterConfig: state.clusterConfig,
    lastEvent: state.lastEvent,
  }));
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const pastHours = searchParams.get("pastHours");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const filter = searchParams.getAll("filter");

  const fetchEvents = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());

        if (pastHours) {
          urlParams.set("pastHours", pastHours);
        }

        if (startDate) {
          urlParams.set("startDate", startDate);
        }

        if (endDate) {
          urlParams.set("endDate", endDate);
        }

        filter.forEach((f) => urlParams.append("filter", f));

        urlParams.set("eventDefinitionId", signal.id);

        urlParams.set("eventSource", "SEMANTIC");

        const response = await fetch(`/api/projects/${params.projectId}/events/${signal.name}?${urlParams.toString()}`);

        if (!response.ok) {
          throw new Error("Failed to fetch events");
        }

        const data: { items: EventRow[]; count: number } = await response.json();
        return { items: data.items, count: data.count };
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load events. Please try again.",
          variant: "destructive",
        });
      }
      return { items: [], count: 0 };
    },
    [pastHours, startDate, endDate, filter, signal.id, signal.name, params.projectId, toast]
  );

  const getRowHref = useCallback(
    (row: Row<EventRow>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("traceId", row.original.traceId);
      params.set("spanId", row.original.spanId);
      return `${pathName}?${params.toString()}`;
    },
    [pathName, searchParams]
  );

  const { traceId, spanId, setTraceId, setSpanId, fetchStats, setChartContainerWidth, chartContainerWidth } =
    useSignalStoreContext((state) => ({
      traceId: state.traceId,
      spanId: state.spanId,
      setTraceId: state.setTraceId,
      setSpanId: state.setSpanId,
      fetchStats: state.fetchStats,
      setChartContainerWidth: state.setChartContainerWidth,
      chartContainerWidth: state.chartContainerWidth,
    }));

  const handleRowClick = useCallback(
    (row: Row<EventRow>) => {
      setTraceId(row.original.traceId);
      setSpanId(row.original.spanId);
    },
    [setTraceId, setSpanId]
  );

  const statsUrl = useTimeSeriesStatsUrl({
    baseUrl: `/api/projects/${params.projectId}/events/${signal.name}/stats`,
    chartContainerWidth,
    pastHours,
    startDate,
    endDate,
    filters: filter,
    additionalParams: {
      eventSource: "SEMANTIC",
    },
  });

  const { setNavigationRefList } = useTraceViewNavigation<EventNavigationItem>();

  const {
    data: events,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
  } = useInfiniteScroll<EventRow>({
    fetchFn: fetchEvents,
    enabled: !!(pastHours || (startDate && endDate)),
    deps: [params.projectId, signal.name, pastHours, startDate, endDate, filter],
  });

  const focusedRowId = useMemo(() => {
    if (!traceId || !spanId) return undefined;
    return events?.find((event) => event.traceId === traceId && event.spanId === spanId)?.id;
  }, [events, traceId, spanId]);

  useEffect(() => {
    if (events) {
      setNavigationRefList(
        events.map((event) => ({
          traceId: event.traceId,
          spanId: event.spanId,
        }))
      );
    }
  }, [events, setNavigationRefList]);

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

  useEffect(() => {
    if (!pastHours && !startDate && !endDate) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("pastHours", "24");
      router.replace(`${pathName}?${params.toString()}`);
    }
  }, [pastHours, startDate, endDate, searchParams, pathName, router]);

  useEffect(() => {
    if (statsUrl) {
      fetchStats(statsUrl);
    }
  }, [statsUrl, fetchStats]);

  return (
    <div className="flex flex-col gap-2 flex-1">
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold">Events</span>
        <span className="text-xs text-muted-foreground font-medium">
          Last event:{" "}
          <span
            title={lastEvent?.timestamp ? format(lastEvent?.timestamp, "PPpp") : "-"}
            className={cn("text-xs", {
              "text-foreground": lastEvent,
            })}
          >
            {lastEvent ? formatRelative(new Date(lastEvent.timestamp), new Date()) : "-"}
          </span>
        </span>
      </div>

      <InfiniteDataTable<EventRow>
        className="w-full"
        columns={eventsTableColumns}
        data={events}
        onRowClick={handleRowClick}
        getRowId={(row: EventRow) => row.id}
        focusedRowId={focusedRowId}
        hasMore={hasMore}
        isFetching={isFetching}
        isLoading={isLoading}
        getRowHref={getRowHref}
        fetchNextPage={fetchNextPage}
        loadMoreButton
      >
        <div className="flex flex-1 w-full space-x-2">
          <DataTableFilter columns={eventsTableFilters} />
          <ColumnsMenu
            columnLabels={eventsTableColumns.map((column) => ({
              id: column.id!,
              label: typeof column.header === "string" ? column.header : column.id!,
            }))}
          />
          <DateRangeFilter />
        </div>
        <DataTableFilterList />
        <EventsChart className="w-full bg-secondary rounded border p-2" containerRef={chartContainerRef} />
      </InfiniteDataTable>
    </div>
  );
}

export default function EventsTable() {
  return (
    <DataTableStateProvider storageKey="events-table" uniqueKey="id" defaultColumnOrder={defaultEventsColumnOrder}>
      <PureEventsTable />
    </DataTableStateProvider>
  );
}
