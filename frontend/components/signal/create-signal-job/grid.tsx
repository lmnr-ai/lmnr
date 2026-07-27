"use client";

import { type Row } from "@tanstack/react-table";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { memo, type MutableRefObject, type ReactNode, useCallback, useEffect, useState } from "react";

import AdvancedSearch from "@/components/common/advanced-search";
import SelectionBanner from "@/components/signal/create-signal-job/selection-banner";
import { columns, filters as tableFilters } from "@/components/traces/traces-table/columns";
import { Button } from "@/components/ui/button";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll, useSelection } from "@/components/ui/infinite-datatable/hooks";
import { type Filter } from "@/lib/actions/common/filters";
import { useToast } from "@/lib/hooks/use-toast";
import { type TraceRow } from "@/lib/traces/types";

const FETCH_SIZE = 50;

export interface PendingJobState {
  selectionMode: "none" | "page" | "all";
  selectedIds: string[];
  traceCount: number;
  selectedCount: number;
}

export interface CreateSignalJobGridProps {
  chrome: ReactNode;
  filter: string[];
  search: string | null;
  dateRange: { pastHours?: string; startDate?: string; endDate?: string };
  refetchRef: MutableRefObject<() => void>;
  searchValue: { filters: Filter[]; search: string };
  onSearchChange: (value: { filters: Filter[]; search: string }) => void;
  onOpenConfirmDialog: (state: PendingJobState) => void;
  onTraceIdSelect: (id: string) => void;
}

export const CreateSignalJobGrid = memo(function CreateSignalJobGrid({
  chrome,
  filter,
  search,
  dateRange,
  refetchRef,
  searchValue,
  onSearchChange,
  onOpenConfirmDialog,
  onTraceIdSelect,
}: CreateSignalJobGridProps) {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();

  const { rowSelection, onRowSelectionChange } = useSelection();
  const [selectionMode, setSelectionMode] = useState<"none" | "page" | "all">("none");
  const [traceCount, setTraceCount] = useState(0);

  const fetchTraces = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("traceType", "DEFAULT");

        if (dateRange.pastHours) urlParams.set("pastHours", dateRange.pastHours);
        if (dateRange.startDate) urlParams.set("startDate", dateRange.startDate);
        if (dateRange.endDate) urlParams.set("endDate", dateRange.endDate);

        filter.forEach((f) => urlParams.append("filter", f));

        if (search && search.length > 0) urlParams.set("search", search);

        const tracesParams = new URLSearchParams(urlParams);
        tracesParams.set("pageNumber", pageNumber.toString());
        tracesParams.set("pageSize", FETCH_SIZE.toString());

        const [tracesRes, countRes] = await Promise.all([
          fetch(`/api/projects/${projectId}/traces?${tracesParams.toString()}`),
          fetch(`/api/projects/${projectId}/traces/count?${urlParams.toString()}`),
        ]);

        if (!tracesRes.ok) {
          const text = (await tracesRes.json()) as { error: string };
          throw new Error(text.error);
        }
        if (!countRes.ok) throw new Error("Failed to count traces");

        const [tracesData, countData] = await Promise.all([
          tracesRes.json() as Promise<{ items: TraceRow[] }>,
          countRes.json() as Promise<{ count: number }>,
        ]);

        setTraceCount(countData.count);

        if (selectionMode === "all") {
          const newKeys = tracesData.items.reduce((acc, t) => ({ ...acc, [t.id]: true }), rowSelection);
          onRowSelectionChange(newKeys);
        }

        return { items: tracesData.items, count: countData.count };
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to load traces. Please try again.",
          variant: "destructive",
        });
        setTraceCount(0);
        throw error;
      }
    },
    [dateRange, filter, search, projectId, selectionMode, rowSelection, onRowSelectionChange, toast]
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
    deps: [dateRange, filter, search, projectId],
  });

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch, refetchRef]);

  useEffect(() => {
    const selectedCount = Object.keys(rowSelection).length;
    if (selectedCount === 0) {
      setSelectionMode("none");
    } else if (selectedCount > 0 && selectionMode === "none") {
      setSelectionMode("page");
    }
  }, [rowSelection, selectionMode]);

  const handleSelectAll = useCallback(() => {
    setSelectionMode("all");
    const allTraceIds = traces.reduce(
      (acc, trace) => {
        acc[trace.id] = true;
        return acc;
      },
      {} as Record<string, boolean>
    );
    onRowSelectionChange(allTraceIds);
  }, [onRowSelectionChange, traces]);

  const handleClearSelection = useCallback(() => {
    setSelectionMode("none");
    onRowSelectionChange({});
  }, [onRowSelectionChange]);

  const selectedCount = Object.keys(rowSelection).length;

  const handleBackfillClick = useCallback(() => {
    onOpenConfirmDialog({
      selectionMode,
      selectedIds: selectionMode === "all" ? [] : Object.keys(rowSelection),
      traceCount,
      selectedCount,
    });
  }, [onOpenConfirmDialog, selectionMode, rowSelection, traceCount, selectedCount]);

  const getRowHref = useCallback(
    (row: Row<TraceRow>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("traceId", row.id);
      params.delete("spanId");
      return `${pathName}?${params.toString()}`;
    },
    [pathName, searchParams]
  );

  const traceIdFromUrl = searchParams.get("traceId");

  return (
    <InfiniteDataTable<TraceRow>
      className="w-full"
      columns={columns}
      data={traces}
      enableRowSelection
      getRowId={(trace) => trace.id}
      onRowClick={(r) => onTraceIdSelect(r.id)}
      focusedRowId={traceIdFromUrl}
      hasMore={!search && hasMore}
      isFetching={isFetching}
      isLoading={isLoading}
      fetchNextPage={fetchNextPage}
      hideSelectionPanel
      state={{ rowSelection }}
      onRowSelectionChange={onRowSelectionChange}
      getRowHref={getRowHref}
    >
      <div className="flex flex-1 w-full h-full items-center justify-between gap-2">
        {chrome}
        <Button onClick={handleBackfillClick} disabled={selectionMode === "none"}>
          {selectionMode === "none"
            ? "Create backfill"
            : `Create backfill (${selectionMode === "all" ? traceCount.toLocaleString() : selectedCount.toLocaleString()} traces)`}
        </Button>
      </div>
      <div className="w-full px-px">
        <AdvancedSearch
          storageKey="traces"
          filters={tableFilters}
          resource="traces"
          value={searchValue}
          onChange={({ filters, search: s }) => onSearchChange({ filters, search: s })}
          placeholder="Search by root span name, tokens, tags, full text and more..."
          className="w-full flex-1"
        />
      </div>
      <SelectionBanner
        selectionMode={selectionMode}
        selectedCount={selectedCount}
        traceCount={traceCount}
        loadedTraceCount={traces.length}
        onSelectAll={handleSelectAll}
        onClearSelection={handleClearSelection}
      />
    </InfiniteDataTable>
  );
});
