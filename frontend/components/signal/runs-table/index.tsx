"use client";

import { useParams } from "next/navigation";
import React, { useCallback, useState } from "react";

import { useSignalStoreContext } from "@/components/signal/store";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu";
import { StatefulFilter, StatefulFilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { useFiltersContextProvider } from "@/components/ui/infinite-datatable/ui/datatable-filter/context.tsx";
import { type SignalRunRow } from "@/lib/actions/signal-runs";
import { useToast } from "@/lib/hooks/use-toast";

import { defaultRunsColumnOrder, signalRunsColumns, signalRunsFilters } from "./columns";

const FETCH_SIZE = 50;

function RunsTableContent() {
  const { toast } = useToast();
  const params = useParams<{ projectId: string }>();
  const signal = useSignalStoreContext((state) => state.signal);

  const { value: filter } = useFiltersContextProvider();
  const [dateRange, setDateRange] = useState<{
    pastHours?: string;
    startDate?: string;
    endDate?: string;
  }>({
    pastHours: "24",
    startDate: undefined,
    endDate: undefined,
  });

  const fetchRuns = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());

        if (dateRange.pastHours) {
          urlParams.set("pastHours", dateRange.pastHours);
        }

        if (dateRange.startDate) {
          urlParams.set("startDate", dateRange.startDate);
        }

        if (dateRange.endDate) {
          urlParams.set("endDate", dateRange.endDate);
        }

        filter.forEach((f) => urlParams.append("filter", JSON.stringify(f)));

        const response = await fetch(
          `/api/projects/${params.projectId}/signals/${signal.id}/runs?${urlParams.toString()}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch signal runs");
        }

        const data: { items: SignalRunRow[] } = await response.json();
        return { items: data.items };
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load signal runs. Please try again.",
          variant: "destructive",
        });
      }
      return { items: [] };
    },
    [dateRange.pastHours, dateRange.startDate, dateRange.endDate, filter, params.projectId, signal.id, toast]
  );

  const {
    data: runs,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
  } = useInfiniteScroll<SignalRunRow>({
    fetchFn: fetchRuns,
    enabled: !!(dateRange.pastHours || (dateRange.startDate && dateRange.endDate)),
    deps: [params.projectId, signal.id, dateRange.pastHours, dateRange.startDate, dateRange.endDate, filter],
  });

  return (
    <div className="flex flex-col gap-2 flex-1 overflow-hidden">
      <InfiniteDataTable<SignalRunRow>
        className="w-full"
        columns={signalRunsColumns}
        data={runs}
        getRowId={(row: SignalRunRow) => row.runId}
        hasMore={hasMore}
        isFetching={isFetching}
        isLoading={isLoading}
        fetchNextPage={fetchNextPage}
      >
        <div className="flex flex-1 w-full space-x-2">
          <StatefulFilter columns={signalRunsFilters} />
          <ColumnsMenu
            columnLabels={signalRunsColumns.map((column) => ({
              id: column.id!,
              label: typeof column.header === "string" ? column.header : column.id!,
            }))}
          />
          <DateRangeFilter mode="state" value={dateRange} onChange={setDateRange} />
        </div>
        <StatefulFilterList className="py-[3px] text-xs px-1" />
      </InfiniteDataTable>
    </div>
  );
}

export default function SignalRunsTable() {
  return (
    <DataTableStateProvider
      storageKey="signal-runs-table"
      uniqueKey="runId"
      defaultColumnOrder={defaultRunsColumnOrder}
    >
      <RunsTableContent />
    </DataTableStateProvider>
  );
}
