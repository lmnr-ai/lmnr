"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSWRConfig } from "swr";
import { shallow } from "zustand/shallow";

import { EventsTableContents } from "@/components/signal/events-table/table-contents";
import { EventsTableControls } from "@/components/signal/events-table/table-controls";
import { useClusterId } from "@/components/signal/hooks/use-cluster-id";
import { useEmergingClusterId } from "@/components/signal/hooks/use-emerging-cluster-id";
import { getFilterClusterIds, useSignalStoreContext } from "@/components/signal/store.tsx";
import { useTableView } from "@/components/ui/infinite-datatable/model/table-config-store";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import { UNCLUSTERED_ID } from "@/lib/actions/clusters";

import { buildEventsColumns } from "./columns";

function PureEventsTable() {
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const refetchRef = useRef<() => void>(() => {});

  const [clusterId] = useClusterId();
  const [emergingClusterId] = useEmergingClusterId();
  const signal = useSignalStoreContext((state) => state.signal);
  const selectedClusterIds = useSignalStoreContext((state) => getFilterClusterIds(state, clusterId), shallow);
  const isUnclusteredFilter = clusterId === UNCLUSTERED_ID;
  const fetchClusters = useSignalStoreContext((state) => state.fetchClusters);
  const { mutate } = useSWRConfig();

  const pastHours = searchParams.get("pastHours");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const { effective, isLoading: isViewLoading, setFilters, setSearchAndFilters, setSort } = useTableView();
  const filter = useMemo(() => effective.filters.map((f) => JSON.stringify(f)), [effective.filters]);
  const textSearchFilter = effective.search.length > 0 ? effective.search : null;
  const sortBy = effective.sortBy ?? undefined;
  const sortDirection = (effective.sortDirection ?? undefined) as "asc" | "desc" | undefined;
  const searchValue = useMemo(
    () => ({ filters: effective.filters, search: effective.search }),
    [effective.filters, effective.search]
  );

  const { columns, filters } = useMemo(() => buildEventsColumns(signal.schemaFields), [signal.schemaFields]);

  const fetchEnabled = !!(pastHours || (startDate && endDate)) && !isViewLoading;

  const handleRefresh = useCallback(() => {
    if (!fetchEnabled) return;
    refetchRef.current();
    fetchClusters({ pastHours, startDate, endDate });
    mutate((key) => typeof key === "string" && key.includes(`/signals/${signal.id}/runs/stats`));
  }, [fetchEnabled, fetchClusters, pastHours, startDate, endDate, mutate, signal.id]);

  const handleSort = useCallback(
    (columnId: string, direction: "asc" | "desc") => {
      setSort(columnId || null, columnId ? direction : null);
    },
    [setSort]
  );

  useEffect(() => {
    if (!pastHours && !startDate && !endDate) {
      const p = new URLSearchParams(searchParams.toString());
      p.set("pastHours", "72");
      router.replace(`${pathName}?${p.toString()}`);
    }
  }, [pastHours, startDate, endDate, searchParams, pathName, router]);

  return (
    <div className="flex flex-1 overflow-hidden px-4 pb-4">
      <EventsTableContents
        refetchRef={refetchRef}
        columns={columns}
        projectId={params.projectId}
        signalId={signal.id}
        schemaFields={signal.schemaFields}
        filter={filter}
        textSearchFilter={textSearchFilter}
        pastHours={pastHours}
        startDate={startDate}
        endDate={endDate}
        isViewLoading={isViewLoading}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSort={handleSort}
        selectedClusterIds={selectedClusterIds}
        isUnclusteredFilter={isUnclusteredFilter}
        emergingClusterId={emergingClusterId}
      >
        <EventsTableControls
          projectId={params.projectId}
          signalId={signal.id}
          filterColumns={filters}
          columnLabels={columns.map((column) => ({
            id: column.id!,
            label: typeof column.header === "string" ? column.header : column.id!,
          }))}
          filters={effective.filters}
          onFiltersChange={setFilters}
          searchValue={searchValue}
          onSearchChange={setSearchAndFilters}
          onRefresh={handleRefresh}
        />
      </EventsTableContents>
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
