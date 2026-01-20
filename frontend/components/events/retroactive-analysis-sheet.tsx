"use client";

import { type Row } from "@tanstack/react-table";
import { ChevronsRight } from "lucide-react";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import React, { type PropsWithChildren, useCallback, useState } from "react";

import AdvancedSearch from "@/components/common/advanced-search";
import { useEventsStoreContext } from "@/components/events/events-store";
import { columns, defaultTracesColumnOrder, filters as tableFilters } from "@/components/traces/traces-table/columns";
import { Button } from "@/components/ui/button";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { type Filter } from "@/lib/actions/common/filters";
import { useToast } from "@/lib/hooks/use-toast";
import { type TraceRow } from "@/lib/traces/types";

const FETCH_SIZE = 50;

interface RetroactiveAnalysisSheetProps {
  eventDefinitionId: string;
  eventDefinitionName: string;
}

export default function RetroactiveAnalysisSheet({
  children,
  eventDefinitionId,
  eventDefinitionName,
}: PropsWithChildren<RetroactiveAnalysisSheetProps>) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        side="right"
        className="min-w-[80vw] w-full flex flex-col gap-0 p-0 focus:outline-none"
      >
        <DataTableStateProvider
          storageKey={`retroactive-analysis-${eventDefinitionId}`}
          defaultColumnOrder={defaultTracesColumnOrder}
        >
          <RetroactiveAnalysisSheetContent
            eventDefinitionId={eventDefinitionId}
            eventDefinitionName={eventDefinitionName}
            setOpen={setOpen}
          />
        </DataTableStateProvider>
      </SheetContent>
    </Sheet>
  );
}

function TracesTableWithSearch({
  eventDefinitionId,
  eventDefinitionName,
  setOpen,
}: RetroactiveAnalysisSheetProps & { setOpen: (open: boolean) => void }) {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();

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

  const setTraceId = useEventsStoreContext((state) => state.setTraceId);

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
    [dateRange, filters, projectId, toast]
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

  const handleStartAnalysis = useCallback(async () => {
    try {
      await fetch(`/api/projects/${projectId}/trace-analysis-jobs`, {
        method: "POST",
        body: JSON.stringify({
          projectId,
          eventDefinitionId,
          filter: filters.filters.map((f) => JSON.stringify(f)),
          search: filters.search || undefined,
          pastHours: dateRange.pastHours,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        }),
      });

      toast({
        title: "Analysis started",
        description: `Retroactive analysis for "${eventDefinitionName}" has been queued for ${traceCount?.toLocaleString() ?? "selected"} traces.`,
      });

      setOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start analysis. Please try again.",
        variant: "destructive",
      });
    }
  }, [eventDefinitionId, eventDefinitionName, traceCount, toast, projectId, filters, dateRange, setOpen]);

  const traceIdFromUrl = searchParams.get("traceId");

  return (
    <>
      <SheetHeader className="flex flex-row items-center gap-2 pt-4 px-2 pb-4 border-b">
        <Button className="mb-0" size="icon" variant="ghost" onClick={() => setOpen(false)}>
          <ChevronsRight className="size-5" />
        </Button>
        <SheetTitle className="mb-0">Retroactive Analysis</SheetTitle>
        <Button className="ml-auto" onClick={handleStartAnalysis}>
          Start Analysis
        </Button>
      </SheetHeader>

      <div className="flex flex-1 overflow-hidden p-4">
        <InfiniteDataTable<TraceRow>
          className="w-full"
          columns={columns}
          data={traces}
          getRowId={(trace) => trace.id}
          onRowClick={(r) => setTraceId(r.id)}
          focusedRowId={traceIdFromUrl}
          hasMore={!filters.search && hasMore}
          isFetching={isFetching}
          isLoading={isLoading}
          fetchNextPage={fetchNextPage}
          getRowHref={getRowHref}
          lockedColumns={["status"]}
        >
          <div className="flex flex-1 w-full h-full gap-2">
            <ColumnsMenu
              lockedColumns={["status"]}
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
        </InfiniteDataTable>
      </div>
    </>
  );
}

function RetroactiveAnalysisSheetContent({
  eventDefinitionId,
  eventDefinitionName,
  setOpen,
}: RetroactiveAnalysisSheetProps & { setOpen: (open: boolean) => void }) {
  return (
    <TracesTableWithSearch
      eventDefinitionId={eventDefinitionId}
      eventDefinitionName={eventDefinitionName}
      setOpen={setOpen}
    />
  );
}
