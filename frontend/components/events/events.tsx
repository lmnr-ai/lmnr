"use client";

import { formatRelative } from "date-fns";
import { isEmpty } from "lodash";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import ManageEventDefinitionDialog, {
  ManageEventDefinitionForm,
} from "@/components/event-definitions/manage-event-definition-dialog";
import { eventsTableColumns, eventsTableFilters } from "@/components/events/columns.tsx";
import { useEventsStoreContext } from "@/components/events/events-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/datatable-filter";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { EventRow } from "@/lib/events/types";

import { DataTable } from "../ui/datatable";
import Header from "../ui/header";

export default function Events({ lastEvent }: { lastEvent?: { id: string; name: string; timestamp: string } }) {
  const pathName = usePathname();
  const { push } = useRouter();
  const searchParams = useSearchParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { events, totalCount, fetchEvents, eventDefinition, setEventDefinition } = useEventsStoreContext((state) => ({
    events: state.events,
    totalCount: state.totalCount,
    fetchEvents: state.fetchEvents,
    eventDefinition: state.eventDefinition,
    setEventDefinition: state.setEventDefinition,
  }));

  const eventsParams = useMemo(() => {
    const sp = new URLSearchParams();

    sp.set("name", eventDefinition?.name);

    const pastHours = searchParams.get("pastHours");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const filter = searchParams.getAll("filter");
    const pageNumber = searchParams.get("pageNumber") ? Number(searchParams.get("pageNumber")) : 0;
    const pageSize = searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : 50;

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
  }, [eventDefinition?.name, searchParams]);

  const page = useMemo<{ number: number; size: number }>(() => {
    const size = searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : 50;
    return {
      number: searchParams.get("pageNumber") ? Number(searchParams.get("pageNumber")) : 0,
      size,
    };
  }, [searchParams]);

  useEffect(() => {
    fetchEvents(eventsParams);
  }, [eventsParams]);

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

  return (
    <div className="flex flex-col flex-1">
      <Header path={`events/${eventDefinition.name}`} />
      <div className="flex flex-col flex-1 overflow-auto">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-medium">{eventDefinition.name}</h1>
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
          getRowId={(row: EventRow) => row.id}
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
    </div>
  );
}
