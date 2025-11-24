"use client";

import { Row } from "@tanstack/react-table";
import { format, formatRelative } from "date-fns";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Resizable, ResizeCallback } from "re-resizable";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTimeSeriesStatsUrl } from "@/components/charts/time-series-chart/use-time-series-stats-url";
import ManageEventDefinitionDialog, {
  ManageEventDefinitionForm,
} from "@/components/event-definitions/manage-event-definition-dialog";
import { defaultEventsColumnOrder, eventsTableColumns, eventsTableFilters } from "@/components/events/columns.tsx";
import EventsChart from "@/components/events/events-chart";
import { useEventsStoreContext } from "@/components/events/events-store";
import TraceView from "@/components/traces/trace-view";
import TraceViewNavigationProvider, { NavigationConfig } from "@/components/traces/trace-view/navigation-context";
import { filterColumns, getDefaultTraceViewWidth } from "@/components/traces/trace-view/utils";
import { Button } from "@/components/ui/button";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { getColumnLabels } from "@/components/ui/infinite-datatable/utils";
import FiltersContextProvider from "@/components/ui/infinite-datatable/ui/datatable-filter/context";
import { useProjectContext } from "@/contexts/project-context";
import { setEventsTraceViewWidthCookie } from "@/lib/actions/traces/cookies";
import { EventRow } from "@/lib/events/types";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils.ts";
import DateRangeFilter from "@/shared/ui/date-range-filter";

import { useTraceViewNavigation } from "../traces/trace-view/navigation-context";
import Header from "../ui/header";

type EventNavigationItem = {
  traceId: string;
  spanId: string;
};

const getEventsConfig = (): NavigationConfig<EventNavigationItem> => ({
  getItemId: (item) => `${item.traceId}-${item.spanId}`,
  updateSearchParams: (item, params) => {
    params.set("traceId", item.traceId);
    params.set("spanId", item.spanId);
  },
  getCurrentItem: (list, searchParams) => {
    const traceId = searchParams.get("traceId");
    const spanId = searchParams.get("spanId");
    if (!traceId || !spanId) return null;

    return list.find((item) => item.traceId === traceId && item.spanId === spanId) || null;
  },
});

const FETCH_SIZE = 50;

