"use client";

import { type Row } from "@tanstack/react-table";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";

import AdvancedSearch from "@/components/common/advanced-search";
import { filters as traceFilters } from "@/components/traces/traces-table/columns";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button";
import type { Filter } from "@/lib/actions/common/filters";
import type { TraceRow } from "@/lib/traces/types";

import { useDebuggerSessionStore } from "../store";
import { FETCH_SIZE, sidebarColumnOrder, sidebarTraceColumns } from "./columns";

const TracesContent = () => {
  const { projectId } = useParams<{ projectId: string; id: string }>();
  const { loadHistoryTrace, trace } = useDebuggerSessionStore((state) => ({
    loadHistoryTrace: state.loadHistoryTrace,
    trace: state.trace,
  }));

  const [filters, setFilters] = useState<{ filters: Filter[]; search: string }>({ filters: [], search: "" });
  const [dateRange, setDateRange] = useState<{
    pastHours?: string;
    startDate?: string;
    endDate?: string;
  }>({ pastHours: "24" });

  const fetchTraces = useCallback(
    async (pageNumber: number) => {
      const urlParams = new URLSearchParams();
      urlParams.set("traceType", "DEFAULT");

      if (dateRange.pastHours) urlParams.set("pastHours", dateRange.pastHours);
      if (dateRange.startDate) urlParams.set("startDate", dateRange.startDate);
      if (dateRange.endDate) urlParams.set("endDate", dateRange.endDate);

      filters.filters.forEach((filter) => {
        urlParams.append("filter", JSON.stringify(filter));
      });

      if (filters.search.length > 0) {
        urlParams.set("search", filters.search);
      }

      const tracesParams = new URLSearchParams(urlParams);
      tracesParams.set("pageNumber", pageNumber.toString());
      tracesParams.set("pageSize", FETCH_SIZE.toString());

      const res = await fetch(`/api/projects/${projectId}/traces?${tracesParams.toString()}`);
      if (!res.ok) {
        const text = (await res.json()) as { error: string };
        throw new Error(text.error);
      }

      const data = (await res.json()) as { items: TraceRow[] };
      return { items: data.items ?? [], count: undefined };
    },
    [projectId, filters, dateRange]
  );

  const {
    data: traces,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
    refetch,
  } = useInfiniteScroll<TraceRow>({
    fetchFn: fetchTraces,
    enabled: !!(dateRange.pastHours || (dateRange.startDate && dateRange.endDate)),
    deps: [filters, dateRange, projectId],
  });

  const handleRowClick = useCallback(
    (row: Row<TraceRow>) => {
      const r = row.original;
      if (r.id === trace?.id) return;
      loadHistoryTrace(projectId, r.id, r.startTime, r.endTime);
    },
    [projectId, trace?.id, loadHistoryTrace]
  );

  return (
    <div className="flex flex-col gap-3 px-4 py-2">
      <span className="text-secondary-foreground text-xs px-1">
        Select a trace to rerun in debugger. Trace structure must match the agent you are running locally.
      </span>

      <InfiniteDataTable<TraceRow>
        className="w-full"
        columns={sidebarTraceColumns}
        data={traces}
        getRowId={(t) => t.id}
        onRowClick={handleRowClick}
        focusedRowId={trace?.id}
        hasMore={!filters.search && hasMore}
        isFetching={isFetching}
        isLoading={isLoading}
        fetchNextPage={fetchNextPage}
        estimatedRowHeight={36}
        lockedColumns={["status"]}
      >
        <div className="flex gap-2 w-full items-center">
          <DateRangeFilter mode="state" value={dateRange} onChange={setDateRange} />
          <RefreshButton onClick={refetch} variant="outline" />
        </div>
        <div className="w-full px-px">
          <AdvancedSearch
            mode="state"
            filters={traceFilters}
            resource="traces"
            value={filters}
            onSubmit={(f, search) => setFilters({ filters: f, search })}
            placeholder="Search traces..."
            className="w-full flex-1"
            options={{ disableHotKey: true }}
          />
        </div>
      </InfiniteDataTable>
    </div>
  );
};

export default function TracesTab() {
  return (
    <DataTableStateProvider defaultColumnOrder={sidebarColumnOrder} pageSize={FETCH_SIZE}>
      <TracesContent />
    </DataTableStateProvider>
  );
}
