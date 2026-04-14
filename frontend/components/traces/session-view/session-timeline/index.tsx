// TODO: This component duplicates the shell of trace-view/condensed-timeline.
// It reuses utility hooks (time intervals, wheel zoom) directly but duplicates
// the rendering structure. Review for deduplication once design stabilizes.

import { isEmpty } from "lodash";
import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { formatTimeMarkerLabel } from "@/components/traces/trace-view/condensed-timeline/use-dynamic-time-intervals";
import { useWheelZoom } from "@/components/traces/trace-view/condensed-timeline/use-wheel-zoom";
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
    expandedTraceIds,
    isTracesLoading,
    selectedSpan,
    setSelectedSpan,
    toggleTraceExpanded,
    zoom,
    setZoom,
  } = useSessionViewStore(
    (s) => ({
      traces: s.traces,
      traceSpans: s.traceSpans,
      expandedTraceIds: s.expandedTraceIds,
      isTracesLoading: s.isTracesLoading,
      selectedSpan: s.selectedSpan,
      setSelectedSpan: s.setSelectedSpan,
      toggleTraceExpanded: s.toggleTraceExpanded,
      zoom: s.sessionTimelineZoom,
      setZoom: s.setSessionTimelineZoom,
    }),
    shallow
  );

  const { sections, sessionStartMs } = useMemo(
    () => computeSessionTimelineSegments(traces, traceSpans, expandedTraceIds),
    [traces, traceSpans, expandedTraceIds]
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

  const handleTraceBarClick = useCallback((traceId: string) => toggleTraceExpanded(traceId), [toggleTraceExpanded]);

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
              <SessionTimelineGap key={`gap-${i}`} durationMs={section.gap.durationMs} contentHeight={contentHeight} />
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

      {/* Zoom controls */}
      <SessionTimelineControls />
    </div>
  );
}

export default memo(SessionTimeline);
