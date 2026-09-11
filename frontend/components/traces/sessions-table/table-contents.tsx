"use client";

import { type Row } from "@tanstack/react-table";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { memo, type PropsWithChildren, type RefObject, useCallback, useEffect } from "react";

import { columns } from "@/components/traces/sessions-table/columns";
import { FETCH_SIZE } from "@/components/traces/sessions-table/constants";
import SearchWiderRangeButton from "@/components/ui/date-range-filter/search-wider-range-button";
import { type DateRange } from "@/components/ui/date-range-filter/utils";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { TableCell, TableRow } from "@/components/ui/table";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";
import { type SessionRow } from "@/lib/traces/types";

export interface SessionsTableContentsProps {
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

export const SessionsTableContents = memo(function SessionsTableContents({
  children,
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
}: PropsWithChildren<SessionsTableContentsProps>) {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();
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

  const searchWiderRange = useCallback(
    (range: DateRange) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("startDate");
      params.delete("endDate");
      params.delete("groupByInterval");
      params.set("pastHours", range.value);
      params.set("pageNumber", "0");
      router.push(`${pathName}?${params.toString()}`);
    },
    [pathName, router, searchParams]
  );

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
      emptyRow={
        filter.length === 0 && !textSearchFilter ? (
          <TableRow className="flex">
            <TableCell className="w-full h-auto p-4 rounded-b text-center">
              <div className="flex flex-col items-center gap-2">
                <span className="text-sm text-secondary-foreground">No sessions in this time range</span>
                <SearchWiderRangeButton
                  pastHours={pastHours}
                  startDate={startDate}
                  endDate={endDate}
                  onSelect={searchWiderRange}
                />
              </div>
            </TableCell>
          </TableRow>
        ) : undefined
      }
    >
      {children}
    </InfiniteDataTable>
  );
});
