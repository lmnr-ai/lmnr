import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

import { useChatSession } from "../store";
import { useOpenTrace } from "../use-open-trace";
import TimeDivider from "./time-divider";
import Turn from "./turn";
import { useReportVisibleTurns } from "./use-report-visible-turns";

// Gaps shorter than this between turns aren't worth a divider.
const MIN_GAP_MS = 10 * 60_000;
// Near the median rendered turn (bubble + stats row + clipped reply).
const ESTIMATED_TURN_HEIGHT = 260;
// Turns rendered (and so fetching their counts and replies) beyond each edge of the viewport.
const OVERSCAN = 6;

export default function Thread() {
  const { traces, live, isLoading, error } = useChatSession(
    (s) => ({ traces: s.traces, live: s.live, isLoading: s.isLoading, error: s.error }),
    shallow
  );
  // Read by the scroll-to-turn effect without re-running it on every live update.
  const tracesRef = useRef(traces);
  useEffect(() => {
    tracesRef.current = traces;
  }, [traces]);
  const { openTraceId } = useOpenTrace();

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
  useReportVisibleTurns(virtualizer, traces);

  // A turn opened from the session timeline may be far off-screen. Runs when a turn opens (or the session first
  // loads under a deep link), not on live updates, so reading another turn isn't interrupted.
  const ready = traces.length > 0;
  useEffect(() => {
    if (!openTraceId || !ready) return;
    const index = tracesRef.current.findIndex((t) => t.id === openTraceId);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
  }, [openTraceId, ready, virtualizer]);

  // A failed refresh keeps the rows already shown; only a failed first load is an error.
  if (error && traces.length === 0) {
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
                <Turn
                  trace={t}
                  live={live.has(t.id)}
                  dividerAbove={dividerAbove}
                  dividerBelow={(gaps[v.index + 1] ?? 0) >= MIN_GAP_MS}
                />
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}
