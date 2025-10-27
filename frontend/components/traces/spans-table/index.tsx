"use client";
import { Row } from "@tanstack/react-table";
import { map } from "lodash";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

import SearchInput from "@/components/common/search-input";
import RefreshButton from "@/components/traces/refresh-button";
import { columns, filters } from "@/components/traces/spans-table/columns";
import { useTraceViewNavigation } from "@/components/traces/trace-view/navigation-context";
import { useTracesStoreContext } from "@/components/traces/traces-store";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/datatable-filter";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/datatable-store";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { useToast } from "@/lib/hooks/use-toast";
import { SpanRow } from "@/lib/traces/types";

const FETCH_SIZE = 50;

export default function SpansTable() {
  return (
    <DataTableStateProvider uniqueKey="spanId">
      <SpansTableContent />
    </DataTableStateProvider>
  );
}

function SpansTableContent() {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const { projectId } = useParams();
  const { toast } = useToast();

  const { setTraceId, setSpanId, spanId } = useTracesStoreContext((state) => ({
    setTraceId: state.setTraceId,
    spanId: state.spanId,
    setSpanId: state.setSpanId,
  }));

  const filter = searchParams.getAll("filter");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const pastHours = searchParams.get("pastHours");
  const textSearchFilter = searchParams.get("search");

  const { setNavigationRefList } = useTraceViewNavigation();

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

        filter.forEach((filter) => urlParams.append("filter", filter));

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
    enabled: shouldFetch,
    deps: [endDate, filter, pastHours, projectId, startDate, textSearchFilter],
  });

  useEffect(() => {
    setNavigationRefList(map(spans, (s) => ({ spanId: s.spanId, traceId: s.traceId })));
  }, [setNavigationRefList, spans]);

  useEffect(() => {
    setSpanId(searchParams.get("spanId") ?? null);
  }, [searchParams, setSpanId]);

  // Initialize with default time range if needed
  useEffect(() => {
    if (!pastHours && !startDate && !endDate) {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("pastHours", "24");
      router.replace(`${pathName}?${sp.toString()}`);
    }
  }, [pastHours, startDate, endDate, searchParams, pathName, router]);

  const handleRowClick = useCallback(
    (row: Row<SpanRow>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("traceId", row.original.traceId);
      params.set("spanId", row.original.spanId);
      router.push(`${pathName}?${params.toString()}`);
      setTraceId(row.original.traceId);
      setSpanId(row.original.spanId);
    },
    [pathName, router, searchParams, setSpanId, setTraceId]
  );

  return (
    <div className="flex overflow-hidden px-4 pb-6">
      <InfiniteDataTable<SpanRow>
        className="w-full"
        columns={columns}
        data={spans}
        getRowId={(span) => span.spanId}
        onRowClick={handleRowClick}
        focusedRowId={spanId || searchParams.get("spanId")}
        hasMore={hasMore}
        isFetching={isFetching}
        isLoading={isLoading}
        fetchNextPage={fetchNextPage}
        estimatedRowHeight={41}
        childrenClassName="flex flex-col gap-2 items-start h-fit space-x-0"
      >
        <div className="flex flex-1 w-full space-x-2">
          <DataTableFilter columns={filters} />
          <DateRangeFilter />
          <RefreshButton iconClassName="w-3.5 h-3.5" onClick={refetch} variant="outline" className="text-xs" />
          <SearchInput placeholder="Search in spans..." />
        </div>
        <DataTableFilterList />
      </InfiniteDataTable>
    </div>
  );
}
