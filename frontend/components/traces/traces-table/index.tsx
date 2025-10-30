"use client";
import { Row } from "@tanstack/react-table";
import { isEmpty, map } from "lodash";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import RefreshButton from "@/components/traces/refresh-button";
import SearchTracesInput from "@/components/traces/search-traces-input";
import { useTraceViewNavigation } from "@/components/traces/trace-view/navigation-context";
import { useTracesStoreContext } from "@/components/traces/traces-store";
import { columns, filters } from "@/components/traces/traces-table/columns";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/datatable-filter";
import { DatatableFilter } from "@/components/ui/datatable-filter/utils.ts";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/datatable-store";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/lib/hooks/use-toast";
import { TraceRow } from "@/lib/traces/types";

const presetFilters: DatatableFilter[] = [];

const FETCH_SIZE = 50;

export default function TracesTable() {
  return (
    <DataTableStateProvider>
      <TracesTableContent />
    </DataTableStateProvider>
  );
}

function TracesTableContent() {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const { projectId } = useParams();
  const { toast } = useToast();

  const { traceId, setTraceId: onRowClick } = useTracesStoreContext((state) => ({
    traceId: state.traceId,
    setTraceId: state.setTraceId,
  }));

  const filter = searchParams.getAll("filter");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const pastHours = searchParams.get("pastHours");
  const textSearchFilter = searchParams.get("search");
  const searchIn = searchParams.getAll("searchIn");

  const [realtimeEnabled, setRealtimeEnabled] = useState(false);

  const { setNavigationRefList } = useTraceViewNavigation();
  const isCurrentTimestampIncluded = !!pastHours || (!!endDate && new Date(endDate) >= new Date());

  const shouldFetch = !!(pastHours || startDate || endDate);

  const fetchTraces = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());

        if (pastHours != null) urlParams.set("pastHours", pastHours);
        if (startDate != null) urlParams.set("startDate", startDate);
        if (endDate != null) urlParams.set("endDate", endDate);

        filter.forEach((filter) => urlParams.append("filter", filter));

        if (typeof textSearchFilter === "string" && textSearchFilter.length > 0) {
          urlParams.set("search", textSearchFilter);
        }

        if (isEmpty(searchIn) || searchIn?.length === 2) {
          urlParams.append("searchIn", "input");
          urlParams.append("searchIn", "output");
        } else if (searchIn?.length > 0) {
          urlParams.set("searchIn", searchIn[0]);
        }

        const url = `/api/projects/${projectId}/traces?${urlParams.toString()}`;

        const res = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          const text = (await res.json()) as { error: string };
          throw new Error(text.error);
        }

        const data = (await res.json()) as { items: TraceRow[] };
        return { items: data.items, count: 0 };
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load traces. Please try again.",
          variant: "destructive",
        });
        throw error;
      }
    },
    [endDate, filter, pastHours, projectId, searchIn, startDate, textSearchFilter, toast]
  );

  const {
    data: traces,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
    refetch,
    updateData,
  } = useInfiniteScroll<TraceRow>({
    fetchFn: fetchTraces,
    enabled: shouldFetch,
    deps: [endDate, filter, pastHours, projectId, searchIn, startDate, textSearchFilter],
  });

  useEffect(() => {
    setNavigationRefList(map(traces, "id"));
  }, [setNavigationRefList, traces]);

  const updateRealtimeTrace = useCallback(
    (traceData: TraceRow) => {
      updateData((currentTraces) => {
        if (!currentTraces || currentTraces.length === 0) return currentTraces;

        const existingTraceIndex = currentTraces.findIndex((trace) => trace.id === traceData.id);

        if (existingTraceIndex !== -1) {
          // Update existing trace
          const newTraces = [...currentTraces];
          newTraces[existingTraceIndex] = traceData;
          return newTraces;
        } else {
          // New trace - insert at the beginning
          const newTraces = [traceData, ...currentTraces];

          // Keep only the first FETCH_SIZE traces
          if (newTraces.length > FETCH_SIZE) {
            newTraces.splice(FETCH_SIZE);
          }

          return newTraces;
        }
      });
    },
    [updateData]
  );

  // SSE connection for realtime trace updates
  useEffect(() => {
    // Only connect if realtime is enabled
    if (!realtimeEnabled) {
      return;
    }

    // Disable realtime updates if there are filters or search
    if (filter.length > 0 || !!textSearchFilter) {
      return;
    }

    if (!isCurrentTimestampIncluded) {
      return;
    }

    const eventSource = new EventSource(`/api/projects/${projectId}/realtime?key=traces`);

    eventSource.addEventListener("trace_update", (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.traces && Array.isArray(payload.traces)) {
          // Process batched trace updates
          for (const trace of payload.traces) {
            updateRealtimeTrace(trace);
          }
        }
      } catch (error) {
        console.error("Error processing trace update:", error);
      }
    });

    eventSource.addEventListener("error", (error) => {
      console.error("SSE connection error:", error);
    });

    // Clean up on unmount
    return () => {
      eventSource.close();
    };
  }, [projectId, isCurrentTimestampIncluded, filter.length, textSearchFilter, realtimeEnabled, updateRealtimeTrace]);

  // Initialize with default time range if needed
  useEffect(() => {
    if (!pastHours && !startDate && !endDate) {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("pastHours", "24");

      const currentFilters = searchParams.getAll("filter");
      if (currentFilters.length === 0 && presetFilters.length > 0) {
        presetFilters.forEach((filter) => {
          sp.append("filter", JSON.stringify(filter));
        });
      }

      router.replace(`${pathName}?${sp.toString()}`);
    }
  }, [pastHours, startDate, endDate, searchParams, pathName, router]);

  const handleRowClick = useCallback(
    (row: Row<TraceRow>) => {
      onRowClick?.(row.id);
      const params = new URLSearchParams(searchParams);
      params.set("traceId", row.id);
      params.delete("spanId");
      router.push(`${pathName}?${params.toString()}`);
    },
    [onRowClick, pathName, router, searchParams]
  );

  return (
    <div className="flex flex-1 overflow-hidden px-4 pb-4">
      <InfiniteDataTable<TraceRow>
        className="w-full"
        columns={columns}
        data={traces}
        getRowId={(trace) => trace.id}
        onRowClick={handleRowClick}
        focusedRowId={traceId || searchParams.get("traceId")}
        hasMore={hasMore}
        isFetching={isFetching}
        isLoading={isLoading}
        fetchNextPage={fetchNextPage}
        estimatedRowHeight={41}
        childrenClassName="flex flex-col gap-2 items-start h-fit space-x-0"
      >
        <div className="flex flex-1 w-full space-x-2">
          <DataTableFilter presetFilters={presetFilters} columns={filters} />
          <DateRangeFilter />
          <RefreshButton
            iconClassName="w-3.5 h-3.5 text-secondary-foreground"
            onClick={refetch}
            variant="outline"
            className="text-xs text-secondary-foreground"
          />
          <div className="flex items-center gap-2 px-2 border rounded-md bg-background h-7">
            <Switch id="realtime" checked={realtimeEnabled} onCheckedChange={setRealtimeEnabled} />
            <span className="text-xs cursor-pointer font-medium text-secondary-foreground">
              Realtime
            </span>
          </div>
          <SearchTracesInput />
        </div>
        <DataTableFilterList />
      </InfiniteDataTable>
    </div>
  );
}
