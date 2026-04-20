"use client";

import { type Row } from "@tanstack/react-table";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { shallow } from "zustand/shallow";

import ClustersSection from "@/components/signal/clusters-section";
import ClusterBreadcrumbs from "@/components/signal/clusters-section/cluster-breadcrumbs";
import EmergingClusterBreadcrumbs from "@/components/signal/emerging-cluster-breadcrumbs";
import { useClusterId } from "@/components/signal/hooks/use-cluster-id";
import { useEmergingClusterId } from "@/components/signal/hooks/use-emerging-cluster-id";
import { getFilterClusterIds, useSignalStoreContext } from "@/components/signal/store.tsx";
import { type EventNavigationItem } from "@/components/signal/utils.ts";
import { useTraceViewNavigation } from "@/components/traces/trace-view/navigation-context.tsx";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { getDisplayRange, getTimeDifference } from "@/components/ui/date-range-filter/utils.ts";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { TableCell, TableRow } from "@/components/ui/table.tsx";
import { UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { type EventRow } from "@/lib/events/types";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

import { buildEventsColumns } from "./columns";

const FETCH_SIZE = 50;

const getEmptyRow = ({
  startDate,
  endDate,
  pastHours,
}: {
  pastHours?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}) => {
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
};

function PureEventsTable() {
  const { toast } = useToast();
  const params = useParams<{ projectId: string }>();

  const [clusterId] = useClusterId();
  const [emergingClusterId] = useEmergingClusterId();
  const signal = useSignalStoreContext((state) => state.signal);
  const traceId = useSignalStoreContext((state) => state.traceId);
  const selectedClusterIds = useSignalStoreContext((state) => getFilterClusterIds(state, clusterId), shallow);
  const isUnclusteredFilter = clusterId === UNCLUSTERED_ID;
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();

  const pastHours = searchParams.get("pastHours");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const filterRaw = searchParams.getAll("filter");
  const filter = useMemo(() => filterRaw, [JSON.stringify(filterRaw)]);

  const { columns, filters } = useMemo(() => buildEventsColumns(signal.schemaFields), [signal.schemaFields]);

  const setTraceId = useSignalStoreContext((state) => state.setTraceId);

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

        if (emergingClusterId) {
          urlParams.set("emergingClusterId", emergingClusterId);
        } else if (isUnclusteredFilter) {
          urlParams.set("unclustered", "true");
        } else {
          selectedClusterIds.forEach((id) => urlParams.append("clusterId", id));
        }

        urlParams.set("eventDefinitionId", signal.id);

        urlParams.set("eventSource", "SEMANTIC");

        const response = await fetch(
          `/api/projects/${params.projectId}/signals/${signal.id}/events?${urlParams.toString()}`
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
    [
      pastHours,
      startDate,
      endDate,
      filter,
      selectedClusterIds,
      isUnclusteredFilter,
      emergingClusterId,
      signal.id,
      params.projectId,
      toast,
    ]
  );

  const getRowHref = useCallback(
    (row: Row<EventRow>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("eventId", row.original.id);
      return `${pathName}?${params.toString()}`;
    },
    [pathName, searchParams]
  );

  const handleRowClick = useCallback(
    (row: Row<EventRow>) => {
      const traceId = row.original.traceId;
      track("signals", "event_to_trace");
      setTraceId(traceId);

      const newParams = new URLSearchParams(searchParams.toString());
      newParams.set("traceId", traceId);
      router.push(`${pathName}?${newParams.toString()}`);
    },
    [setTraceId, searchParams, pathName, router]
  );

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
    deps: [
      params.projectId,
      signal.id,
      pastHours,
      startDate,
      endDate,
      filter,
      selectedClusterIds,
      isUnclusteredFilter,
      emergingClusterId,
    ],
  });

  // Find the first event matching the active traceId to highlight it
  const focusedRowId = useMemo(() => {
    if (!traceId || !events) return undefined;
    const match = events.find((e) => e.traceId === traceId);
    return match?.id;
  }, [traceId, events]);

  useEffect(() => {
    if (events) {
      setNavigationRefList(
        events.map((event) => ({
          traceId: event.traceId,
        }))
      );
    }
  }, [events, setNavigationRefList]);

  useEffect(() => {
    if (!pastHours && !startDate && !endDate) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("pastHours", "72");
      router.replace(`${pathName}?${params.toString()}`);
    }
  }, [pastHours, startDate, endDate, searchParams, pathName, router]);

  return (
    <div className="flex flex-1 overflow-hidden px-4 pb-4">
      <InfiniteDataTable<EventRow>
        className="w-full"
        columns={columns}
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
        estimatedRowHeight={80}
        emptyRow={filter.length === 0 ? getEmptyRow({ pastHours, startDate, endDate }) : undefined}
      >
        <div className="flex flex-1 w-full h-full gap-2">
          <DataTableFilter columns={filters} />
          <ColumnsMenu
            columnLabels={columns.map((column) => ({
              id: column.id!,
              label: typeof column.header === "string" ? column.header : column.id!,
            }))}
          />
          <DateRangeFilter />
        </div>
        {emergingClusterId ? <EmergingClusterBreadcrumbs /> : <ClusterBreadcrumbs />}
        <DataTableFilterList />
        <ClustersSection />
      </InfiniteDataTable>
    </div>
  );
}

export default function EventsTable() {
  const signal = useSignalStoreContext((state) => state.signal);

  const { columnOrder } = useMemo(() => buildEventsColumns(signal.schemaFields), [signal.schemaFields]);

  return (
    <DataTableStateProvider storageKey={`events-table-${signal.id}`} uniqueKey="id" defaultColumnOrder={columnOrder}>
      <PureEventsTable />
    </DataTableStateProvider>
  );
}
