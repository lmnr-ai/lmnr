"use client";

import { type Row } from "@tanstack/react-table";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { useSWRConfig } from "swr";
import { shallow } from "zustand/shallow";

import AdvancedSearch from "@/components/common/advanced-search";
import { useClusterId } from "@/components/signal/hooks/use-cluster-id";
import { useEmergingClusterId } from "@/components/signal/hooks/use-emerging-cluster-id";
import SignalBreakdownSection from "@/components/signal/signal-breakdown";
import { deriveBreakdownEventsFilter } from "@/components/signal/signal-breakdown/dimensions";
import { getFilterClusterIds, useSignalStoreContext } from "@/components/signal/store.tsx";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import { getDisplayRange, getTimeDifference } from "@/components/ui/date-range-filter/utils.ts";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { useTableView } from "@/components/ui/infinite-datatable/model/table-config-store";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button.tsx";
import ViewsToolbar from "@/components/ui/infinite-datatable/views/views-toolbar";
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
  const selectedClusterIds = useSignalStoreContext((state) => getFilterClusterIds(state, clusterId), shallow);
  const isUnclusteredFilter = clusterId === UNCLUSTERED_ID;

  // Breakdown dimension: clusters use the cluster-id path below; every other
  // dimension contributes a standard events filter derived from store state.
  const breakdownBy = useSignalStoreContext((state) => state.breakdownBy);
  const breakdownSelectedId = useSignalStoreContext((state) => state.breakdownSelectedId);
  const agentBuckets = useSignalStoreContext((state) => state.agentBuckets);
  const isClustersBreakdown = breakdownBy.kind === "clusters";
  // Memoised → stable ref while its inputs are unchanged, so it's safe directly
  // in the fetch dependency arrays.
  const breakdownEventsFilter = useMemo(
    () => deriveBreakdownEventsFilter(breakdownBy, breakdownSelectedId, agentBuckets),
    [breakdownBy, breakdownSelectedId, agentBuckets]
  );
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();

  const pastHours = searchParams.get("pastHours");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const { effective, isLoading: isViewLoading, setSearchAndFilters, setSort } = useTableView();
  const filter = useMemo(() => effective.filters.map((f) => JSON.stringify(f)), [effective.filters]);
  const textSearchFilter = effective.search.length > 0 ? effective.search : null;
  const sortBy = effective.sortBy ?? undefined;
  const sortDirection = (effective.sortDirection ?? undefined) as "asc" | "desc" | undefined;
  const searchValue = useMemo(
    () => ({ filters: effective.filters, search: effective.search }),
    [effective.filters, effective.search]
  );

  const { columns, filters } = useMemo(() => buildEventsColumns(signal.schemaFields), [signal.schemaFields]);

  const setTraceId = useSignalStoreContext((state) => state.setTraceId);
  const setSpanId = useSignalStoreContext((state) => state.setSpanId);

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

        if (textSearchFilter) {
          urlParams.set("search", textSearchFilter);
          // Only string-typed schema fields can produce useful free-text
          // snippets — numbers/booleans/enums are reachable via column
          // filters and shouldn't show highlighted matches. The backend
          // (`search_signal_events` in `app-server/src/search/signal_events.rs`)
          // additionally filters names against a strict identifier regex
          // before interpolating them into the Quickwit query, so any
          // non-identifier name silently produces no hits.
          signal.schemaFields.forEach((f) => {
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
            const field = signal.schemaFields.find((f) => f.name === fieldName);
            // enum sorts lexically like a string; number/boolean get typed casts.
            const sortType = field?.type === "number" || field?.type === "boolean" ? field.type : "string";
            urlParams.set("sortType", sortType);
          }
        }

        if (isClustersBreakdown) {
          if (emergingClusterId) {
            urlParams.set("emergingClusterId", emergingClusterId);
          } else if (isUnclusteredFilter) {
            urlParams.set("unclustered", "true");
          } else {
            selectedClusterIds.forEach((id) => urlParams.append("clusterId", id));
          }
        } else if (breakdownEventsFilter.kind === "filter") {
          urlParams.append("filter", JSON.stringify(breakdownEventsFilter.filter));
        } else if (breakdownEventsFilter.kind === "agentVersion") {
          if (breakdownEventsFilter.versionHashes === null) {
            urlParams.set("noVersion", "true");
          } else {
            breakdownEventsFilter.versionHashes.forEach((h) => urlParams.append("versionHash", h));
          }
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
      isClustersBreakdown,
      breakdownEventsFilter,
      textSearchFilter,
      sortBy,
      sortDirection,
      signal.id,
      signal.schemaFields,
      params.projectId,
      toast,
    ]
  );

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

  const fetchEnabled = !!(pastHours || (startDate && endDate)) && !isViewLoading;

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
      params.projectId,
      signal.id,
      pastHours,
      startDate,
      endDate,
      filter,
      selectedClusterIds,
      isUnclusteredFilter,
      emergingClusterId,
      isClustersBreakdown,
      breakdownEventsFilter,
      textSearchFilter,
      sortBy,
      sortDirection,
    ],
  });

  const fetchClusters = useSignalStoreContext((state) => state.fetchClusters);
  const { mutate } = useSWRConfig();

  const handleRefresh = useCallback(() => {
    // Same gate as the events fetch: when refetch no-ops, skip the cluster and
    // run-stats reloads too so refresh never updates one panel but not the other.
    if (!fetchEnabled) return;
    refetch();
    // clusters reload cascades cluster-stats; run-stats revalidates via its SWR key.
    fetchClusters({ pastHours, startDate, endDate });
    mutate((key) => typeof key === "string" && key.includes(`/signals/${signal.id}/runs/stats`));
  }, [fetchEnabled, refetch, fetchClusters, pastHours, startDate, endDate, mutate, signal.id]);

  const handleSort = useCallback(
    (columnId: string, direction: "asc" | "desc") => {
      setSort(columnId || null, columnId ? direction : null);
    },
    [setSort]
  );

  // Find the first event matching the active traceId to highlight it
  const eventId = searchParams.get("eventId");

  // `eventId` is the only signal we trust for highlighting: a trace can now
  // carry multiple findings, so a traceId alone can't identify which row to
  // highlight. Trace-only links (e.g. "Open in Signals") still open the drawer
  // via the store traceId sync, but intentionally highlight nothing. Leave
  // nothing highlighted until the intended row scrolls into the list.
  const focusedRowId = useMemo(() => {
    if (!events || !eventId) return undefined;
    return events.some((e) => e.id === eventId) ? eventId : undefined;
  }, [eventId, events]);

  useEffect(() => {
    if (!pastHours && !startDate && !endDate) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("pastHours", "72");
      router.replace(`${pathName}?${params.toString()}`);
    }
  }, [pastHours, startDate, endDate, searchParams, pathName, router]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden px-4 pb-4 gap-2">
      <SignalBreakdownSection className="shrink-0 mb-4" />
      <InfiniteDataTable<EventRow>
        className="w-full flex-1 min-h-0"
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
        onSort={handleSort}
        emptyRow={filter.length === 0 && !textSearchFilter ? getEmptyRow({ pastHours, startDate, endDate }) : undefined}
      >
        <div className="flex flex-1 w-full h-full gap-2">
          <ColumnsMenu
            columnLabels={columns.map((column) => ({
              id: column.id!,
              label: typeof column.header === "string" ? column.header : column.id!,
            }))}
          />
          <ViewsToolbar projectId={params.projectId} resource={`signal-events:${signal.id}`} />
          <RefreshButton onClick={handleRefresh} variant="outline" />
        </div>
        <div className="w-full px-px">
          <AdvancedSearch
            value={searchValue}
            onChange={setSearchAndFilters}
            filters={filters}
            placeholder="Search and filter events by payload, severity, trace id, and more..."
            storageKey={`signal-events-${signal.id}`}
            resource="signal-events"
            className="w-full flex-1 mb-2"
          />
        </div>
      </InfiniteDataTable>
    </div>
  );
}

export default function EventsTable() {
  const signal = useSignalStoreContext((state) => state.signal);
  const params = useParams<{ projectId: string }>();
  const { columnOrder } = useMemo(() => buildEventsColumns(signal.schemaFields), [signal.schemaFields]);

  return (
    <InfiniteDataTableProvider
      uniqueKey="id"
      defaults={{ columnOrder }}
      views={{ projectId: params.projectId, resource: `signal-events:${signal.id}` }}
    >
      <PureEventsTable />
    </InfiniteDataTableProvider>
  );
}
