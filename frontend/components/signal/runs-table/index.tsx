"use client";

import { type Row } from "@tanstack/react-table";
import { isEqual } from "lodash";
import { useParams, useRouter } from "next/navigation";
import React, { useCallback, useState } from "react";

import { useSignalStoreContext } from "@/components/signal/store";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { getDisplayRange, getTimeDifference } from "@/components/ui/date-range-filter/utils.ts";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu";
import FilterPopover, { FilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter/ui";
import { TableCell, TableRow } from "@/components/ui/table.tsx";
import { type Filter } from "@/lib/actions/common/filters";
import { Operator } from "@/lib/actions/common/operators.ts";
import { type SignalRunRow } from "@/lib/actions/signal-runs";
import { useToast } from "@/lib/hooks/use-toast";

import { defaultRunsColumnOrder, getSignalRunsColumns, signalRunsFilters } from "./columns";

const FETCH_SIZE = 50;

const getEmptyRow = ({
  startDate,
  endDate,
  pastHours,
}: {
  pastHours?: string;
  startDate?: string;
  endDate?: string;
}) => {
  const { from, to } = getDisplayRange({ startDate, endDate, pastHours });

  return (
    <TableRow className="flex">
      <TableCell className="text-center p-4 rounded-b w-full h-auto">
        <div className="flex flex-1 justify-center">
          <div className="flex flex-col gap-2 items-center max-w-md">
            <h3 className="text-base font-medium text-secondary-foreground">
              No runs in the {pastHours ? `last ${getTimeDifference(from, to)}` : "time range"}
            </h3>
            <p className="text-sm text-muted-foreground text-center">
              Whenever a signal is applied against a trace, a run will appear here. Runs show the results of signal
              execution on your traces.
            </p>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
};

function RunsTableContent() {
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams<{ projectId: string; id: string }>();
  const { signal, runsFilters, setRunsFilters, setTriggersFilters, setJobsFilters } = useSignalStoreContext(
    (state) => ({
      signal: state.signal,
      runsFilters: state.runsFilters,
      setRunsFilters: state.setRunsFilters,
      setTriggersFilters: state.setTriggersFilters,
      setJobsFilters: state.setJobsFilters,
    })
  );

  const filter = runsFilters;
  const [dateRange, setDateRange] = useState<{
    pastHours?: string;
    startDate?: string;
    endDate?: string;
  }>({
    pastHours: "24",
    startDate: undefined,
    endDate: undefined,
  });

  const handleAddFilter = useCallback(
    (newFilter: Filter) => {
      setRunsFilters((prev) => [...prev, newFilter]);
    },
    [setRunsFilters]
  );

  const handleRemoveFilter = useCallback(
    (filterToRemove: Filter) => {
      setRunsFilters((prev) => prev.filter((f) => !isEqual(f, filterToRemove)));
    },
    [setRunsFilters]
  );

  const onTriggerNav = (row: Row<SignalRunRow>) => {
    router.push(`/project/${params.projectId}/signals/${params.id}?tab=triggers`);
    setTriggersFilters([{ column: "trigger_id", operator: Operator.Eq, value: row.original.triggerId }]);
  };

  const onJobNav = (row: Row<SignalRunRow>) => {
    router.push(`/project/${params.projectId}/signals/${params.id}?tab=jobs`);
    setJobsFilters([{ column: "job_id", operator: Operator.Eq, value: row.original.jobId }]);
  };

  const columns = getSignalRunsColumns({ onTriggerNav, onJobNav });
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
        columns={columns}
        data={runs}
        getRowId={(row: SignalRunRow) => row.runId}
        hasMore={hasMore}
        isFetching={isFetching}
        isLoading={isLoading}
        fetchNextPage={fetchNextPage}
        emptyRow={getEmptyRow(dateRange)}
      >
        <div className="flex flex-1 w-full space-x-2">
          <FilterPopover columns={signalRunsFilters} filters={filter} onAddFilter={handleAddFilter} />
          <ColumnsMenu
            columnLabels={columns.map((column) => ({
              id: column.id!,
              label: typeof column.header === "string" ? column.header : column.id!,
            }))}
          />
          <DateRangeFilter mode="state" value={dateRange} onChange={setDateRange} />
        </div>
        <FilterList className="py-[3px] text-xs px-1" filters={filter} onRemoveFilter={handleRemoveFilter} />
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
