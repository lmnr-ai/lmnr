"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect } from "react";

import { useSignalStoreContext } from "@/components/signal/store";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { type SignalRunRow } from "@/lib/actions/signal-runs";
import { useToast } from "@/lib/hooks/use-toast";

import { defaultRunsColumnOrder, signalRunsColumns, signalRunsFilters } from "./columns";

const FETCH_SIZE = 50;

function RunsTableContent() {
  const { toast } = useToast();
  const params = useParams<{ projectId: string }>();
  const signal = useSignalStoreContext((state) => state.signal);
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();

  const pastHours = searchParams.get("pastHours");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const filter = searchParams.getAll("filter");

  const fetchRuns = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());

        if (pastHours) {
          urlParams.set("pastHours", pastHours);
        }

        if (startDate) {
          urlParams.set("startDate", startDate);
        }

        if (endDate) {
          urlParams.set("endDate", endDate);
        }

        filter.forEach((f) => urlParams.append("filter", f));

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
    [pastHours, startDate, endDate, filter, signal.id, params.projectId, toast]
  );

  const {
    data: runs,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
  } = useInfiniteScroll<SignalRunRow>({
    fetchFn: fetchRuns,
    enabled: !!(pastHours || (startDate && endDate)),
    deps: [params.projectId, signal.id, pastHours, startDate, endDate, filter],
  });

  useEffect(() => {
    if (!pastHours && !startDate && !endDate) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("pastHours", "72");
      router.replace(`${pathName}?${params.toString()}`);
    }
  }, [pastHours, startDate, endDate, searchParams, pathName, router]);

  return (
    <div className="flex flex-col gap-2 flex-1">
      <InfiniteDataTable<SignalRunRow>
        className="w-full"
        columns={signalRunsColumns}
        data={runs}
        getRowId={(row: SignalRunRow) => row.runId}
        hasMore={hasMore}
        isFetching={isFetching}
        isLoading={isLoading}
        fetchNextPage={fetchNextPage}
        loadMoreButton
      >
        <div className="flex flex-1 w-full space-x-2">
          <DataTableFilter columns={signalRunsFilters} />
          <ColumnsMenu
            columnLabels={signalRunsColumns.map((column) => ({
              id: column.id!,
              label: typeof column.header === "string" ? column.header : column.id!,
            }))}
          />
          <DateRangeFilter />
        </div>
        <DataTableFilterList />
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
