"use client";

import { type ColumnDef, type Row } from "@tanstack/react-table";
import { useParams } from "next/navigation";
import { memo, type PropsWithChildren, useCallback } from "react";

import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { useToast } from "@/lib/hooks/use-toast";
import { type Trace } from "@/lib/traces/types";

const FETCH_SIZE = 50;

export interface PlaygroundHistoryTableContentsProps {
  columns: ColumnDef<Trace>[];
  playgroundId: string;
  onRowClick?: (trace: Trace) => void;
  onTraceSelect?: (traceId: string) => void;
}

export const PlaygroundHistoryTableContents = memo(function PlaygroundHistoryTableContents({
  children,
  columns,
  playgroundId,
  onRowClick,
  onTraceSelect,
}: PropsWithChildren<PlaygroundHistoryTableContentsProps>) {
  const { projectId } = useParams();
  const { toast } = useToast();

  const fetchTraces = useCallback(
    async (pageNumber: number) => {
      if (!projectId || !playgroundId) return { items: [], count: 0 };

      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());
        urlParams.set("pastHours", "168");
        urlParams.set("traceType", "PLAYGROUND");
        urlParams.append(
          "filter",
          JSON.stringify({ column: "metadata", operator: "eq", value: `playgroundId=${playgroundId}` })
        );

        const res = await fetch(`/api/projects/${projectId}/traces?${urlParams.toString()}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) throw new Error(`Failed to fetch traces: ${res.status} ${res.statusText}`);

        const data = await res.json();
        return { items: data.items, count: 0 };
      } catch (error) {
        toast({ title: "Failed to load playground history. Please try again.", variant: "destructive" });
        throw error;
      }
    },
    [projectId, playgroundId, toast]
  );

  const {
    data: traces,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
  } = useInfiniteScroll<Trace>({
    fetchFn: fetchTraces,
    enabled: !!projectId && !!playgroundId,
    deps: [projectId, playgroundId],
  });

  const handleRowClick = useCallback(
    (row: Row<Trace>) => {
      onRowClick?.(row.original);
      onTraceSelect?.(row.original.id);
    },
    [onRowClick, onTraceSelect]
  );

  return (
    <InfiniteDataTable<Trace>
      className="w-full"
      columns={columns}
      data={traces}
      getRowId={(trace) => trace.id}
      onRowClick={handleRowClick}
      hasMore={hasMore}
      isFetching={isFetching}
      isLoading={isLoading}
      fetchNextPage={fetchNextPage}
    >
      {children}
    </InfiniteDataTable>
  );
});
