import { isEmpty } from "lodash";
import { X } from "lucide-react";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { formatTimeMarkerLabel } from "@/components/traces/trace-view/condensed-timeline/use-dynamic-time-intervals";
import { useWheelZoom } from "@/components/traces/trace-view/condensed-timeline/use-wheel-zoom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { useSessionViewStore } from "../store";
import SessionTimelineControls from "./controls";
import SessionTimelineGap from "./session-timeline-gap";
import SessionTimelineSegment, { type HoverInfo } from "./session-timeline-segment";
import { ROW_HEIGHT } from "./session-timeline-trace-bar";
import { computeSessionTimelineSegments, GAP_WIDTH_PX } from "./utils";

function SessionTimeline() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    traces,
    traceSpans,
    traceSpansLoading,
    traceSpansError,
    expandedTraceIds,
    isTracesLoading,
    selectedSpan,
    setSelectedSpan,
    toggleTraceExpanded,
    ensureTraceSpans,
    zoom,
    setZoom,
    setSessionTimelineEnabled,
  } = useSessionViewStore(
    (s) => ({
      traces: s.traces,
      traceSpans: s.traceSpans,
      traceSpansLoading: s.traceSpansLoading,
      traceSpansError: s.traceSpansError,
      expandedTraceIds: s.expandedTraceIds,
      isTracesLoading: s.isTracesLoading,
      selectedSpan: s.selectedSpan,
      setSelectedSpan: s.setSelectedSpan,
      toggleTraceExpanded: s.toggleTraceExpanded,
      ensureTraceSpans: s.ensureTraceSpans,
      zoom: s.sessionTimelineZoom,
      setZoom: s.setSessionTimelineZoom,
      setSessionTimelineEnabled: s.setSessionTimelineEnabled,
    }),
    shallow
  );

  const { sections, sessionStartMs } = useMemo(
    () => computeSessionTimelineSegments(traces, traceSpans, traceSpansLoading, expandedTraceIds),
    [traces, traceSpans, traceSpansLoading, expandedTraceIds]
  );

  // Max rows across all segments — used so all segments share the same height.
  const maxRows = useMemo(
    () => sections.reduce((max, s) => (s.type === "segment" ? Math.max(max, s.segment.totalRows) : max), 0),
    [sections]
  );
  const contentHeight = (maxRows + 1) * ROW_HEIGHT;

  const gapCount = useMemo(() => sections.filter((s) => s.type === "gap").length, [sections]);

  // Wheel zoom on the parent scroll container
  useWheelZoom(scrollRef, zoom, setZoom);

  const [isScrolled, setIsScrolled] = useState(false);
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setIsScrolled(e.currentTarget.scrollTop > 0);
  }, []);

  // Hover needle — driven by segment callbacks
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

  // Two-phase expand (mirrors list/trace-item.tsx): when the user clicks a
  // collapsed trace whose spans aren't loaded yet, we DON'T flip
  // `expandedTraceIds` immediately — we kick off `ensureTraceSpans` and
  // flush to expand once spans arrive. The bar meanwhile shows a shimmer
  // (driven by `traceSpansLoading` → `bar.shimmer` in utils.ts).
  //
  // Keeps the timeline's expansion state consistent with the list, and
  // avoids flashing an empty container before spans arrive.
  const pendingExpandIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (pendingExpandIdsRef.current.size === 0) return;
    const toFlush: string[] = [];
    for (const id of pendingExpandIdsRef.current) {
      if (traceSpans[id] || traceSpansError[id]) toFlush.push(id);
    }
    if (toFlush.length === 0) return;
    for (const id of toFlush) pendingExpandIdsRef.current.delete(id);
    queueMicrotask(() => {
      for (const id of toFlush) {
        if (expandedTraceIds.has(id)) continue;
        toggleTraceExpanded(id);
      }
    });
  }, [traceSpans, traceSpansError, expandedTraceIds, toggleTraceExpanded]);

  const handleTraceBarClick = useCallback(
    (traceId: string) => {
      // Collapse is always allowed.
      if (expandedTraceIds.has(traceId)) {
        toggleTraceExpanded(traceId);
        return;
      }
      const loadedSpans = traceSpans[traceId];
      if (loadedSpans) {
        toggleTraceExpanded(traceId);
        return;
      }
      // Not loaded — kick off fetch. Effect above flushes the expansion
      // when spans arrive (and skips trivial ones).
      const trace = traces.find((t) => t.id === traceId);
      if (!trace) return;
      pendingExpandIdsRef.current.add(traceId);
      void ensureTraceSpans(trace);
    },
    [expandedTraceIds, traceSpans, traces, toggleTraceExpanded, ensureTraceSpans]
  );

  const handleSpanBarClick = useCallback(
    (traceId: string, spanId: string) => setSelectedSpan({ traceId, spanId }),
    [setSelectedSpan]
  );

  const handleMouseLeaveTimeline = useCallback(() => setHoverInfo(null), []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isTracesLoading && traces.length === 0) {
    return (
      <div className="flex flex-col gap-2 py-2 px-2 w-full h-full bg-muted/50">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (isEmpty(traces)) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground bg-muted/50">
        No traces found
      </div>
    );
  }

  // The flex row holds segments (proportional to duration) and gaps (fixed
  // width). The total width at zoom=1 fills the container; segments grow with
  // zoom while gaps stay fixed.
  //
  // We use a CSS calc so the flex items that represent segments split the
  // remaining space (after subtracting gap widths) proportionally via their
  // flex-grow value.
  const totalGapWidth = gapCount * GAP_WIDTH_PX;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden relative">
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto relative min-h-0 bg-muted/50 h-full minimal-scrollbar"
        onScroll={handleScroll}
        onMouseLeave={handleMouseLeaveTimeline}
      >
        <div
          className="flex h-full"
          style={{
            // At zoom=1 the segments fill the visible area; gaps add fixed extra width.
            width: `calc(${100 * zoom}% + ${totalGapWidth * (zoom > 1 ? 1 : 0)}px)`,
            minWidth: `calc(100% + ${totalGapWidth}px)`,
            minHeight: contentHeight,
          }}
        >
          {sections.map((section, i) =>
            section.type === "segment" ? (
              <div
                key={`seg-${i}`}
                className="min-w-0 px-2 overflow-y-clip"
                style={{
                  // flex-grow proportional to duration; segments split the
                  // available space after gaps are subtracted.
                  flex: `${section.segment.durationMs} 0 0px`,
                }}
              >
                <SessionTimelineSegment
                  segment={section.segment}
                  sessionStartMs={sessionStartMs}
                  selectedSpan={selectedSpan}
                  contentHeight={contentHeight}
                  isScrolled={isScrolled}
                  onTraceBarClick={handleTraceBarClick}
                  onSpanBarClick={handleSpanBarClick}
                  onHover={setHoverInfo}
                />
              </div>
            ) : (
              <SessionTimelineGap key={`gap-${i}`} durationMs={section.gap.durationMs} />
            )
          )}
        </div>
      </div>

      {/* Hover needle — rendered outside scroll container so it doesn't move with scroll */}
      {hoverInfo && (
        <div
          className="absolute inset-y-0 pointer-events-none z-[35]"
          style={{ left: `${hoverInfo.needleLeftPercent}%` }}
        >
          <div className="absolute top-0 h-6 flex items-center -translate-x-1/2">
            <div className="px-1.5 py-0.5 bg-primary text-white text-[10px] rounded whitespace-nowrap">
              {formatTimeMarkerLabel(Math.round(hoverInfo.timeMs))}
            </div>
          </div>
          <div className="absolute top-[6px] bottom-0 w-px bg-primary/50" />
        </div>
      )}

      {/* Close button — top-right, styled as a flush tab */}
      <div className="absolute top-0 right-0 z-40 h-6 w-7 bg-muted border-b border-l rounded-bl flex items-end overflow-hidden">
        <Button onClick={() => setSessionTimelineEnabled(false)} variant="ghost" size="icon" className="size-5 min-w-5">
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Zoom controls */}
      <SessionTimelineControls />
    </div>
  );
}

export default memo(SessionTimeline);
