"use client";

import { type Row } from "@tanstack/react-table";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import AdvancedSearch from "@/components/common/advanced-search";
import { filters as traceFilters } from "@/components/traces/traces-table/columns";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button";
import type { Filter } from "@/lib/actions/common/filters";
import type { TraceRow } from "@/lib/traces/types";

import { type TracePickerProps } from ".";
import { FETCH_SIZE, tracePickerColumns } from "./columns";

const TracePickerContent = ({
  onTraceSelect,
  focusedTraceId,
  excludeTraceId,
  description,
  fetchParams,
  className,
  mode = "state",
}: TracePickerProps) => {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // State-mode local state
  const [stateFilters, setStateFilters] = useState<{ filters: Filter[]; search: string }>({ filters: [], search: "" });
  const [stateDateRange, setStateDateRange] = useState<{
    pastHours?: string;
    startDate?: string;
    endDate?: string;
  }>({ pastHours: "24" });

  // URL-mode: set default pastHours=24 if no date params present
  useEffect(() => {
    if (mode !== "url") return;
    const hasPastHours = searchParams.has("pastHours");
    const hasStartDate = searchParams.has("startDate");
    const hasEndDate = searchParams.has("endDate");
    if (!hasPastHours && !hasStartDate && !hasEndDate) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("pastHours", "24");
      router.replace(`${pathname}?${params.toString()}`);
    }
  }, [mode, searchParams, router, pathname]);

  // Resolve effective values based on mode
  const effectiveFilter = useMemo(() => {
    if (mode === "url") return searchParams.getAll("filter");
    return stateFilters.filters.map((f) => JSON.stringify(f));
  }, [mode, searchParams, stateFilters.filters]);

  const effectiveSearch = useMemo(() => {
    if (mode === "url") return searchParams.get("search") ?? "";
    return stateFilters.search;
  }, [mode, searchParams, stateFilters.search]);

  const effectiveDateRange = useMemo(() => {
    if (mode === "url") {
      return {
        pastHours: searchParams.get("pastHours") ?? undefined,
        startDate: searchParams.get("startDate") ?? undefined,
        endDate: searchParams.get("endDate") ?? undefined,
      };
    }
    return stateDateRange;
  }, [mode, searchParams, stateDateRange]);

  const fetchTraces = useCallback(
    async (pageNumber: number) => {
      const urlParams = new URLSearchParams();

      if (fetchParams) {
        for (const [key, value] of Object.entries(fetchParams)) {
          urlParams.set(key, value);
        }
      }

      if (effectiveDateRange.pastHours) urlParams.set("pastHours", effectiveDateRange.pastHours);
      if (effectiveDateRange.startDate) urlParams.set("startDate", effectiveDateRange.startDate);
      if (effectiveDateRange.endDate) urlParams.set("endDate", effectiveDateRange.endDate);

      effectiveFilter.forEach((filter) => {
        urlParams.append("filter", filter);
      });

      if (excludeTraceId) {
        urlParams.append("filter", JSON.stringify({ column: "id", operator: "ne", value: excludeTraceId }));
      }

      if (effectiveSearch.length > 0) {
        urlParams.set("search", effectiveSearch);
      }

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
    [projectId, effectiveFilter, effectiveSearch, effectiveDateRange, fetchParams, excludeTraceId]
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
    enabled: !!(effectiveDateRange.pastHours || (effectiveDateRange.startDate && effectiveDateRange.endDate)),
    deps: [effectiveFilter, effectiveSearch, effectiveDateRange, projectId, fetchParams, excludeTraceId],
  });

  const handleRowClick = useCallback(
    (row: Row<TraceRow>) => {
      onTraceSelect(row.original);
    },
    [onTraceSelect]
  );

  return (
    <div className={className ?? "flex flex-col flex-1 gap-3 px-4 py-2 overflow-hidden"}>
      {description && <span className="text-secondary-foreground text-xs px-1">{description}</span>}

      <InfiniteDataTable<TraceRow>
        className="w-full flex-1"
        columns={tracePickerColumns}
        data={traces}
        getRowId={(t) => t.id}
        onRowClick={handleRowClick}
        focusedRowId={focusedTraceId}
        hasMore={!effectiveSearch && hasMore}
        isFetching={isFetching}
        isLoading={isLoading}
        fetchNextPage={fetchNextPage}
        estimatedRowHeight={36}
        lockedColumns={["status"]}
      >
        <div className="flex gap-2 w-full items-center">
          {mode === "url" ? (
            <DateRangeFilter mode="url" />
          ) : (
            <DateRangeFilter mode="state" value={stateDateRange} onChange={setStateDateRange} />
          )}
          <RefreshButton onClick={refetch} variant="outline" />
        </div>
        <div className="w-full px-px">
          {mode === "url" ? (
            <AdvancedSearch
              mode="url"
              filters={traceFilters}
              resource="traces"
              placeholder="Search traces..."
              className="w-full flex-1"
              options={{ disableHotKey: true }}
            />
          ) : (
            <AdvancedSearch
              mode="state"
              filters={traceFilters}
              resource="traces"
              value={stateFilters}
              onSubmit={(f, search) => setStateFilters({ filters: f, search })}
              placeholder="Search traces..."
              className="w-full flex-1"
              options={{ disableHotKey: true }}
            />
          )}
        </div>
      </InfiniteDataTable>
    </div>
  );
};

export default TracePickerContent;
