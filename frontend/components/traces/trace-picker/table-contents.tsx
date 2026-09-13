"use client";

import { type Row } from "@tanstack/react-table";
import { useParams } from "next/navigation";
import { memo, type PropsWithChildren, type RefObject, useCallback, useEffect } from "react";

import SearchWiderRangeButton from "@/components/ui/date-range-filter/search-wider-range-button";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { TableCell, TableRow } from "@/components/ui/table";
import { type Filter } from "@/lib/actions/common/filters";
import { type TraceRow } from "@/lib/traces/types";

import { FETCH_SIZE, tracePickerColumns } from "./columns";

export interface TracePickerContentsProps {
  filters: Filter[];
  search: string | null;
  dateRange: { pastHours?: string; startDate?: string; endDate?: string };
  onDateRangeChange: (range: { pastHours?: string; startDate?: string; endDate?: string }) => void;
  refetchRef: RefObject<() => void>;
  onTraceSelect: (trace: TraceRow) => void;
  focusedTraceId?: string | null;
  excludeTraceId?: string;
  fetchParams?: Record<string, string>;
}

export const TracePickerContents = memo(function TracePickerContents({
  children,
  filters,
  search,
  dateRange,
  onDateRangeChange,
  refetchRef,
  onTraceSelect,
  focusedTraceId,
  excludeTraceId,
  fetchParams,
}: PropsWithChildren<TracePickerContentsProps>) {
  const { projectId } = useParams<{ projectId: string }>();

  const fetchTraces = useCallback(
    async (pageNumber: number) => {
      const urlParams = new URLSearchParams();

      if (fetchParams) {
        for (const [key, value] of Object.entries(fetchParams)) {
          urlParams.set(key, value);
        }
      }

      if (dateRange.pastHours) urlParams.set("pastHours", dateRange.pastHours);
      if (dateRange.startDate) urlParams.set("startDate", dateRange.startDate);
      if (dateRange.endDate) urlParams.set("endDate", dateRange.endDate);

      filters.forEach((filter) => {
        urlParams.append("filter", JSON.stringify(filter));
      });

      if (excludeTraceId) {
        urlParams.append("filter", JSON.stringify({ column: "id", operator: "ne", value: excludeTraceId }));
      }

      if (search && search.length > 0) urlParams.set("search", search);

      urlParams.set("pageNumber", pageNumber.toString());
      urlParams.set("pageSize", FETCH_SIZE.toString());

      const res = await fetch(`/api/projects/${projectId}/traces?${urlParams.toString()}`);
      if (!res.ok) {
        const text = (await res.json()) as { error: string };
        throw new Error(text.error);
      }

      const data = (await res.json()) as { items: TraceRow[] };
      return { items: data.items ?? [], count: undefined };
    },
    [projectId, filters, search, dateRange, fetchParams, excludeTraceId]
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
    deps: [filters, search, dateRange, projectId, fetchParams, excludeTraceId],
  });

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch, refetchRef]);

  const handleRowClick = useCallback(
    (row: Row<TraceRow>) => {
      onTraceSelect(row.original);
    },
    [onTraceSelect]
  );

  return (
    <InfiniteDataTable<TraceRow>
      className="w-full flex-1"
      columns={tracePickerColumns}
      data={traces}
      getRowId={(t) => t.id}
      onRowClick={handleRowClick}
      focusedRowId={focusedTraceId}
      hasMore={!search && hasMore}
      isFetching={isFetching}
      isLoading={isLoading}
      fetchNextPage={fetchNextPage}
      estimatedRowHeight={36}
      emptyRow={
        filters.length === 0 && !search ? (
          <TableRow className="flex">
            <TableCell className="w-full h-auto p-4 rounded-b text-center">
              <div className="flex flex-col items-center gap-2">
                <span className="text-sm text-secondary-foreground">No traces in this time range</span>
                <SearchWiderRangeButton
                  {...dateRange}
                  onSelect={(range) => onDateRangeChange({ pastHours: range.value })}
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
