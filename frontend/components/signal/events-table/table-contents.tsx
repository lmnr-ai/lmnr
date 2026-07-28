"use client";

import { type ColumnDef, type Row } from "@tanstack/react-table";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { memo, type MutableRefObject, type PropsWithChildren, useCallback, useEffect, useMemo } from "react";

import { useSignalStoreContext } from "@/components/signal/store";
import { type SchemaField } from "@/components/signals/utils";
import { getDisplayRange, getTimeDifference } from "@/components/ui/date-range-filter/utils";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { TableCell, TableRow } from "@/components/ui/table";
import { type EventRow } from "@/lib/events/types";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

const FETCH_SIZE = 50;

function getEmptyRow({
  pastHours,
  startDate,
  endDate,
}: {
  pastHours?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}) {
  const { from, to } = getDisplayRange({ startDate, endDate, pastHours });
  return (
    <TableRow className="flex">
      <TableCell className="text-center p-4 rounded-b w-full h-auto">
        <div className="flex flex-1 justify-center">
          <div className="max-w-md">
            <h3 className="text-sm font-medium text-secondary-foreground">
              No events in the {pastHours ? `last ${getTimeDifference(from, to)}` : "time range"}
            </h3>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

export interface EventsTableContentsProps {
  refetchRef: MutableRefObject<() => void>;
  columns: ColumnDef<EventRow>[];
  projectId: string;
  signalId: string;
  schemaFields: SchemaField[];
  filter: string[];
  textSearchFilter: string | null;
  pastHours: string | null;
  startDate: string | null;
  endDate: string | null;
  isViewLoading: boolean;
  sortBy: string | undefined;
  sortDirection: "asc" | "desc" | undefined;
  onSort: (columnId: string, direction: "asc" | "desc") => void;
  selectedClusterIds: string[];
  isUnclusteredFilter: boolean;
  emergingClusterId: string | null;
}

export const EventsTableContents = memo(function EventsTableContents({
  children,
  refetchRef,
  columns,
  projectId,
  signalId,
  schemaFields,
  filter,
  textSearchFilter,
  pastHours,
  startDate,
  endDate,
  isViewLoading,
  sortBy,
  sortDirection,
  onSort,
  selectedClusterIds,
  isUnclusteredFilter,
  emergingClusterId,
}: PropsWithChildren<EventsTableContentsProps>) {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const setTraceId = useSignalStoreContext((state) => state.setTraceId);
  const setSpanId = useSignalStoreContext((state) => state.setSpanId);

  const fetchEnabled = !!(pastHours || (startDate && endDate)) && !isViewLoading;

  const fetchEvents = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());

        if (pastHours) urlParams.set("pastHours", pastHours);
        if (startDate) urlParams.set("startDate", startDate);
        if (endDate) urlParams.set("endDate", endDate);

        filter.forEach((f) => urlParams.append("filter", f));

        if (textSearchFilter) {
          urlParams.set("search", textSearchFilter);
          schemaFields.forEach((f) => {
            if (f.name.trim() && f.type === "string") {
              urlParams.append("payloadField", f.name);
            }
          });
        }

        if (sortBy && sortDirection) {
          urlParams.set("sortBy", sortBy);
          urlParams.set("sortDirection", sortDirection.toUpperCase());
          if (sortBy.startsWith("payload:")) {
            const fieldName = sortBy.slice("payload:".length);
            const field = schemaFields.find((f) => f.name === fieldName);
            const sortType = field?.type === "number" || field?.type === "boolean" ? field.type : "string";
            urlParams.set("sortType", sortType);
          }
        }

        if (emergingClusterId) {
          urlParams.set("emergingClusterId", emergingClusterId);
        } else if (isUnclusteredFilter) {
          urlParams.set("unclustered", "true");
        } else {
          selectedClusterIds.forEach((id) => urlParams.append("clusterId", id));
        }

        urlParams.set("eventDefinitionId", signalId);
        urlParams.set("eventSource", "SEMANTIC");

        const response = await fetch(`/api/projects/${projectId}/signals/${signalId}/events?${urlParams.toString()}`);

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
    [
      pastHours,
      startDate,
      endDate,
      filter,
      selectedClusterIds,
      isUnclusteredFilter,
      emergingClusterId,
      textSearchFilter,
      sortBy,
      sortDirection,
      signalId,
      schemaFields,
      projectId,
      toast,
    ]
  );

  const {
    data: events,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
    refetch,
  } = useInfiniteScroll<EventRow>({
    fetchFn: fetchEvents,
    enabled: fetchEnabled,
    deps: [
      projectId,
      signalId,
      pastHours,
      startDate,
      endDate,
      filter,
      selectedClusterIds,
      isUnclusteredFilter,
      emergingClusterId,
      textSearchFilter,
      sortBy,
      sortDirection,
    ],
  });

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch, refetchRef]);

  const eventId = searchParams.get("eventId");

  const focusedRowId = useMemo(() => {
    if (!events || !eventId) return undefined;
    return events.some((e) => e.id === eventId) ? eventId : undefined;
  }, [eventId, events]);

  const getRowHref = useCallback(
    (row: Row<EventRow>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("eventId", row.original.id);
      params.set("traceId", row.original.traceId);
      params.delete("spanId");
      return `${pathName}?${params.toString()}`;
    },
    [pathName, searchParams]
  );

  const handleRowClick = useCallback(
    (row: Row<EventRow>) => {
      const traceId = row.original.traceId;
      track("signals", "event_to_trace");
      setTraceId(traceId);
      setSpanId(null);

      const newParams = new URLSearchParams(searchParams.toString());
      newParams.set("eventId", row.original.id);
      newParams.set("traceId", traceId);
      newParams.delete("spanId");
      router.push(`${pathName}?${newParams.toString()}`);
    },
    [setTraceId, setSpanId, searchParams, pathName, router]
  );

  return (
    <InfiniteDataTable<EventRow>
      className="w-full"
      columns={columns}
      data={events}
      onRowClick={handleRowClick}
      getRowId={(row: EventRow) => row.id}
      focusedRowId={focusedRowId}
      hasMore={hasMore}
      isFetching={isFetching}
      isLoading={isLoading || isViewLoading}
      getRowHref={getRowHref}
      fetchNextPage={fetchNextPage}
      loadMoreButton
      estimatedRowHeight={80}
      sortBy={sortBy}
      sortDirection={sortDirection}
      onSort={onSort}
      emptyRow={filter.length === 0 && !textSearchFilter ? getEmptyRow({ pastHours, startDate, endDate }) : undefined}
    >
      {children}
    </InfiniteDataTable>
  );
});
