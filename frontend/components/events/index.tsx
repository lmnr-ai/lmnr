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
import ClustersTable from "@/components/events/clusters-table";
import EventsChart from "@/components/events/events-chart";
import { useEventsStoreContext } from "@/components/events/events-store";
import EventsTable from "@/components/events/events-table";
import { EventNavigationItem, getEventsConfig } from "@/components/events/utils";
import TraceView from "@/components/traces/trace-view";
import TraceViewNavigationProvider from "@/components/traces/trace-view/navigation-context";
import { filterColumns, getDefaultTraceViewWidth } from "@/components/traces/trace-view/utils";
import { Button } from "@/components/ui/button";
import FiltersContextProvider from "@/components/ui/infinite-datatable/ui/datatable-filter/context";
import { useProjectContext } from "@/contexts/project-context";
import { setEventsTraceViewWidthCookie } from "@/lib/actions/traces/cookies";
import { EventRow } from "@/lib/events/types";
import { cn } from "@/lib/utils";

import { useTraceViewNavigation } from "../traces/trace-view/navigation-context";
import Header from "../ui/header";

function PureEvents({
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
  const [events, setEvents] = useState<EventRow[]>([]);

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
    additionalParams: eventDefinition.id ? { eventDefinitionId: eventDefinition.id } : {},
    defaultTargetBars: 24,
  });

  const handleDataChange = useCallback((newEvents: EventRow[]) => {
    setEvents(newEvents);
  }, []);

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
      <div className="flex flex-col max-h-max overflow-auto">
        <div className="flex flex-col h-[1000px]">
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
          <span className="text-lg font-semibold px-4">Clusters</span>
          <div className="flex px-4 pb-4 max-h-96 h-full">
            {eventDefinition.id && (
              <ClustersTable
                projectId={eventDefinition.projectId}
                eventDefinitionId={eventDefinition.id}
                eventDefinitionName={eventDefinition.name}
              />
            )}
          </div>
          <span className="text-lg font-semibold px-4 mb-1">Events</span>
          <div className="flex flex-1 px-4 pb-4">
            <EventsTable
              projectId={eventDefinition.projectId}
              eventName={eventDefinition.name}
              eventDefinitionId={eventDefinition.id}
              pastHours={pastHours}
              startDate={startDate}
              endDate={endDate}
              filter={filter}
              onRowClick={handleRowClick}
              focusedRowId={focusedRowId}
              onDataChange={handleDataChange}
            >
              <EventsChart className="w-full bg-secondary rounded border p-2" containerRef={chartContainerRef} />
            </EventsTable>
          </div>
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
      <PureEvents lastEvent={lastEvent} initialTraceViewWidth={initialTraceViewWidth} />
    </TraceViewNavigationProvider>
  );
}
