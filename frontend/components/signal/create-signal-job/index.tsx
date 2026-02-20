"use client";

import type { Row } from "@tanstack/react-table";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Resizable, type ResizeCallback } from "re-resizable";
import React, { useCallback, useEffect, useRef, useState } from "react";

import AdvancedSearch from "@/components/common/advanced-search";
import ConfirmSignalJobDialog from "@/components/signal/create-signal-job/confirm-signal-job-dialog";
import SelectionBanner from "@/components/signal/create-signal-job/selection-banner.tsx";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import TraceView from "@/components/traces/trace-view";
import { getDefaultTraceViewWidth } from "@/components/traces/trace-view/utils";
import {
  columns,
  defaultTracesColumnOrder,
  filters as tableFilters,
} from "@/components/traces/traces-table/columns.tsx";
import { Button } from "@/components/ui/button.tsx";
import DateRangeFilter from "@/components/ui/date-range-filter";
import Header from "@/components/ui/header.tsx";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll, useSelection } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store.tsx";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button.tsx";
import type { Filter } from "@/lib/actions/common/filters.ts";
import { setEventsTraceViewWidthCookie } from "@/lib/actions/traces/cookies";
import { useToast } from "@/lib/hooks/use-toast.ts";
import type { TraceRow } from "@/lib/traces/types.ts";

const FETCH_SIZE = 50;

