import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";

import { useSessionViewStore } from "@/components/traces/session-view/store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

import { useChatViewStore } from "../store";
import { useTurnDataStore } from "../turn-data";
import TimeDivider from "./time-divider";
import Turn from "./turn";

// Gaps shorter than this between turns aren't worth a divider.
const MIN_GAP_MS = 10 * 60_000;
// Near the median rendered turn (bubble + stats row + clipped reply).
const ESTIMATED_TURN_HEIGHT = 260;
// Turns rendered (and whose counts/replies are fetched) beyond each edge of the viewport.
const OVERSCAN = 6;

export default function Thread() {
  const { projectId, traces, isLoading, error, fetchAgentOutputs } = useSessionViewStore(
    (s) => ({
      projectId: s.projectId,
      traces: s.traces,
      isLoading: s.isTracesLoading,
      error: s.tracesError,
      fetchAgentOutputs: s.fetchAgentOutputs,
    }),
    shallow
  );
  const openTraceId = useChatViewStore((s) => s.openTraceId);
  const fetchCounts = useTurnDataStore((s) => s.fetchCounts);

  const gaps = useMemo(
    () =>
      traces.map((t, i) => (i === 0 ? 0 : new Date(t.startTime).getTime() - new Date(traces[i - 1].endTime).getTime())),
    [traces]
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: traces.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_TURN_HEIGHT,
    getItemKey: (i) => traces[i]?.id ?? i,
    overscan: OVERSCAN,
    paddingStart: 16,
    paddingEnd: 16,
  });
  const items = virtualizer.getVirtualItems();

  // Rendered turns (viewport + overscan) are exactly the ones whose details we need.
  const renderedIds = items
    .map((v) => traces[v.index]?.id)
    .filter(Boolean)
    .join(",");
  useEffect(() => {
    if (!projectId || !renderedIds) return;
    const ids = renderedIds.split(",");
    fetchCounts(projectId, ids);
    fetchAgentOutputs(ids);
  }, [projectId, renderedIds, fetchCounts, fetchAgentOutputs]);

  // A turn opened from the session timeline may be far off-screen.
  useEffect(() => {
    const index = openTraceId ? traces.findIndex((t) => t.id === openTraceId) : -1;
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
  }, [openTraceId, traces, virtualizer]);

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm">
        <AlertTriangle className="size-8 text-destructive-text" />
        {error}
      </div>
    );
  }

  if (isLoading && traces.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
        <Skeleton className="ml-auto h-10 w-1/2" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <ScrollArea ref={scrollRef} className="min-h-0 flex-1" viewportClassName="[&>div]:!block">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        <div className="absolute left-0 top-0 w-full" style={{ transform: `translateY(${items[0]?.start ?? 0}px)` }}>
          {items.map((v) => {
            const t = traces[v.index];
            const dividerAbove = gaps[v.index] >= MIN_GAP_MS;
            return (
              <div key={v.key} ref={virtualizer.measureElement} data-index={v.index}>
                {dividerAbove && (
                  <TimeDivider
                    gapMs={gaps[v.index]}
                    highlighted={openTraceId === t.id || openTraceId === traces[v.index - 1]?.id}
                  />
                )}
                <Turn trace={t} dividerAbove={dividerAbove} dividerBelow={(gaps[v.index + 1] ?? 0) >= MIN_GAP_MS} />
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}
