"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";

import AdvancedSearch from "@/components/common/advanced-search";
import { filters } from "@/components/traces/sessions-table/columns";
import { SessionsStoreProvider, useSessionsStoreContext } from "@/components/traces/sessions-table/sessions-store";
import { useTraceViewNavigation } from "@/components/traces/trace-view/navigation-context";
import { useTracesStoreContext } from "@/components/traces/traces-store";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import DataTableFilter from "@/components/ui/infinite-datatable/ui/datatable-filter";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button.tsx";
import { useToast } from "@/lib/hooks/use-toast";
import { type SessionRow, type TraceRow, type TraceTimelineItem } from "@/lib/traces/types";

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

  const { setNavigationRefList } = useTraceViewNavigation();

  const { expandedSessions, loadingSessions, sessionTraces, sessionTimelines } = useSessionsStoreContext(
    (state) => ({
      expandedSessions: state.expandedSessions,
      loadingSessions: state.loadingSessions,
      sessionTraces: state.sessionTraces,
      sessionTimelines: state.sessionTimelines,
    }),
    shallow
  );

  const {
    expandSession,
    collapseSession,
    setLoadingSession,
    setSessionTraces,
    mergeSessionTimelines,
    mergeTraceIO,
    setLoadingSessionIO,
    resetExpandState,
    getController,
  } = useSessionsStoreContext((state) => ({
    expandSession: state.expandSession,
    collapseSession: state.collapseSession,
    setLoadingSession: state.setLoadingSession,
    setSessionTraces: state.setSessionTraces,
    mergeSessionTimelines: state.mergeSessionTimelines,
    mergeTraceIO: state.mergeTraceIO,
    setLoadingSessionIO: state.setLoadingSessionIO,
    resetExpandState: state.resetExpandState,
    getController: state.getController,
  }));

  // Serialize filter array for stable dependency comparison
  const filterKey = JSON.stringify(filter);

  // Version counter to discard stale fetch responses after param changes
  const fetchVersionRef = useRef(0);

  // Reset expanded/trace/timeline state when query params change
  useEffect(() => {
    fetchVersionRef.current += 1;
    resetExpandState();
  }, [endDate, filterKey, pastHours, projectId, startDate, textSearchFilter, resetExpandState]);

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
      const version = fetchVersionRef.current;
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

        const data = (await res.json()) as { items: SessionRow[]; timelines: Record<string, TraceTimelineItem[]> };
        // Only merge timelines if params haven't changed since this fetch started
        if (fetchVersionRef.current === version) {
          mergeSessionTimelines(data.timelines);
        }
        return { items: data.items, count: 0 };
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load sessions. Please try again.",
          variant: "destructive",
        });
        throw error;
      }
    },
    [endDate, filter, pastHours, projectId, startDate, textSearchFilter, toast, mergeSessionTimelines]
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

  // Update navigation ref list from expanded session traces (in rendered order)
  const allVisibleTraceIds = useMemo(() => {
    const ids: string[] = [];
    for (const session of sessions) {
      if (expandedSessions.has(session.sessionId)) {
        const traces = sessionTraces[session.sessionId] ?? [];
        ids.push(...traces.map((t) => t.id));
      }
    }
    return ids;
  }, [sessions, sessionTraces, expandedSessions]);

  useEffect(() => {
    setNavigationRefList(allVisibleTraceIds);
  }, [setNavigationRefList, allVisibleTraceIds]);

  const handleToggleSession = useCallback(
    async (sessionId: string) => {
      const isExpanded = expandedSessions.has(sessionId);

      if (isExpanded) {
        collapseSession(sessionId);
        return;
      }

      // Expand: fetch traces for this session
      const controller = getController(sessionId);
      expandSession(sessionId);
      setLoadingSession(sessionId, true);

      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", "0");
        urlParams.set("pageSize", "50");
        urlParams.set("filter", JSON.stringify({ column: "session_id", value: sessionId, operator: "eq" }));

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

        const traceIds = traces.items.map((t) => t.id);
        if (traceIds.length > 0) {
          setLoadingSessionIO(sessionId, true);
          try {
            const ioRes = await fetch(`/api/projects/${projectId}/traces/io`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ traceIds }),
              signal: controller.signal,
            });
            if (controller.signal.aborted) return;
            if (ioRes.ok) {
              const ioData = (await ioRes.json()) as Record<string, { input: string | null; output: string | null }>;
              if (!controller.signal.aborted) {
                mergeTraceIO(ioData);
              }
            }
          } catch (ioError) {
            if (ioError instanceof DOMException && ioError.name === "AbortError") return;
          } finally {
            setLoadingSessionIO(sessionId, false);
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        toast({ title: "Failed to load traces. Please try again.", variant: "destructive" });
        // Collapse on failure
        collapseSession(sessionId);
      } finally {
        setLoadingSession(sessionId, false);
      }
    },
    [
      expandedSessions,
      pastHours,
      startDate,
      endDate,
      projectId,
      toast,
      expandSession,
      setLoadingSession,
      setSessionTraces,
      mergeTraceIO,
      setLoadingSessionIO,
      collapseSession,
      getController,
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

  return (
    <div className="flex flex-col overflow-hidden px-4 pb-6 h-full">
      <div className="flex flex-col gap-2 items-start mb-2">
        <div className="flex flex-1 w-full h-full gap-2">
          <DataTableFilter columns={filters} />
          <DateRangeFilter />
          <RefreshButton
            onClick={() => {
              fetchVersionRef.current += 1;
              resetExpandState();
              refetch();
            }}
            variant="outline"
          />
        </div>
        <div className="w-full px-px">
          <AdvancedSearch
            filters={filters}
            resource="sessions"
            placeholder="Search by session ID, duration, cost, tokens and more..."
            className="w-full flex-1"
          />
        </div>
      </div>
      <SessionsVirtualList
        sessions={sessions ?? []}
        expandedSessions={expandedSessions}
        loadingSessions={loadingSessions}
        sessionTraces={sessionTraces}
        sessionTimelines={sessionTimelines}
        onToggleSession={handleToggleSession}
        onTraceClick={handleTraceClick}
        hasMore={hasMore}
        isFetching={isFetching}
        isLoading={isLoading || !shouldFetch}
        fetchNextPage={fetchNextPage}
        error={error}
        onRetry={refetch}
      />
    </div>
  );
}
