"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";
import { shallow } from "zustand/shallow";

import AdvancedSearch from "@/components/common/advanced-search";
import { filters } from "@/components/traces/sessions-table/columns";
import { SessionsStoreProvider, useSessionsStoreContext } from "@/components/traces/sessions-table/sessions-store";
import { useTracesStoreContext } from "@/components/traces/traces-store";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import DataTableFilter from "@/components/ui/infinite-datatable/ui/datatable-filter";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button.tsx";
import { useToast } from "@/lib/hooks/use-toast";
import { type SessionRow, type TraceRow } from "@/lib/traces/types";

import { type SessionSortColumn, type SortDirection } from "./session-table-header";
import SessionsVirtualList from "./sessions-virtual-list";

const FETCH_SIZE = 50;

export default function SessionsTable() {
  return (
    <DataTableStateProvider storageKey="sessions-table" uniqueKey="sessionId">
      <SessionsStoreProvider>
        <SessionsTableContent />
      </SessionsStoreProvider>
    </DataTableStateProvider>
  );
}

function SessionsTableContent() {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const { projectId } = useParams();
  const { toast } = useToast();
  const { setTraceId } = useTracesStoreContext((state) => ({
    setTraceId: state.setTraceId,
  }));

  const filter = searchParams.getAll("filter");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const pastHours = searchParams.get("pastHours");
  const textSearchFilter = searchParams.get("search");

  const sortColumnParam = searchParams.get("sortColumn") as SessionSortColumn | null;
  const sortDirectionParam = searchParams.get("sortDir") as SortDirection | null;
  const sortColumn = sortColumnParam ?? undefined;
  const sortDirection = sortDirectionParam ?? undefined;

  const { expandedSessions, loadingSessions, sessionTraces } = useSessionsStoreContext(
    (state) => ({
      expandedSessions: state.expandedSessions,
      loadingSessions: state.loadingSessions,
      sessionTraces: state.sessionTraces,
    }),
    shallow
  );

  const { toggleSession, collapseSession, setLoadingSession, setSessionTraces, resetExpandState } =
    useSessionsStoreContext(
      (state) => ({
        toggleSession: state.toggleSession,
        collapseSession: state.collapseSession,
        setLoadingSession: state.setLoadingSession,
        setSessionTraces: state.setSessionTraces,
        resetExpandState: state.resetExpandState,
      }),
      shallow
    );

  // Serialize filter array for stable dependency comparison
  const filterKey = JSON.stringify(filter);

  // Reset expanded/trace/timeline state when query params change
  useEffect(() => {
    resetExpandState();
  }, [
    endDate,
    filterKey,
    pastHours,
    projectId,
    sortColumn,
    sortDirection,
    startDate,
    textSearchFilter,
    resetExpandState,
  ]);

  // Initialize with default time range if needed
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

        if (sortColumn) urlParams.set("sortColumn", sortColumn);
        if (sortDirection) urlParams.set("sortDirection", sortDirection);

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
    [endDate, filter, pastHours, projectId, sortColumn, sortDirection, startDate, textSearchFilter, toast]
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
    deps: [endDate, filter, pastHours, projectId, sortColumn, sortDirection, startDate, textSearchFilter],
  });

  const handleToggleSession = useCallback(
    async (sessionId: string) => {
      const result = toggleSession(sessionId);
      if (result.action === "collapsed") return;

      const controller = result.controller;

      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", "0");
        urlParams.set("pageSize", "50");
        urlParams.set("filter", JSON.stringify({ column: "session_id", value: sessionId, operator: "eq" }));
        urlParams.set("sortDirection", "ASC");

        if (pastHours != null) urlParams.set("pastHours", pastHours);
        if (startDate != null) urlParams.set("startDate", startDate);
        if (endDate != null) urlParams.set("endDate", endDate);

        const res = await fetch(`/api/projects/${projectId}/traces?${urlParams.toString()}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch traces: ${res.status} ${res.statusText}`);
        }

        const traces = (await res.json()) as { items: TraceRow[] };

        if (controller.signal.aborted) return;

        setSessionTraces(sessionId, traces.items);
        setLoadingSession(sessionId, false);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to load traces. Please try again.",
          variant: "destructive",
        });
        collapseSession(sessionId);
        setLoadingSession(sessionId, false);
      }
    },
    [
      pastHours,
      startDate,
      endDate,
      projectId,
      toast,
      toggleSession,
      setLoadingSession,
      setSessionTraces,
      collapseSession,
    ]
  );

  const handleTraceClick = useCallback(
    (traceId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      setTraceId(traceId);
      params.set("traceId", traceId);
      router.push(`${pathName}?${params.toString()}`);
    },
    [setTraceId, pathName, router, searchParams]
  );

  const handleOpenSession = useCallback(
    (sessionId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      // `sessionId` is the source-of-truth for whether the session side panel
      // is open. Clear any `traceId` to avoid two side-panels overlapping.
      params.set("sessionId", sessionId);
      params.delete("traceId");
      params.delete("spanId");
      setTraceId(null);
      router.push(`${pathName}?${params.toString()}`);
    },
    [pathName, router, searchParams, setTraceId]
  );

  const handleSort = useCallback(
    (column: SessionSortColumn, direction: SortDirection) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("sortColumn", column);
      params.set("sortDir", direction);
      router.push(`${pathName}?${params.toString()}`);
    },
    [pathName, router, searchParams]
  );

  const handleClearSort = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("sortColumn");
    params.delete("sortDir");
    router.push(`${pathName}?${params.toString()}`);
  }, [pathName, router, searchParams]);

  return (
    <div className="flex flex-col overflow-hidden px-4 pb-6 h-full">
      <div className="flex flex-col gap-2 items-start mb-2">
        <div className="flex flex-1 w-full h-full gap-2">
          <DataTableFilter columns={filters} />
          <DateRangeFilter />
          <RefreshButton
            onClick={() => {
              resetExpandState();
              refetch();
            }}
            variant="outline"
          />
        </div>
        <div className="w-full px-px">
          <AdvancedSearch
            filters={filters}
            placeholder="Search by session ID, duration, cost, tokens and more..."
            className="w-full flex-1"
            storageKey="sessions"
          />
        </div>
      </div>
      <SessionsVirtualList
        sessions={sessions ?? []}
        expandedSessions={expandedSessions}
        loadingSessions={loadingSessions}
        sessionTraces={sessionTraces}
        onToggleSession={handleToggleSession}
        onTraceClick={handleTraceClick}
        onOpenSession={handleOpenSession}
        hasMore={hasMore}
        isFetching={isFetching}
        isLoading={isLoading || !shouldFetch}
        fetchNextPage={fetchNextPage}
        error={error}
        onRetry={refetch}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={handleSort}
        onClearSort={handleClearSort}
      />
    </div>
  );
}
