import { isEmpty } from "lodash";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { formatTimeMarkerLabel } from "@/components/traces/trace-view/condensed-timeline/use-dynamic-time-intervals";
import { useWheelZoom, zoomKeepingCenter } from "@/components/traces/trace-view/condensed-timeline/use-wheel-zoom";
import { Skeleton } from "@/components/ui/skeleton";

import { useChatSession } from "../store";
import SessionTimelineControls from "./controls";
import SessionTimelineGap from "./session-timeline-gap";
import SessionTimelineSegment, { type HoverInfo } from "./session-timeline-segment";
import { ROW_HEIGHT } from "./session-timeline-trace-bar";
import { type TimelineSelection } from "./types";
import { computeSessionTimelineSegments, GAP_WIDTH_PX } from "./utils";

interface SessionTimelineProps {
  /** The open span, from the URL. */
  selectedSpan?: TimelineSelection;
  onSelectSpan: (traceId: string, spanId: string) => void;
}

function SessionTimeline({ selectedSpan, onSelectSpan }: SessionTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const traces = useChatSession((s) => s.traces);
  const isTracesLoading = useChatSession((s) => s.isLoading);
  const {
    traceSpans,
    traceSpansLoading,
    traceSpansError,
    expandedTraceIds,
    toggleTraceExpanded,
    fetchTraceSpans,
    zoom,
    setZoom,
  } = useChatSession(
    (s) => ({
      traceSpans: s.traceSpans,
      traceSpansLoading: s.traceSpansLoading,
      traceSpansError: s.traceSpansError,
      expandedTraceIds: s.expandedTraceIds,
      toggleTraceExpanded: s.toggleTraceExpanded,
      fetchTraceSpans: s.fetchTraceSpans,
      zoom: s.timelineZoom,
      setZoom: s.setTimelineZoom,
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

  // Hover needle — driven by segment callbacks
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

  // Two-phase expand: a collapsed trace whose spans aren't loaded fetches them first (the bar shimmers meanwhile) and
  // expands once they arrive, so it never flashes an empty container.
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
      void fetchTraceSpans(trace);
    },
    [expandedTraceIds, traceSpans, traces, toggleTraceExpanded, fetchTraceSpans]
  );

  const handleMouseLeaveTimeline = useCallback(() => setHoverInfo(null), []);

  const handleZoom = useCallback(
    (direction: "in" | "out") => {
      if (scrollRef.current) zoomKeepingCenter(scrollRef.current, zoom, direction, setZoom);
    },
    [zoom, setZoom]
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // The flex row holds segments (proportional to duration) and gaps (fixed
  // width). The total width at zoom=1 fills the container; segments grow with
  // zoom while gaps stay fixed.
  //
  // We use a CSS calc so the flex items that represent segments split the
  // remaining space (after subtracting gap widths) proportionally via their
  // flex-grow value.
  const totalGapWidth = gapCount * GAP_WIDTH_PX;

  // Loading/empty states render inside the scroll div: useWheelZoom binds to it once on mount.
  const renderContent = () => {
    if (isTracesLoading && traces.length === 0) {
      return (
        <div className="flex flex-col gap-2 py-2 px-2 w-full h-full">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-full w-full" />
        </div>
      );
    }

    if (isEmpty(traces)) {
      return (
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No traces found</div>
      );
    }

    return (
      <div
        className="flex h-full px-4"
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
              className="min-w-0 overflow-y-clip"
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
                onTraceBarClick={handleTraceBarClick}
                onSpanBarClick={onSelectSpan}
                onHover={setHoverInfo}
              />
            </div>
          ) : (
            <SessionTimelineGap
              key={`gap-${i}`}
              durationMs={section.gap.durationMs}
              startMs={section.gap.startMs}
              endMs={section.gap.endMs}
            />
          )
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden relative">
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto relative min-h-0 bg-emphasis-1 h-full minimal-scrollbar"
        onMouseLeave={handleMouseLeaveTimeline}
      >
        {renderContent()}
      </div>

      {/* Hover needle — rendered outside scroll container so it doesn't move with scroll */}
      {hoverInfo && (
        <div
          className="absolute inset-y-0 pointer-events-none z-[35]"
          style={{ left: `${hoverInfo.needleLeftPercent}%` }}
        >
          <div className="absolute top-0 h-6 flex items-center -translate-x-1/2">
            <div className="px-1.5 py-0.5 bg-primary text-primary-foreground text-[10px] rounded whitespace-nowrap">
              {formatTimeMarkerLabel(Math.round(hoverInfo.timeMs))}
            </div>
          </div>
          <div className="absolute top-[6px] bottom-0 w-px bg-primary/50" />
        </div>
      )}

      {/* Zoom controls */}
      <SessionTimelineControls zoom={zoom} onZoomIn={() => handleZoom("in")} onZoomOut={() => handleZoom("out")} />
    </div>
  );
}

export default memo(SessionTimeline);
