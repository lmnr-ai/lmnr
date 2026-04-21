// TODO: This component duplicates structure from trace-view/condensed-timeline.
// Review for deduplication once session timeline design stabilizes.

import React, { memo, useCallback, useMemo } from "react";

import { useDynamicTimeIntervals } from "@/components/traces/trace-view/condensed-timeline/use-dynamic-time-intervals";
import { cn } from "@/lib/utils";

import { type SessionViewSelectedSpan } from "../store";
import SessionTimelineSpanContainerElement from "./session-timeline-span-container";
import SessionTimelineTraceBarElement from "./session-timeline-trace-bar";
import { type SessionTimelineSegmentData } from "./utils";

interface HoverInfo {
  /** Percentage of the *parent scroll container's visible width* for needle positioning. */
  needleLeftPercent: number;
  /** Time in ms from segment start. */
  timeMs: number;
}

interface SessionTimelineSegmentProps {
  segment: SessionTimelineSegmentData;
  /** Epoch ms of the very first trace in the session — used to compute global time offsets. */
  sessionStartMs: number;
  selectedSpan?: SessionViewSelectedSpan;
  contentHeight: number;
  isScrolled: boolean;
  onTraceBarClick: (traceId: string) => void;
  onSpanBarClick: (traceId: string, spanId: string) => void;
  onHover: (info: HoverInfo | null) => void;
}

function SessionTimelineSegment({
  segment,
  sessionStartMs,
  selectedSpan,
  contentHeight,
  isScrolled,
  onTraceBarClick,
  onSpanBarClick,
  onHover,
}: SessionTimelineSegmentProps) {
  const segmentRef = useCallback(
    (node: HTMLDivElement | null) => {
      setContainerRef(node);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Time markers — pass zoom=1 because the segment's rendered width already
  // accounts for zoom via the parent's flex layout. startOffsetMs shifts
  // labels to show global session time rather than segment-local time.
  const { markers: timeMarkers, setContainerRef } = useDynamicTimeIntervals({
    totalDurationMs: segment.durationMs,
    zoom: 1,
    startOffsetMs: segment.startTimeMs - sessionStartMs,
  });

  const traceBars = useMemo(() => segment.elements.filter((e) => e.type === "trace"), [segment.elements]);
  const spanContainers = useMemo(() => segment.elements.filter((e) => e.type === "span-container"), [segment.elements]);

  const segmentOffsetMs = segment.startTimeMs - sessionStartMs;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const fraction = Math.max(0, Math.min(1, mouseX / rect.width));

      // Needle position as % of the parent scroll container's visible width.
      // We use the scroll container (closest .overflow-auto ancestor) for this.
      const scrollContainer = e.currentTarget.closest(".overflow-auto");
      if (scrollContainer) {
        const scrollRect = scrollContainer.getBoundingClientRect();
        const needleLeftPercent = ((e.clientX - scrollRect.left) / scrollRect.width) * 100;
        // Report global session time (segment offset + local position)
        onHover({ needleLeftPercent, timeMs: segmentOffsetMs + fraction * segment.durationMs });
      }
    },
    [onHover, segment.durationMs, segmentOffsetMs]
  );

  const handleMouseLeave = useCallback(() => {
    onHover(null);
  }, [onHover]);

  return (
    <div
      ref={segmentRef}
      className="relative h-full min-w-0"
      style={{ minHeight: contentHeight }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Time marker lines */}
      {timeMarkers.map((marker, i) => (
        <div
          key={`line-${i}`}
          className="absolute top-0 bottom-[-60px] w-px pointer-events-none bg-muted"
          style={{ left: `${marker.positionPercent}%` }}
        />
      ))}

      {/* Sticky time labels */}
      <div
        className={cn(
          "sticky top-0 z-30 h-6 text-xs pointer-events-none select-none",
          isScrolled && "bg-gradient-to-b from-[hsla(240,4%,9%,90%)] via-[hsla(240,4%,9%,80%)] to-transparent"
        )}
      >
        {timeMarkers.map((marker, i) => (
          <div key={i} className="absolute flex items-center h-full" style={{ left: `${marker.positionPercent}%` }}>
            <div className="text-secondary-foreground truncate text-[10px] whitespace-nowrap pl-1">{marker.label}</div>
          </div>
        ))}
      </div>

      {/* Trace bars (collapsed or pending) + expanded span containers */}
      <div className="relative" style={{ minHeight: contentHeight }}>
        {traceBars.map((bar) => (
          <SessionTimelineTraceBarElement key={bar.traceId} bar={bar} onClick={onTraceBarClick} />
        ))}
        {spanContainers.map((container) => (
          <SessionTimelineSpanContainerElement
            key={container.traceId}
            container={container}
            selectedSpan={selectedSpan}
            onClick={onTraceBarClick}
            onSpanClick={onSpanBarClick}
          />
        ))}
      </div>
    </div>
  );
}

export default memo(SessionTimelineSegment);

export { type HoverInfo };