function EventsContentInner({
  lastEvent,
  initialTraceViewWidth,
}: {
  lastEvent?: { id: string; name: string; timestamp: string };
  initialTraceViewWidth?: number;
}) {
  const pathName = usePathname();
  const { push } = useRouter();
  const searchParams = useSearchParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const ref = useRef<Resizable>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const { workspace } = useProjectContext();
  const { toast } = useToast();

  const {
    eventDefinition,
    setEventDefinition,
    traceId,
    spanId,
    setTraceId,
    setSpanId,
    fetchStats,
    setChartContainerWidth,
    chartContainerWidth,
  } = useEventsStoreContext((state) => ({
    eventDefinition: state.eventDefinition,
    setEventDefinition: state.setEventDefinition,
    traceId: state.traceId,
    spanId: state.spanId,
    setTraceId: state.setTraceId,
    setSpanId: state.setSpanId,
    fetchStats: state.fetchStats,
    setChartContainerWidth: state.setChartContainerWidth,
    chartContainerWidth: state.chartContainerWidth,
  }));

  const { setNavigationRefList } = useTraceViewNavigation<EventNavigationItem>();

  const [defaultTraceViewWidth, setDefaultTraceViewWidth] = useState(initialTraceViewWidth || 1000);

  const isFreeTier = workspace?.tierName.toLowerCase().trim() === "free";

  useEffect(() => {
    if (!initialTraceViewWidth) {
      setDefaultTraceViewWidth(getDefaultTraceViewWidth());
    }
  }, [initialTraceViewWidth]);

  const pastHours = searchParams.get("pastHours");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const filter = searchParams.getAll("filter");

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
    baseUrl: `/api/projects/${eventDefinition.projectId}/events/${eventDefinition.name}/stats`,
    chartContainerWidth,
    pastHours,
    startDate,
    endDate,
    filters: filter,
    defaultTargetBars: 24,
  });

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

        const response = await fetch(
          `/api/projects/${eventDefinition.projectId}/events/${eventDefinition.name}?${urlParams.toString()}`
        );

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
    [eventDefinition.projectId, eventDefinition.name, pastHours, startDate, endDate, filter]
  );

  const {
    data: events,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
  } = useInfiniteScroll<EventRow>({
    fetchFn: fetchEvents,
    enabled: !!(pastHours || (startDate && endDate)),
    deps: [eventDefinition.projectId, eventDefinition.name, pastHours, startDate, endDate, filter],
  });

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
    if (statsUrl) {
      fetchStats(statsUrl);
    }
  }, [statsUrl, fetchStats]);

  const handleEditEvent = useCallback(() => {
    setIsDialogOpen(true);
  }, []);

  const handleSuccess = useCallback(
    async (form: ManageEventDefinitionForm) => {
      setEventDefinition({
        ...eventDefinition,
        prompt: form.prompt,
        structuredOutput: form.structuredOutput,
        triggerSpans: form.triggerSpans,
      });
    },
    [eventDefinition, setEventDefinition]
  );

  const handleRowClick = useCallback(
    (row: Row<EventRow>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("traceId", row.original.traceId);
      params.set("spanId", row.original.spanId);
      push(`${pathName}?${params.toString()}`);
      setTraceId(row.original.traceId);
      setSpanId(row.original.spanId);
    },
    [pathName, push, searchParams, setTraceId, setSpanId]
  );

  const focusedRowId = useMemo(() => {
    if (!traceId || !spanId) return undefined;
    return events?.find((event) => event.traceId === traceId && event.spanId === spanId)?.id;
  }, [events, traceId, spanId]);

  const columnLabels = useMemo(() => getColumnLabels(eventsTableColumns), []);

  const handleResizeStop: ResizeCallback = (_event, _direction, _elementRef, delta) => {
    const newWidth = defaultTraceViewWidth + delta.width;
    setDefaultTraceViewWidth(newWidth);
    setEventsTraceViewWidthCookie(newWidth).catch((e) => console.warn(`Failed to save value to cookies. ${e}`));
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (defaultTraceViewWidth > window.innerWidth - 180) {
        const newWidth = window.innerWidth - 240;
        setDefaultTraceViewWidth(newWidth);
        setEventsTraceViewWidthCookie(newWidth);
        ref?.current?.updateSize({ width: newWidth });
      }
    }
  }, [defaultTraceViewWidth]);

  useEffect(() => {
    if (!pastHours && !startDate && !endDate) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("pastHours", "24");
      push(`${pathName}?${params.toString()}`);
    }
  }, [pastHours, startDate, endDate, searchParams, pathName, push]);

  return (
    <>
      <Header path={`events/${eventDefinition.name}`} />
      <div className="flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 pb-4">
          {!isFreeTier && (
            <ManageEventDefinitionDialog
              open={isDialogOpen}
              setOpen={setIsDialogOpen}
              defaultValues={eventDefinition}
              key={eventDefinition.id}
              onSuccess={handleSuccess}
            >
              <Button icon="edit" onClick={handleEditEvent}>
                Event Definition
              </Button>
            </ManageEventDefinitionDialog>
          )}
          <div>
            <span className="text-xs text-muted-foreground font-medium">Last event: </span>
            <span
              title={lastEvent?.timestamp ? format(lastEvent?.timestamp, "PPpp") : "-"}
              className={cn("text-xs", {
                "text-muted-foreground": !lastEvent,
              })}
            >
              {lastEvent ? formatRelative(new Date(lastEvent.timestamp), new Date()) : "-"}
            </span>
          </div>
        </div>
        <div className="flex flex-1 overflow-hidden px-4 pb-4">
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
            fetchNextPage={fetchNextPage}
          >
            <div className="flex flex-1 w-full space-x-2">
              <DateRangeFilter />
              <DataTableFilter columns={eventsTableFilters} />
              <ColumnsMenu columnLabels={columnLabels} />
            </div>
            <DataTableFilterList />
            <EventsChart className="w-full bg-secondary rounded border p-2" containerRef={chartContainerRef} />
          </InfiniteDataTable>
        </div>
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
            <FiltersContextProvider columns={filterColumns}>
              <TraceView
                spanId={spanId || undefined}
                key={traceId}
                onClose={() => {
                  const params = new URLSearchParams(searchParams);
                  params.delete("traceId");
                  params.delete("spanId");
                  push(`${pathName}?${params.toString()}`);
                  setTraceId(null);
                  setSpanId(null);
                }}
                traceId={traceId}
              />
            </FiltersContextProvider>
          </Resizable>
        </div>
      )}
    </>
  );
}

function EventsContent({
  lastEvent,
  initialTraceViewWidth,
}: {
  lastEvent?: { id: string; name: string; timestamp: string };
  initialTraceViewWidth?: number;
}) {
  return (
    <DataTableStateProvider storageKey="events-table" uniqueKey="id" defaultColumnOrder={defaultEventsColumnOrder}>
      <EventsContentInner lastEvent={lastEvent} initialTraceViewWidth={initialTraceViewWidth} />
    </DataTableStateProvider>
  );
}

export default function Events({
  lastEvent,
  initialTraceViewWidth,
}: {
  lastEvent?: { id: string; name: string; timestamp: string };
  initialTraceViewWidth?: number;
}) {
  const { setTraceId, setSpanId } = useEventsStoreContext((state) => ({
    setTraceId: state.setTraceId,
    setSpanId: state.setSpanId,
  }));

  const handleNavigate = useCallback(
    (item: EventNavigationItem | null) => {
      if (item) {
        setTraceId(item.traceId);
        setSpanId(item.spanId);
      }
    },
    [setTraceId, setSpanId]
  );

  return (
    <TraceViewNavigationProvider<EventNavigationItem> config={getEventsConfig()} onNavigate={handleNavigate}>
      <EventsContent lastEvent={lastEvent} initialTraceViewWidth={initialTraceViewWidth} />
    </TraceViewNavigationProvider>
  );
}
