"use client";

import { type Row } from "@tanstack/react-table";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

import AdvancedSearch from "@/components/common/advanced-search";
import { columns, defaultSessionsColumnOrder, filters } from "@/components/traces/sessions-table/columns";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import DataTableFilter from "@/components/ui/infinite-datatable/ui/datatable-filter";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button.tsx";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";
import { type SessionRow } from "@/lib/traces/types";

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

  const filter = searchParams.getAll("filter");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const pastHours = searchParams.get("pastHours");
  const textSearchFilter = searchParams.get("search");

  useEffect(() => {
    if (!pastHours && !startDate && !endDate) {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("pastHours", "72");
      router.replace(`${pathName}?${sp.toString()}`);
    }
  }, [pastHours, startDate, endDate, searchParams, pathName, router]);

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

        filter.forEach((f) => urlParams.append("filter", f));

        if (typeof textSearchFilter === "string" && textSearchFilter.length > 0) {
          urlParams.set("search", textSearchFilter);
        }

        const url = `/api/projects/${projectId}/sessions?${urlParams.toString()}`;
        const res = await fetch(url, { method: "GET", headers: { "Content-Type": "application/json" } });

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
    error,
    fetchNextPage,
    refetch,
  } = useInfiniteScroll<SessionRow>({
    fetchFn: fetchSessions,
    enabled: shouldFetch,
    deps: [endDate, filter, pastHours, projectId, startDate, textSearchFilter],
  });

  const handleRowClick = useCallback(
    (row: Row<SessionRow>) => {
      const encodedSessionId = row.original.sessionId.split("/").map(encodeURIComponent).join("/");
      router.push(`/project/${projectId}/sessions/${encodedSessionId}`);
      track("sessions", "detail_opened", { source: "table" });
    },
    [projectId, router]
  );

  return (
    <div className="flex flex-1 overflow-hidden px-4 pb-4">
      <InfiniteDataTable<SessionRow>
        className="w-full"
        columns={columns}
        data={sessions}
        getRowId={(session) => session.sessionId}
        onRowClick={handleRowClick}
        hasMore={hasMore}
        isFetching={isFetching}
        isLoading={isLoading || !shouldFetch}
        fetchNextPage={fetchNextPage}
        error={error}
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
          <RefreshButton onClick={refetch} variant="outline" />
        </div>
        <div className="w-full px-px">
          <AdvancedSearch
            filters={filters}
            placeholder="Search by session ID, duration, cost, tokens and more..."
            className="w-full flex-1"
            storageKey="sessions"
          />
        </div>
      </InfiniteDataTable>
    </div>
  );
}
