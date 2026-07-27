"use client";

import { useParams } from "next/navigation";
import { memo, type MutableRefObject, type ReactNode, useCallback, useEffect } from "react";

import { useSignalStoreContext } from "@/components/signal/store";
import { getDisplayRange, getTimeDifference } from "@/components/ui/date-range-filter/utils";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { TableCell, TableRow } from "@/components/ui/table";
import { type Filter } from "@/lib/actions/common/filters";
import { type SignalRunRow } from "@/lib/actions/signal-runs";
import { useToast } from "@/lib/hooks/use-toast";

import { getSignalRunsColumns } from "./columns";

const FETCH_SIZE = 50;

function getEmptyRow({ pastHours, startDate, endDate }: { pastHours?: string; startDate?: string; endDate?: string }) {
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
}

export interface RunsTableGridProps {
  chrome: ReactNode;
  refetchRef: MutableRefObject<() => void>;
  filters: Filter[];
  dateRange: { pastHours?: string; startDate?: string; endDate?: string };
}

export const RunsTableGrid = memo(function RunsTableGrid({
  chrome,
  refetchRef,
  filters,
  dateRange,
}: RunsTableGridProps) {
  const { toast } = useToast();
  const params = useParams<{ projectId: string }>();
  const signal = useSignalStoreContext((state) => state.signal);

  const columns = getSignalRunsColumns();

  const fetchRuns = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());

        if (dateRange.pastHours) urlParams.set("pastHours", dateRange.pastHours);
        if (dateRange.startDate) urlParams.set("startDate", dateRange.startDate);
        if (dateRange.endDate) urlParams.set("endDate", dateRange.endDate);

        filters.forEach((f) => urlParams.append("filter", JSON.stringify(f)));

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
    [dateRange.pastHours, dateRange.startDate, dateRange.endDate, filters, params.projectId, signal.id, toast]
  );

  const {
    data: runs,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
    refetch,
  } = useInfiniteScroll<SignalRunRow>({
    fetchFn: fetchRuns,
    enabled: !!(dateRange.pastHours || (dateRange.startDate && dateRange.endDate)),
    deps: [params.projectId, signal.id, dateRange.pastHours, dateRange.startDate, dateRange.endDate, filters],
  });

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch, refetchRef]);

  return (
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
      {chrome}
    </InfiniteDataTable>
  );
});
