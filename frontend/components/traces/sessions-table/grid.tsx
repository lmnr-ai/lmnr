"use client";

import { type Row } from "@tanstack/react-table";
import { useParams, useRouter } from "next/navigation";
import { memo, type ReactNode, type RefObject, useCallback, useEffect } from "react";

import { columns } from "@/components/traces/sessions-table/columns";
import { FETCH_SIZE } from "@/components/traces/sessions-table/constants";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";
import { type SessionRow } from "@/lib/traces/types";

export interface SessionsTableGridProps {
  chrome: ReactNode;
  refetchRef: RefObject<() => void>;
  filter: string[];
  textSearchFilter: string | null;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  onSort: (columnId: string, direction: "asc" | "desc") => void;
  pastHours: string | null;
  startDate: string | null;
  endDate: string | null;
  isViewLoading: boolean;
}

export const SessionsTableGrid = memo(function SessionsTableGrid({
  chrome,
  refetchRef,
  filter,
  textSearchFilter,
  sortBy,
  sortDirection,
  onSort,
  pastHours,
  startDate,
  endDate,
  isViewLoading,
}: SessionsTableGridProps) {
  const router = useRouter();
  const { projectId } = useParams();
  const { toast } = useToast();

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

        if (sortBy) {
          urlParams.set("sortColumn", sortBy);
          if (sortDirection) urlParams.set("sortDirection", sortDirection.toUpperCase());
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
    [endDate, filter, pastHours, projectId, sortBy, sortDirection, startDate, textSearchFilter, toast]
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
    enabled: shouldFetch && !isViewLoading,
    deps: [endDate, filter, pastHours, projectId, sortBy, sortDirection, startDate, textSearchFilter],
  });

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch, refetchRef]);

  const handleRowClick = useCallback(
    (row: Row<SessionRow>) => {
      const encodedSessionId = row.original.sessionId.split("/").map(encodeURIComponent).join("/");
      router.push(`/project/${projectId}/sessions/${encodedSessionId}`);
      track("sessions", "detail_opened", { source: "table" });
    },
    [projectId, router]
  );

  return (
    <InfiniteDataTable<SessionRow>
      className="w-full"
      columns={columns}
      data={sessions}
      getRowId={(session) => session.sessionId}
      onRowClick={handleRowClick}
      hasMore={hasMore}
      isFetching={isFetching}
      isLoading={isLoading || !shouldFetch || isViewLoading}
      fetchNextPage={fetchNextPage}
      error={error}
      sortBy={sortBy}
      sortDirection={sortDirection}
      onSort={onSort}
    >
      {chrome}
    </InfiniteDataTable>
  );
});
