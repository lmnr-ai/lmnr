// TODO: This component duplicates structure from trace-view/condensed-timeline.
// Review for deduplication once session timeline design stabilizes.

import { PlayIcon } from "@radix-ui/react-icons";
import React, { memo, useCallback, useMemo } from "react";
import { shallow } from "zustand/shallow";

import { useDynamicTimeIntervals } from "@/components/traces/trace-view/condensed-timeline/use-dynamic-time-intervals";
import { cn } from "@/lib/utils";

import { type SessionViewSelectedSpan, useSessionViewStore } from "../store";
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

  // Consolidate every store read this segment needs into a single shallow-
  // guarded selector. Individual `useSessionViewStore(s => s.field)` calls
  // would each register a subscription, and during playback `playheadEpochMs`
  // updates at ~24 Hz — every segment would re-render once per tick per
  // subscription.
  //
  // `playheadLeftPercent` is DERIVED inside the selector (not selected as a
  // raw `playheadEpochMs` and computed in the component) so that segments
  // whose time domain doesn't contain the playhead return `null` every tick.
  // With `shallow` equality, a null-to-null transition is a no-op, so only
  // the segment currently hosting the playhead re-renders at 24 Hz.
  //
  // `scrollStartTime` / `scrollEndTime` come from the session panel writing
  // the absolute-ms range of rows in its viewport. The range can span a
  // session gap when the user is looking at two traces in different clusters,
  // so the consumer below computes the INTERSECTION with this segment's time
  // domain rather than clamping a scrollEnd-scrollStart width.
  const { playheadLeftPercent, mediaPanelOpen, seekTo, scrollStartTime, scrollEndTime } = useSessionViewStore(
    (s) => ({
      playheadLeftPercent:
        !s.mediaPanelOpen || s.playheadEpochMs === undefined || segment.widthMs <= 0
          ? null
          : s.playheadEpochMs < segment.startTimeMs || s.playheadEpochMs > segment.endTimeMs
            ? null
            : ((s.playheadEpochMs - segment.startTimeMs) / segment.widthMs) * 100,
      mediaPanelOpen: s.mediaPanelOpen,
      seekTo: s.seekTo,
      scrollStartTime: s.scrollStartTime,
      scrollEndTime: s.scrollEndTime,
    }),
    shallow
  );
  const scrollIndicator = useMemo(() => {
    if (scrollStartTime === undefined || scrollEndTime === undefined || segment.widthMs <= 0) return null;
    const startInside = scrollStartTime >= segment.startTimeMs && scrollStartTime < segment.endTimeMs;
    const endInside = scrollEndTime > segment.startTimeMs && scrollEndTime <= segment.endTimeMs;
    if (!startInside && !endInside) return null;
    const intersectStart = Math.max(scrollStartTime, segment.startTimeMs);
    const intersectEnd = Math.min(scrollEndTime, segment.endTimeMs);
    if (intersectEnd <= intersectStart) return null;
    const left = ((intersectStart - segment.startTimeMs) / segment.widthMs) * 100;
    const right = ((intersectEnd - segment.startTimeMs) / segment.widthMs) * 100;
    return { left, width: right - left };
  }, [scrollStartTime, scrollEndTime, segment.startTimeMs, segment.endTimeMs, segment.widthMs]);

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

  // Alt-click on the segment body seeks the media playhead to that instant.
  // Plain click is reserved for span selection (handled by inner bars) so the
  // timeline's dominant interaction — selecting a span — keeps working when
  // the media panel is open.
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!mediaPanelOpen || !e.altKey) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      seekTo(segment.startTimeMs + fraction * segment.widthMs);
    },
    [mediaPanelOpen, seekTo, segment.startTimeMs, segment.widthMs]
  );

  return (
    <div
      ref={segmentRef}
      className="relative h-full min-w-0"
      style={{ minHeight: contentHeight }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {/* Scroll indicator — clamped to this segment's time domain */}
      {scrollIndicator && (
        <div
          className="absolute bottom-[-60px] top-0 bg-muted/75 pointer-events-none"
          style={{ left: `${scrollIndicator.left}%`, width: `${scrollIndicator.width}%` }}
        />
      )}

      {/* Media playhead — only drawn when the current chapter lands in this segment */}
      {playheadLeftPercent !== null && (
        <div className="absolute inset-y-0 pointer-events-none z-[36]" style={{ left: `${playheadLeftPercent}%` }}>
          <div className="absolute top-0 h-6 flex items-center -translate-x-1/2">
            <PlayIcon className="size-3 text-primary fill-primary" />
          </div>
          <div className="absolute top-[6px] bottom-0 w-px bg-primary/80" />
        </div>
      )}

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
