"use client";

import { Row } from "@tanstack/react-table";
import { get } from "lodash";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

import SearchInput from "@/components/common/search-input";
import { columns, defaultSessionsColumnOrder, filters } from "@/components/traces/sessions-table/columns";
import { useTraceViewNavigation } from "@/components/traces/trace-view/navigation-context";
import { useTracesStoreContext } from "@/components/traces/traces-store";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button.tsx";
import { useToast } from "@/lib/hooks/use-toast";
import { SessionRow, TraceRow } from "@/lib/traces/types";
import DateRangeFilter from "@/shared/ui/date-range-filter";

const FETCH_SIZE = 50;

export default function SessionsTable() {
  return (
    <DataTableStateProvider
      storageKey="sessions-table"
      uniqueKey="sessionId"
      defaultColumnOrder={defaultSessionsColumnOrder}
    >
      <SessionsTableContent />
    </DataTableStateProvider>
  );
}

function SessionsTableContent() {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const { projectId } = useParams();
  const { toast } = useToast();
  const { setTraceId, traceId } = useTracesStoreContext((state) => ({
    setTraceId: state.setTraceId,
    traceId: state.traceId,
  }));

  const filter = searchParams.getAll("filter");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const pastHours = searchParams.get("pastHours");
  const textSearchFilter = searchParams.get("search");

  const { setNavigationRefList } = useTraceViewNavigation();

  // Initialize with default time range if needed - do this BEFORE useInfiniteScroll
  useEffect(() => {
    if (!pastHours && !startDate && !endDate) {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("pastHours", "24");
      router.replace(`${pathName}?${sp.toString()}`);
    }
  }, [pastHours, startDate, endDate, searchParams, pathName, router]);

  // Only enable fetching when we have valid time params
  const shouldFetch = !!(pastHours || startDate || endDate);

  const fetchSessions = useCallback(
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

        const url = `/api/projects/${projectId}/sessions?${urlParams.toString()}`;

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

        const data = (await res.json()) as { items: SessionRow[] };
        return { items: data.items, count: 0 };
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load sessions. Please try again.",
          variant: "destructive",
        });
        throw error;
      }
    },
    [endDate, filter, pastHours, projectId, startDate, textSearchFilter, toast]
  );

  const {
    data: sessions,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
    refetch,
    updateData,
    error,
  } = useInfiniteScroll<SessionRow>({
    fetchFn: fetchSessions,
    enabled: shouldFetch,
    deps: [endDate, filter, pastHours, projectId, startDate, textSearchFilter],
  });

  useEffect(() => {
    setNavigationRefList((sessions || [])?.flatMap((s) => s?.subRows)?.map((t) => t?.id));
  }, [setNavigationRefList, sessions]);

  const handleRowClick = useCallback(
    async (row: Row<SessionRow>) => {
      // If clicking on a trace row (not a session row with subRows)
      if (!row.original.subRows) {
        const params = new URLSearchParams(searchParams);
        setTraceId(row.original.id);
        params.set("traceId", row.original.id);
        router.push(`${pathName}?${params.toString()}`);
        return;
      }

      const isCurrentlyExpanded = row.getIsExpanded();
      row.toggleExpanded();

      // If collapsing, clear the subRows
      if (isCurrentlyExpanded) {
        updateData((sessions) =>
          sessions?.map((s) => {
            if (s.sessionId === row.original.sessionId) {
              return {
                ...s,
                subRows: [],
              };
            }
            return s;
          })
        );
        return;
      }

      // If expanding, fetch traces for this session
      const filter = {
        column: "session_id",
        value: row.original.sessionId,
        operator: "eq",
      };

      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", "0");
        urlParams.set("pageSize", "50");
        urlParams.set("filter", JSON.stringify(filter));

        if (pastHours != null) urlParams.set("pastHours", pastHours);
        if (startDate != null) urlParams.set("startDate", startDate);
        if (endDate != null) urlParams.set("endDate", endDate);

        const res = await fetch(`/api/projects/${projectId}/traces?${urlParams.toString()}`);

        if (!res.ok) {
          throw new Error(`Failed to fetch traces: ${res.status} ${res.statusText}`);
        }

        const traces = (await res.json()) as { items: TraceRow[] };

        // Update the session with its subRows (traces)
        updateData((sessions) =>
          sessions?.map((s) => {
            if (s.sessionId === row.original.sessionId) {
              return {
                ...s,
                subRows: traces.items.toReversed(),
              };
            }
            return s;
          })
        );
      } catch (error) {
        toast({
          title: "Failed to load traces. Please try again.",
          variant: "destructive",
        });
        // Collapse the row again since we failed to fetch
        row.toggleExpanded();
      }
    },
    [setTraceId, pathName, projectId, router, searchParams, pastHours, startDate, endDate, toast, updateData]
  );

  return (
    <div className="flex overflow-hidden px-4 pb-6">
      <InfiniteDataTable<SessionRow>
        className="w-full"
        columns={columns}
        data={sessions}
        getRowId={(session) => get(session, ["id"], session.sessionId)}
        onRowClick={handleRowClick}
        focusedRowId={traceId || searchParams.get("traceId")}
        hasMore={hasMore}
        isFetching={isFetching}
        isLoading={isLoading || !shouldFetch}
        fetchNextPage={fetchNextPage}
        error={error}
      >
        <div className="flex flex-1 w-full space-x-2">
          <DataTableFilter columns={filters} />
          <ColumnsMenu
            columnLabels={columns.map((column) => ({
              id: column.id!,
              label: typeof column.header === "string" ? column.header : column.id!,
            }))}
          />
          <DateRangeFilter />
          <RefreshButton onClick={refetch} variant="outline" />
          <SearchInput placeholder="Search in sessions..." />
        </div>
        <DataTableFilterList />
      </InfiniteDataTable>
    </div>
  );
}
