"use client";

import { Row } from "@tanstack/react-table";
import { formatRelative } from "date-fns";
import { isEmpty } from "lodash";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Resizable, ResizeCallback } from "re-resizable";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ManageEventDefinitionDialog, {
  ManageEventDefinitionForm,
} from "@/components/event-definitions/manage-event-definition-dialog";
import { eventsTableColumns, eventsTableFilters } from "@/components/events/columns.tsx";
import { useEventsStoreContext } from "@/components/events/events-store";
import TraceView from "@/components/traces/trace-view";
import TraceViewNavigationProvider, { NavigationConfig } from "@/components/traces/trace-view/navigation-context";
import { filterColumns, getDefaultTraceViewWidth } from "@/components/traces/trace-view/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/datatable-filter";
import FiltersContextProvider from "@/components/ui/datatable-filter/context";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { useProjectContext } from "@/contexts/project-context";
import { setEventsTraceViewWidthCookie } from "@/lib/actions/traces/cookies";
import { EventRow } from "@/lib/events/types";

import { useTraceViewNavigation } from "../traces/trace-view/navigation-context";
import { DataTable } from "../ui/datatable";
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

function EventsContent({
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
  const { workspace } = useProjectContext();

  const {
    events,
    totalCount,
    fetchEvents,
    eventDefinition,
    setEventDefinition,
    traceId,
    spanId,
    setTraceId,
    setSpanId,
  } = useEventsStoreContext((state) => ({
    events: state.events,
    totalCount: state.totalCount,
    fetchEvents: state.fetchEvents,
    eventDefinition: state.eventDefinition,
    setEventDefinition: state.setEventDefinition,
    traceId: state.traceId,
    spanId: state.spanId,
    setTraceId: state.setTraceId,
    setSpanId: state.setSpanId,
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
  const pageNumber = searchParams.get("pageNumber") ? Number(searchParams.get("pageNumber")) : 0;
  const pageSize = searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : 50;

  const eventsParams = useMemo(() => {
    const sp = new URLSearchParams();

    sp.set("name", eventDefinition?.name);

    if (pastHours) {
      sp.set("pastHours", pastHours);
    }

    if (startDate) {
      sp.set("startDate", startDate);
    }

    if (endDate) {
      sp.set("endDate", endDate);
    }

    filter.forEach((f) => sp.append("filter", f));

    sp.append("pageNumber", String(pageNumber));
    sp.append("pageSize", String(pageSize));

    return sp;
  }, [eventDefinition?.name, pastHours, startDate, endDate, JSON.stringify(filter), pageNumber, pageSize]);

  const page = useMemo<{ number: number; size: number }>(
    () => ({
      number: pageNumber,
      size: pageSize,
    }),
    [pageNumber, pageSize]
  );

  useEffect(() => {
    fetchEvents(eventsParams);
  }, [eventsParams]);

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

  const handlePageChange = useCallback(
    (pageNumber: number, pageSize: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("pageNumber", pageNumber.toString());
      params.set("pageSize", pageSize.toString());
      push(`${pathName}?${params}`);
    },
    [pathName, push, searchParams]
  );

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

  return (
    <div className="flex flex-col flex-1">
      <Header path={`events/${eventDefinition.name}`} />
      <div className="flex flex-col flex-1 overflow-auto">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-medium">{eventDefinition.name}</h1>
            {!isFreeTier && (
              <ManageEventDefinitionDialog
                open={isDialogOpen}
                setOpen={setIsDialogOpen}
                defaultValues={eventDefinition}
                key={eventDefinition.id}
                onSuccess={handleSuccess}
              >
                <Button variant="outline" onClick={handleEditEvent}>
                  Edit Event Definition
                </Button>
              </ManageEventDefinitionDialog>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground font-medium">Prompt</span>
              {eventDefinition.prompt ? (
                <div className="rounded-md">
                  <p className="text-sm font-mono line-clamp-3">{eventDefinition.prompt}</p>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">-</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground font-medium">Trigger Spans</span>
              {!isEmpty(eventDefinition.triggerSpans) ? (
                <ScrollArea>
                  <div className="flex flex-wrap gap-1.5 max-h-24">
                    {eventDefinition.triggerSpans.map((span) => (
                      <Badge key={span.name} variant="secondary" className="font-mono text-xs">
                        {span.name}
                      </Badge>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <span className="text-sm text-muted-foreground">-</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground font-medium">Last Event</span>
              {lastEvent ? (
                <span className="text-sm">{formatRelative(new Date(lastEvent.timestamp), new Date())}</span>
              ) : (
                <span className="text-sm text-muted-foreground">-</span>
              )}
            </div>
          </div>
        </div>
        <DataTable
          columns={eventsTableColumns}
          data={events}
          defaultPageNumber={page.number}
          defaultPageSize={page.size}
          pageCount={Math.ceil(Number(totalCount || 0) / page.size)}
          totalItemsCount={Number(totalCount || 0)}
          onPageChange={handlePageChange}
          onRowClick={handleRowClick}
          getRowId={(row: EventRow) => row.id}
          focusedRowId={focusedRowId}
          paginated
          manualPagination
          pageSizeOptions={[25, 50, 100]}
          childrenClassName="flex flex-col gap-2 py-2 items-start h-fit space-x-0"
        >
          <div className="flex flex-1 w-full space-x-2">
            <DataTableFilter columns={eventsTableFilters} />
          </div>
          <DataTableFilterList />
        </DataTable>
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
    </div>
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
