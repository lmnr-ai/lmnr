"use client";

import { Loader2, SquareArrowOutUpRight } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import CreateSignalDrawer from "@/components/signals/create-signal-drawer";
import SignalCards from "@/components/signals/signal-cards";
import SignalsBanner, { SignalsBannerInfoButton } from "@/components/signals/signals-banner";
import { Button } from "@/components/ui/button";
import DateRangeFilter, { type DateRange } from "@/components/ui/date-range-filter";
import { type DateRangeValue } from "@/components/ui/date-range-filter/store";
import DeleteSelectedRows from "@/components/ui/delete-selected-rows.tsx";
import Header from "@/components/ui/header.tsx";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import { type SignalRow } from "@/lib/actions/signals";
import { type SignalSparklineData } from "@/lib/actions/signals/stats";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

const SIGNAL_QUICK_RANGES: DateRange[] = [
  { name: "1 hour", value: "1" },
  { name: "3 hours", value: "3" },
  { name: "1 day", value: "24" },
  { name: "3 days", value: String(24 * 3) },
  { name: "1 week", value: String(24 * 7) },
  { name: "2 weeks", value: String(24 * 14) },
  { name: "1 month", value: String(24 * 30) },
];

export default function Signals() {
  return (
    <DataTableStateProvider storageKey="signals-cards" uniqueKey="id" defaultColumnOrder={[]}>
      <SignalsContent />
    </DataTableStateProvider>
  );
}

function SignalsContent() {
  const { projectId } = useParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [sparklineData, setSparklineData] = useState<SignalSparklineData>({});
  const [dateRange, setDateRange] = useState<DateRangeValue>({ pastHours: "168" });
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const searchParams = useSearchParams();
  const filter = searchParams.getAll("filter");
  const filterKey = useMemo(() => JSON.stringify(filter), [filter]);
  const search = searchParams.get("search");

  const FETCH_SIZE = 50;

  const fetchSignals = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());

        (JSON.parse(filterKey) as string[]).forEach((f) => urlParams.append("filter", f));

        if (typeof search === "string" && search.length > 0) {
          urlParams.set("search", search);
        }

        const response = await fetch(`/api/projects/${projectId}/signals?${urlParams.toString()}`);
        if (!response.ok) throw new Error("Failed to fetch signals");

        const data = (await response.json()) as { items: SignalRow[] };
        return { items: data.items };
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load signals.",
          variant: "destructive",
        });
        throw error;
      }
    },
    [filterKey, projectId, search, toast]
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
    enabled: true,
    deps: [filterKey, projectId, search],
  });

  const signalIdsCacheKey = useMemo(() => JSON.stringify(signals.map((s) => s.id)), [signals]);
  const pastHours = dateRange.pastHours ?? "168";

  useEffect(() => {
    setSparklineData({});
  }, [pastHours]);

  useEffect(() => {
    const allIds = JSON.parse(signalIdsCacheKey) as string[];
    const newIds = allIds.filter((id) => !(id in sparklineData));
    if (newIds.length === 0) return;

    const abortController = new AbortController();
    const urlParams = new URLSearchParams();
    newIds.forEach((id) => urlParams.append("signalId", id));
    urlParams.set("pastHours", pastHours);

    fetch(`/api/projects/${projectId}/signals/stats?${urlParams.toString()}`, {
      signal: abortController.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch sparkline stats: ${res.status}`);
        return res.json();
      })
      .then((data: SignalSparklineData) => {
        setSparklineData((prev) => ({ ...prev, ...data }));
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setSparklineData((prev) => {
          const updated = { ...prev };
          for (const id of newIds) {
            if (!(id in updated)) updated[id] = [];
          }
          return updated;
        });
        toast({
          title: "Failed to load sparkline data",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      });

    return () => abortController.abort();
  }, [signalIdsCacheKey, sparklineData, pastHours, projectId, toast]);

  const handleSuccess = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const handleDelete = useCallback(
    async (selectedRowIds: string[]) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/signals`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids: selectedRowIds }),
        });

        if (!res.ok) {
          throw new Error("Failed to delete signals");
        }

        updateData((currentData) => currentData.filter((s) => !selectedRowIds.includes(s.id)));
        setRowSelection({});
        track("signals", "deleted");

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
    [projectId, toast, updateData]
  );

  const sparklineMaxCount = useMemo(() => {
    let max = 0;
    for (const points of Object.values(sparklineData)) {
      for (const p of points) {
        if (p.count > max) max = p.count;
      }
    }
    return max;
  }, [sparklineData]);

  const selectedRowIds = useMemo(() => Object.keys(rowSelection).filter((id) => rowSelection[id]), [rowSelection]);

  // Infinite scroll via scroll container
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !hasMore || isFetching) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight - scrollTop - clientHeight < 200) {
        fetchNextPage();
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [hasMore, isFetching, fetchNextPage]);

  return (
    <>
      <Header path="signals">
        <SignalsBannerInfoButton />
      </Header>
      <div className="px-4 pb-4">
        <SignalsBanner onCreateSignal={() => setIsDialogOpen(true)} />
      </div>
      <div className="flex flex-col gap-4 overflow-hidden px-4 pb-4 h-full">
        <div className="flex items-center gap-2 pt-1">
          <DateRangeFilter
            mode="state"
            value={dateRange}
            onChange={setDateRange}
            quickRanges={SIGNAL_QUICK_RANGES}
            hideAbsoluteDate
          />
          <CreateSignalDrawer open={isDialogOpen} setOpen={setIsDialogOpen} onSuccess={handleSuccess}>
            <Button icon="plus" className="w-fit" onClick={() => setIsDialogOpen(true)}>
              Signal
            </Button>
          </CreateSignalDrawer>
          <div className="flex-1" />
          {selectedRowIds.length > 0 && (
            <>
              <span className="text-sm text-muted-foreground">{selectedRowIds.length} selected</span>
              <DeleteSelectedRows selectedRowIds={selectedRowIds} onDelete={handleDelete} entityName="signals" />
            </>
          )}
        </div>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-1 justify-center py-12">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : signals.length === 0 ? (
            <div className="flex flex-1 justify-center py-12">
              <div className="flex flex-col gap-2 items-center max-w-md">
                <h3 className="text-base font-medium text-secondary-foreground">No signals yet</h3>
                <p className="text-sm text-muted-foreground text-center">
                  Signals let you track outcomes, behaviors, and failures in your traces using LLM-based evaluation.
                  Click + Signal above to get started.
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
          ) : (
            <>
              <SignalCards
                signals={signals}
                projectId={projectId as string}
                sparklineData={sparklineData}
                sparklineMaxCount={sparklineMaxCount}
                selectedIds={rowSelection}
                onSelectionChange={setRowSelection}
              />
              {isFetching && (
                <div className="flex justify-center py-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
