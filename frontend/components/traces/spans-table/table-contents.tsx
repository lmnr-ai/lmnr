"use client";

import { type Row } from "@tanstack/react-table";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { memo, type PropsWithChildren, type RefObject, useCallback, useEffect } from "react";

import { columns } from "@/components/traces/spans-table/columns";
import { FETCH_SIZE } from "@/components/traces/spans-table/constants";
import { useTracesStoreContext } from "@/components/traces/traces-store";
import SearchWiderRangeButton from "@/components/ui/date-range-filter/search-wider-range-button";
import { type DateRange } from "@/components/ui/date-range-filter/utils";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { TableCell, TableRow } from "@/components/ui/table";
import { useToast } from "@/lib/hooks/use-toast";
import { type SpanRow } from "@/lib/traces/types";

export interface SpansTableContentsProps {
  refetchRef: RefObject<() => void>;
  filter: string[];
  textSearchFilter: string | null;
  pastHours: string | null;
  startDate: string | null;
  endDate: string | null;
  isViewLoading: boolean;
}

export const SpansTableContents = memo(function SpansTableContents({
  children,
  refetchRef,
  filter,
  textSearchFilter,
  pastHours,
  startDate,
  endDate,
  isViewLoading,
}: PropsWithChildren<SpansTableContentsProps>) {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const { projectId } = useParams();
  const { toast } = useToast();
  const setTraceId = useTracesStoreContext((s) => s.setTraceId);
  const setSpanId = useTracesStoreContext((s) => s.setSpanId);
  const spanId = useTracesStoreContext((s) => s.spanId);

  const shouldFetch = !!(pastHours || startDate || endDate);

  const fetchSpans = useCallback(
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

        const url = `/api/projects/${projectId}/spans?${urlParams.toString()}`;

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

        const data = (await res.json()) as { items: SpanRow[] };
        return { items: data.items, count: 0 };
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load spans. Please try again.",
          variant: "destructive",
        });
        throw error;
      }
    },
    [endDate, filter, pastHours, projectId, startDate, textSearchFilter, toast]
  );

  const {
    data: spans,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
    refetch,
  } = useInfiniteScroll<SpanRow>({
    fetchFn: fetchSpans,
    enabled: shouldFetch && !isViewLoading,
    deps: [endDate, filter, pastHours, projectId, startDate, textSearchFilter],
  });

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch, refetchRef]);

  const handleRowClick = useCallback(
    (row: Row<SpanRow>) => {
      setTraceId(row.original.traceId);
      setSpanId(row.original.spanId);
    },
    [setSpanId, setTraceId]
  );

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

  const getRowHref = useCallback(
    (row: Row<SpanRow>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("traceId", row.original.traceId);
      params.set("spanId", row.original.spanId);
      return `${pathName}?${params.toString()}`;
    },
    [pathName, searchParams]
  );

  return (
    <InfiniteDataTable<SpanRow>
      className="w-full"
      columns={columns}
      data={spans}
      getRowId={(span) => span.spanId}
      onRowClick={handleRowClick}
      getRowHref={getRowHref}
      focusedRowId={spanId || searchParams.get("spanId")}
      hasMore={!textSearchFilter && hasMore}
      isFetching={isFetching}
      isLoading={isLoading || isViewLoading}
      fetchNextPage={fetchNextPage}
      emptyRow={
        filter.length === 0 && !textSearchFilter ? (
          <TableRow className="flex">
            <TableCell className="w-full h-auto p-4 rounded-b text-center">
              <div className="flex flex-col items-center gap-2">
                <span className="text-sm text-secondary-foreground">No spans in this time range</span>
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
