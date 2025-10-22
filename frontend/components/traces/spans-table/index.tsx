"use client";
import { map } from "lodash";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import SearchInput from "@/components/common/search-input";
import RefreshButton from "@/components/traces/refresh-button";
import { columns, filters } from "@/components/traces/spans-table/columns";
import { useTraceViewNavigation } from "@/components/traces/trace-view/navigation-context";
import { useTracesStoreContext } from "@/components/traces/traces-store";
import { useToast } from "@/lib/hooks/use-toast";
import { SpanRow } from "@/lib/traces/types";
import { PaginatedResponse } from "@/lib/types";

import { DataTable } from "../../ui/datatable";
import DataTableFilter, { DataTableFilterList } from "../../ui/datatable-filter";
import DateRangeFilter from "../../ui/date-range-filter";

export default function SpansTable() {
  const { projectId } = useParams();
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { setTraceId, setSpanId, spanId } = useTracesStoreContext((state) => ({
    setTraceId: state.setTraceId,
    spanId: state.spanId,
    setSpanId: state.setSpanId,
  }));

  const pageNumber = searchParams.get("pageNumber") ? parseInt(searchParams.get("pageNumber")!) : 0;
  const pageSize = searchParams.get("pageSize") ? parseInt(searchParams.get("pageSize")!) : 50;
  const filter = searchParams.getAll("filter");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const pastHours = searchParams.get("pastHours");
  const textSearchFilter = searchParams.get("search");

  const [spans, setSpans] = useState<SpanRow[] | undefined>(undefined);
  const [totalCount, setTotalCount] = useState<number>(0); // including the filtering
  const pageCount = useMemo(() => Math.ceil(totalCount / pageSize), [totalCount, pageSize]);

  const { setNavigationRefList } = useTraceViewNavigation();

  useEffect(() => {
    setNavigationRefList(map(spans, (s) => ({ spanId: s.spanId, traceId: s.traceId })));
  }, [setNavigationRefList, spans]);

  const getSpans = useCallback(async () => {
    try {
      setSpans(undefined);

      const urlParams = new URLSearchParams();
      urlParams.set("pageNumber", pageNumber.toString());
      urlParams.set("pageSize", pageSize.toString());

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
        throw new Error(`Failed to fetch spans: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as PaginatedResponse<SpanRow>;

      setSpans(data.items);
      setTotalCount(data.totalCount);
    } catch (error) {
      toast({
        title: "Failed to load spans. Please try again.",
        variant: "destructive",
      });
      // Set empty spans to show error state
      setSpans([]);
      setTotalCount(0);
    }
  }, [
    endDate,
    pageNumber,
    pageSize,
    pastHours,
    pathName,
    projectId,
    router,
    searchParams,
    startDate,
    textSearchFilter,
    filter,
    toast,
  ]);

  useEffect(() => {
    if (pastHours || startDate || endDate) {
      getSpans();
    } else {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("pastHours", "24");
      router.push(`${pathName}?${sp.toString()}`);
    }
  }, [projectId, pageNumber, pageSize, JSON.stringify(filter), pastHours, startDate, endDate, textSearchFilter]);

  const handleDeleteSpans = useCallback(
    async (spanIds: string[]) => {
      const params = new URLSearchParams(spanIds.map((id) => ["id", id]));

      try {
        const response = await fetch(`/api/projects/${projectId}/spans?${params.toString()}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          toast({
            title: "Failed to delete Span",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Spans deleted",
            description: `Successfully deleted ${spanIds.length} span(s).`,
          });
          setSpans((prev) => {
            if (prev) {
              return prev.filter((s) => !spanIds.includes(s.spanId));
            }
            return prev;
          });
          setTotalCount((prev) => Math.max(prev - spanIds.length, 0));
        }
      } catch (e) {
        toast({
          title: e instanceof Error ? e.message : "Failed to delete spans. Please try again.",
          variant: "destructive",
        });
      }
    },
    [projectId, toast]
  );

  const handleRowClick = useCallback(
    (row: SpanRow) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("traceId", row.traceId);
      params.set("spanId", row.spanId);
      router.push(`${pathName}?${params.toString()}`);
      setTraceId(row.traceId);
      setSpanId(row.spanId);
    },
    [pathName, router, searchParams, setSpanId, setTraceId]
  );

  const onPageChange = useCallback(
    (pageNumber: number, pageSize: number) => {
      const params = new URLSearchParams(searchParams);
      params.set("pageNumber", pageNumber.toString());
      params.set("pageSize", pageSize.toString());
      router.push(`${pathName}?${params.toString()}`);
    },
    [pathName, router, searchParams]
  );

  useEffect(() => {
    setSpanId(searchParams.get("spanId") ?? null);
  }, [searchParams]);

  return (
    <div className="flex overflow-hidden px-4 pb-4">
      <DataTable
        className="w-full"
        columns={columns}
        data={spans}
        getRowId={(span) => span.spanId}
        onRowClick={(row) => {
          handleRowClick(row.original);
        }}
        focusedRowId={spanId || searchParams.get("spanId")}
        pageCount={pageCount}
        defaultPageSize={pageSize}
        defaultPageNumber={pageNumber}
        onPageChange={onPageChange}
        totalItemsCount={totalCount}
        childrenClassName="flex flex-col gap-2 items-start h-fit space-x-0"
      >
        <div className="flex flex-1 w-full space-x-2">
          <DataTableFilter columns={filters} />
          <DateRangeFilter />
          <RefreshButton iconClassName="w-3.5 h-3.5" onClick={getSpans} variant="outline" className="text-xs" />
          <SearchInput placeholder="Search in spans..." />
        </div>
        <DataTableFilterList />
      </DataTable>
    </div>
  );
}