const CreateSignalJobContent = () => {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();
  const ref = useRef<Resizable>(null);

  const signal = useSignalStoreContext((state) => state.signal);
  const { rowSelection, onRowSelectionChange } = useSelection();

  const [isCreating, setIsCreating] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [filters, setFilters] = useState<{ filters: Filter[]; search: string }>({ filters: [], search: "" });
  const [dateRange, setDateRange] = useState<{
    pastHours?: string;
    startDate?: string;
    endDate?: string;
  }>({
    pastHours: "24",
    startDate: undefined,
    endDate: undefined,
  });

  const [traceCount, setTraceCount] = useState(0);
  const [selectionMode, setSelectionMode] = useState<"none" | "page" | "all">("none");

  const { traceId, spanId, setTraceId, setSpanId, initialTraceViewWidth } = useSignalStoreContext((state) => ({
    traceId: state.traceId,
    spanId: state.spanId,
    setTraceId: state.setTraceId,
    setSpanId: state.setSpanId,
    initialTraceViewWidth: state.initialTraceViewWidth,
  }));

  const [defaultTraceViewWidth, setDefaultTraceViewWidth] = useState(initialTraceViewWidth || 1000);

  useEffect(() => {
    if (!initialTraceViewWidth) {
      setDefaultTraceViewWidth(getDefaultTraceViewWidth());
    }
  }, [initialTraceViewWidth]);

  const handleResizeStop: ResizeCallback = (_event, _direction, _elementRef, delta) => {
    const newWidth = defaultTraceViewWidth + delta.width;
    setDefaultTraceViewWidth(newWidth);
    setEventsTraceViewWidthCookie(newWidth).catch((e) => console.warn(`Failed to save value to cookies. ${e}`));
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (defaultTraceViewWidth > window.innerWidth - 180) {
        const newWidth = window.innerWidth - 240;
        setDefaultTraceViewWidth(newWidth);
        setEventsTraceViewWidthCookie(newWidth);
        ref?.current?.updateSize({ width: newWidth });
      }
    }
  }, [defaultTraceViewWidth]);

  const fetchTraces = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("traceType", "DEFAULT");

        if (dateRange.pastHours) urlParams.set("pastHours", dateRange.pastHours);
        if (dateRange.startDate) urlParams.set("startDate", dateRange.startDate);
        if (dateRange.endDate) urlParams.set("endDate", dateRange.endDate);

        filters.filters.forEach((filter) => {
          urlParams.append("filter", JSON.stringify(filter));
        });

        if (filters.search.length > 0) {
          urlParams.set("search", filters.search);
        }

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

        if (!countRes.ok) {
          throw new Error("Failed to count traces");
        }

        const [tracesData, countData] = await Promise.all([
          tracesRes.json() as Promise<{ items: TraceRow[] }>,
          countRes.json() as Promise<{ count: number }>,
        ]);

        setTraceCount(countData.count);

        if (selectionMode === "all") {
          const newKeys = tracesData.items.reduce(
            (previousValue, currentValue) => ({
              ...previousValue,
              [currentValue.id]: true,
            }),
            rowSelection
          );
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
    [
      dateRange.endDate,
      dateRange.pastHours,
      dateRange.startDate,
      filters.filters,
      filters.search,
      onRowSelectionChange,
      projectId,
      rowSelection,
      selectionMode,
      toast,
    ]
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
    deps: [dateRange, filters, projectId],
  });

  const getRowHref = useCallback(
    (row: Row<TraceRow>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("traceId", row.id);
      params.delete("spanId");
      return `${pathName}?${params.toString()}`;
    },
    [pathName, searchParams]
  );

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

  const handleOpenConfirmDialog = useCallback(() => {
    setConfirmDialogOpen(true);
  }, []);

  const handleCreateSignalJob = useCallback(async () => {
    try {
      setIsCreating(true);
      const selectedTraceIds = selectionMode === "all" ? undefined : Object.keys(rowSelection);
      const selectedCount = selectionMode === "all" ? traceCount : (selectedTraceIds?.length ?? 0);

      const response = await fetch(`/api/projects/${projectId}/signals/${signal.id}/jobs`, {
        method: "POST",
        body: JSON.stringify({
          // Zod expects filters to be stringified
          filter: filters.filters.map((filter) => JSON.stringify(filter)),
          search: filters.search || undefined,
          pastHours: dateRange.pastHours,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          traceIds: selectedTraceIds,
          tracesCount: selectedCount,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to create signal job");
      }

      setConfirmDialogOpen(false);
      router.push(`/project/${projectId}/signals/${signal.id}?tab=jobs`);
      toast({
        title: "Signal job created",
        description: `Job for "${signal.name}" has been queued for ${selectedCount?.toLocaleString() ?? "selected"} traces.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create signal job. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  }, [
    selectionMode,
    rowSelection,
    traceCount,
    projectId,
    signal.id,
    signal.name,
    filters.filters,
    filters.search,
    dateRange.pastHours,
    dateRange.startDate,
    dateRange.endDate,
    router,
    toast,
  ]);

  const traceIdFromUrl = searchParams.get("traceId");

  const selectedCount = Object.keys(rowSelection).length;

  return (
    <>
      <ConfirmSignalJobDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        isCreating={isCreating}
        onConfirm={handleCreateSignalJob}
        traceCount={selectionMode === "all" ? traceCount : selectedCount}
      />
      <Header
        path={[
          { name: "signals", href: `/project/${projectId}/signals` },
          { name: signal.name, href: `/project/${projectId}/signals/${signal.id}?tab=jobs` },
          { name: "create signal job" },
        ]}
      />
      <div className="flex gap-2 px-4 pt-2 pb-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Selected traces will be analyzed against the{" "}
            <span className="font-medium text-foreground">"{signal.name}"</span> signal. You can select specific traces
            or all matching traces based on your current filters and time range.
          </p>
        </div>
        <Button className="ml-auto" onClick={handleOpenConfirmDialog} disabled={selectionMode === "none"}>
          {selectionMode === "none"
            ? "Create signal job"
            : `Create signal job (${selectionMode === "all" ? traceCount.toLocaleString() : selectedCount.toLocaleString()} traces)`}
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden px-4 pb-4">
        <InfiniteDataTable<TraceRow>
          className="w-full"
          columns={columns}
          data={traces}
          enableRowSelection
          getRowId={(trace) => trace.id}
          onRowClick={(r) => setTraceId(r.id)}
          focusedRowId={traceIdFromUrl}
          hasMore={!filters.search && hasMore}
          isFetching={isFetching}
          isLoading={isLoading}
          fetchNextPage={fetchNextPage}
          hideSelectionPanel
          state={{
            rowSelection,
          }}
          onRowSelectionChange={onRowSelectionChange}
          getRowHref={getRowHref}
          lockedColumns={["__row_selection", "status"]}
        >
          <div className="flex flex-1 w-full h-full gap-2">
            <ColumnsMenu
              lockedColumns={["__row_selection", "status"]}
              columnLabels={columns.map((column) => ({
                id: column.id!,
                label: typeof column.header === "string" ? column.header : column.id!,
              }))}
            />
            <DateRangeFilter mode="state" value={dateRange} onChange={setDateRange} />
            <RefreshButton onClick={refetch} variant="outline" />
          </div>
          <div className="w-full px-px">
            <AdvancedSearch
              mode="state"
              filters={tableFilters}
              resource="traces"
              value={filters}
              onSubmit={(filters, search) => setFilters({ filters, search })}
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
            onClearSelection={() => {
              setSelectionMode("none");
              onRowSelectionChange({});
            }}
          />
        </InfiniteDataTable>
      </div>
      {traceId && (
        <div className="absolute top-0 right-0 bottom-0 bg-background border-l z-60 flex pointer-events-auto">
          <Resizable
            ref={ref}
            onResizeStop={handleResizeStop}
            enable={{
              left: true,
            }}
            defaultSize={{
              width: defaultTraceViewWidth,
            }}
          >
            <TraceView
              spanId={spanId || undefined}
              key={traceId}
              onClose={() => {
                const params = new URLSearchParams(searchParams);
                params.delete("traceId");
                params.delete("spanId");
                router.push(`${pathName}?${params.toString()}`);
                setTraceId(null);
                setSpanId(null);
              }}
              traceId={traceId}
            />
          </Resizable>
        </div>
      )}
    </>
  );
};

export default function CreateSignalJob({ traceId }: { traceId?: string }) {
  const { setTraceId } = useSignalStoreContext((state) => ({
    setTraceId: state.setTraceId,
  }));

  useEffect(() => {
    setTraceId(traceId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DataTableStateProvider defaultColumnOrder={["__row_selection", ...defaultTracesColumnOrder]}>
      <CreateSignalJobContent />
    </DataTableStateProvider>
  );
}
