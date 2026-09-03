"use client";

import { type Row } from "@tanstack/react-table";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { memo, type PropsWithChildren, type RefObject, useCallback, useEffect, useMemo } from "react";

import { signalTraceHref, useSignalTraceParams } from "@/components/signal/hooks/use-signal-trace-params";
import { runTraceParams } from "@/components/signal/runs-table/columns/event-cell";
import { FETCH_SIZE } from "@/components/signal/runs-table/constants";
import { useSignalStoreContext } from "@/components/signal/store";
import { getDisplayRange, getTimeDifference } from "@/components/ui/date-range-filter/utils";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { TableCell, TableRow } from "@/components/ui/table";
import { type Filter } from "@/lib/actions/common/filters";
import { type SignalRunRow } from "@/lib/actions/signal-runs/types";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

import { getSignalRunsColumns } from "./columns";

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

export interface RunsTableContentsProps {
  refetchRef: RefObject<() => void>;
  filters: Filter[];
  dateRange: { pastHours?: string; startDate?: string; endDate?: string };
}

export const RunsTableContents = memo(function RunsTableContents({
  children,
  refetchRef,
  filters,
  dateRange,
}: PropsWithChildren<RunsTableContentsProps>) {
  const { toast } = useToast();
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const signal = useSignalStoreContext((state) => state.signal);
  const [{ traceId, eventId }, setTraceParams] = useSignalTraceParams();

  // Factory returns a fresh array each call; memoize to keep the cell-content token stable.
  const columns = useMemo(() => getSignalRunsColumns(), []);

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

  const focusedRowId = useMemo(() => {
    if (!runs) return undefined;
    if (eventId) {
      const byEvent = runs.find((run) => run.eventId === eventId);
      if (byEvent) return byEvent.runId;
    }
    if (traceId) return runs.find((run) => run.traceId === traceId)?.runId;
    return undefined;
  }, [runs, eventId, traceId]);

  const getRowHref = useCallback(
    (row: Row<SignalRunRow>) => signalTraceHref(pathName, searchParams.toString(), runTraceParams(row.original)),
    [pathName, searchParams]
  );

  const handleRowClick = useCallback(
    (row: Row<SignalRunRow>) => {
      track("signals", "run_to_trace");
      void setTraceParams(runTraceParams(row.original));
    },
    [setTraceParams]
  );

  return (
    <InfiniteDataTable<SignalRunRow>
      className="w-full"
      columns={columns}
      data={runs}
      getRowId={(row: SignalRunRow) => row.runId}
      onRowClick={handleRowClick}
      getRowHref={getRowHref}
      focusedRowId={focusedRowId}
      hasMore={hasMore}
      isFetching={isFetching}
      isLoading={isLoading}
      fetchNextPage={fetchNextPage}
      emptyRow={getEmptyRow(dateRange)}
    >
      {children}
    </InfiniteDataTable>
  );
});
