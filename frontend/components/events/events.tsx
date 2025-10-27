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
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/datatable-store";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { useProjectContext } from "@/contexts/project-context";
import { setEventsTraceViewWidthCookie } from "@/lib/actions/traces/cookies";
import { EventRow } from "@/lib/events/types";
import { useToast } from "@/lib/hooks/use-toast";

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
  const { workspace } = useProjectContext();
  const { toast } = useToast();

  const { eventDefinition, setEventDefinition, traceId, spanId, setTraceId, setSpanId } = useEventsStoreContext(
    (state) => ({
      eventDefinition: state.eventDefinition,
      setEventDefinition: state.setEventDefinition,
      traceId: state.traceId,
      spanId: state.spanId,
      setTraceId: state.setTraceId,
      setSpanId: state.setSpanId,
    })
  );

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
    totalCount,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
  } = useInfiniteScroll<EventRow>({
    fetchFn: fetchEvents,
    enabled: true,
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
    <>
      <Header path={`events/${eventDefinition.name}`} />
      <div className="flex flex-col overflow-hidden">
        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex items-center justify-between">
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
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 border rounded bg-sidebar p-4">
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
        <div className="p-4 flex overflow-hidden w-full">
          <InfiniteDataTable<EventRow>
            columns={eventsTableColumns}
            data={events}
            onRowClick={handleRowClick}
            getRowId={(row: EventRow) => row.id}
            focusedRowId={focusedRowId}
            hasMore={hasMore}
            isFetching={isFetching}
            isLoading={isLoading}
            fetchNextPage={fetchNextPage}
            totalItemsCount={totalCount}
            childrenClassName="flex flex-col h-fit"
          >
            <div className="flex flex-1 w-full space-x-2">
              <DataTableFilter columns={eventsTableFilters} />
            </div>
            <DataTableFilterList />
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
    <DataTableStateProvider uniqueKey="id">
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
