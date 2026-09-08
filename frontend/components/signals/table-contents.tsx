"use client";

import { SquareArrowOutUpRight } from "lucide-react";
import { useParams } from "next/navigation";
import { memo, type PropsWithChildren, type RefObject, useCallback, useEffect, useMemo, useState } from "react";

import { signalsColumns } from "@/components/signals/columns";
import { FETCH_SIZE } from "@/components/signals/constants";
import { SignalSparklineProvider } from "@/components/signals/sparkline-context";
import DeleteSelectedRows from "@/components/ui/delete-selected-rows.tsx";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll, useSelection } from "@/components/ui/infinite-datatable/hooks";
import { TableCell, TableRow } from "@/components/ui/table";
import { type SignalRow } from "@/lib/actions/signals";
import { type SignalSparklineData } from "@/lib/actions/signals/stats";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

const EMPTY_SPARKLINES: SignalSparklineData = {};

// Drops the previous series when the window changed under an in-flight request.
function mergeSparklines(
  prev: { pastHours: string; data: SignalSparklineData },
  pastHours: string,
  incoming: SignalSparklineData
) {
  const base = prev.pastHours === pastHours ? prev.data : EMPTY_SPARKLINES;
  return { pastHours, data: { ...base, ...incoming } };
}

const EmptyRow = (
  <TableRow className="flex">
    <TableCell className="text-center p-4 rounded-b w-full h-auto">
      <div className="flex flex-1 justify-center">
        <div className="flex flex-col gap-2 items-center max-w-md">
          <h3 className="text-base font-medium text-secondary-foreground">No signals yet</h3>
          <p className="text-sm text-muted-foreground text-center">
            Signals let you track outcomes, behaviors, and failures in your traces using LLM-based evaluation. Click +
            Signal above to get started.
          </p>
          <a
            href="https://laminar.sh/docs/signals"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Learn more
            <SquareArrowOutUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </TableCell>
  </TableRow>
);

export interface SignalsTableContentsProps {
  refetchRef: RefObject<() => void>;
  filter: string[];
  search: string | null;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  onSort: (columnId: string, direction: "asc" | "desc") => void;
  isViewLoading: boolean;
  /** Window the per-signal sparkline series is aggregated over. */
  sparklinePastHours: string;
}

export const SignalsTableContents = memo(function SignalsTableContents({
  children,
  refetchRef,
  filter,
  search,
  sortBy,
  sortDirection,
  onSort,
  isViewLoading,
  sparklinePastHours,
}: PropsWithChildren<SignalsTableContentsProps>) {
  const { projectId } = useParams();
  const { toast } = useToast();
  const { rowSelection, onRowSelectionChange } = useSelection();
  // The window is stored alongside the series so a window change invalidates the
  // cache during render, rather than via a reset effect that re-renders twice.
  const [sparklineCache, setSparklineCache] = useState<{ pastHours: string; data: SignalSparklineData }>({
    pastHours: sparklinePastHours,
    data: {},
  });
  const sparklineData = sparklineCache.pastHours === sparklinePastHours ? sparklineCache.data : EMPTY_SPARKLINES;

  const fetchSignals = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());

        filter.forEach((f) => urlParams.append("filter", f));

        if (typeof search === "string" && search.length > 0) {
          urlParams.set("search", search);
        }

        if (sortBy) {
          urlParams.set("sortBy", sortBy);
          if (sortDirection) urlParams.set("sortDirection", sortDirection.toUpperCase());
        }

        const res = await fetch(`/api/projects/${projectId}/signals?${urlParams.toString()}`);
        if (!res.ok) {
          const message = await res
            .json()
            .then((d) => d?.error)
            .catch(() => null);
          throw new Error(message ?? "Failed to fetch signals");
        }

        const data = (await res.json()) as { items: SignalRow[] };
        return { items: data.items };
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load signals.",
          variant: "destructive",
        });
        throw error;
      }
    },
    [filter, projectId, search, sortBy, sortDirection, toast]
  );

  const {
    data: signals,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
    refetch,
    updateData,
  } = useInfiniteScroll<SignalRow>({
    fetchFn: fetchSignals,
    enabled: !isViewLoading,
    deps: [projectId, filter, search, sortBy, sortDirection],
  });

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch, refetchRef]);

  // Sparklines are a separate batch fetch keyed on the ids currently loaded.
  const signalIdsCacheKey = useMemo(() => JSON.stringify(signals.map((s) => s.id)), [signals]);

  useEffect(() => {
    const allIds = JSON.parse(signalIdsCacheKey) as string[];
    const newIds = allIds.filter((id) => !(id in sparklineData));
    if (newIds.length === 0) return;

    const abortController = new AbortController();
    const urlParams = new URLSearchParams();
    newIds.forEach((id) => urlParams.append("signalId", id));
    urlParams.set("pastHours", sparklinePastHours);

    fetch(`/api/projects/${projectId}/signals/stats?${urlParams.toString()}`, { signal: abortController.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch sparkline stats: ${res.status}`);
        return res.json();
      })
      .then((data: SignalSparklineData) => setSparklineCache((prev) => mergeSparklines(prev, sparklinePastHours, data)))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Mark them resolved-but-empty so the cells stop showing skeletons.
        const empties = Object.fromEntries(newIds.map((id) => [id, []]));
        setSparklineCache((prev) => mergeSparklines(prev, sparklinePastHours, empties));
        toast({
          title: "Failed to load sparkline data",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      });

    return () => abortController.abort();
  }, [signalIdsCacheKey, sparklineData, sparklinePastHours, projectId, toast]);

  const sparklineContext = useMemo(() => {
    let maxCount = 0;
    for (const signal of signals) {
      for (const point of sparklineData[signal.id] ?? []) {
        if (point.count > maxCount) maxCount = point.count;
      }
    }
    return { data: sparklineData, maxCount };
  }, [signals, sparklineData]);

  const handleDelete = useCallback(
    async (selectedRowIds: string[]) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/signals`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: selectedRowIds }),
        });

        if (!res.ok) throw new Error("Failed to delete signals");

        updateData((currentData) => currentData.filter((s) => !selectedRowIds.includes(s.id)));
        onRowSelectionChange({});
        track("signals", "deleted", { count: selectedRowIds.length });
        toast({
          title: "Signals deleted",
          description: `Successfully deleted ${selectedRowIds.length} signal(s).`,
        });
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to delete signals. Please try again.",
          variant: "destructive",
        });
      }
    },
    [projectId, toast, updateData, onRowSelectionChange]
  );

  return (
    <SignalSparklineProvider value={sparklineContext}>
      <InfiniteDataTable<SignalRow>
        className="w-full"
        enableRowSelection
        getRowHref={(row) => `/project/${projectId}/signals/${row.original.id}`}
        getRowId={(row) => row.id}
        getRowClassName={(row) => (row.original.disabled ? "opacity-60" : "")}
        columns={signalsColumns}
        data={signals}
        estimatedRowHeight={64}
        hasMore={hasMore}
        isFetching={isFetching}
        isLoading={isLoading || isViewLoading}
        fetchNextPage={fetchNextPage}
        state={{ rowSelection }}
        onRowSelectionChange={onRowSelectionChange}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSort={onSort}
        emptyRow={filter.length === 0 && !search ? EmptyRow : undefined}
        selectionPanel={(selectedRowIds) => (
          <div className="flex flex-col space-y-2">
            <DeleteSelectedRows selectedRowIds={selectedRowIds} onDelete={handleDelete} entityName="signals" />
          </div>
        )}
      >
        {children}
      </InfiniteDataTable>
    </SignalSparklineProvider>
  );
});
