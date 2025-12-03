"use client";

import { Row } from "@tanstack/react-table";
import { ReactNode, useCallback, useEffect } from "react";

import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { EventRow } from "@/lib/events/types";
import { useToast } from "@/lib/hooks/use-toast";
import DateRangeFilter from "@/shared/ui/date-range-filter";

import { defaultEventsColumnOrder, eventsTableColumns, eventsTableFilters } from "./columns";

const FETCH_SIZE = 50;

interface EventsTableProps {
  projectId: string;
  eventName: string;
  eventDefinitionId?: string;
  pastHours: string | null;
  startDate: string | null;
  endDate: string | null;
  filter: string[];
  onRowClick: (row: Row<EventRow>) => void;
  focusedRowId?: string;
  onDataChange?: (events: EventRow[]) => void;
  children?: ReactNode;
}

function PureEventsTable({
  projectId,
  eventName,
  eventDefinitionId,
  pastHours,
  startDate,
  endDate,
  filter,
  onRowClick,
  focusedRowId,
  onDataChange,
  children,
}: EventsTableProps) {
  const { toast } = useToast();

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

        if (eventDefinitionId) {
          urlParams.set("eventDefinitionId", eventDefinitionId);
        }

        const response = await fetch(`/api/projects/${projectId}/events/${eventName}?${urlParams.toString()}`);

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
    [projectId, eventName, eventDefinitionId, pastHours, startDate, endDate, filter, toast]
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
    deps: [projectId, eventName, pastHours, startDate, endDate, filter],
  });

  useEffect(() => {
    if (events && onDataChange) {
      onDataChange(events);
    }
  }, [events, onDataChange]);

  return (
    <InfiniteDataTable<EventRow>
      className="w-full"
      columns={eventsTableColumns}
      data={events}
      onRowClick={onRowClick}
      getRowId={(row: EventRow) => row.id}
      focusedRowId={focusedRowId}
      hasMore={hasMore}
      isFetching={isFetching}
      isLoading={isLoading}
      fetchNextPage={fetchNextPage}
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
      {children}
    </InfiniteDataTable>
  );
}

export default function EventsTable(props: EventsTableProps) {
  return (
    <DataTableStateProvider storageKey="events-table" uniqueKey="id" defaultColumnOrder={defaultEventsColumnOrder}>
      <PureEventsTable {...props} />
    </DataTableStateProvider>
  );
}
