// TODO: This component duplicates condensed-timeline-element.tsx from
// trace-view, minus cost heatmap and group selection. Review for
// deduplication once session timeline design stabilizes.

import React, { memo, useMemo } from "react";

import { cn } from "@/lib/utils";

import { type SessionViewSelectedSpan } from "../store";
import { type SessionTimelineContainerSpan } from "./utils";

const ROW_HEIGHT = 8;

interface SessionTimelineSpanBarElementProps {
  /** Span bar inside an expanded trace's container. Coords are trace-relative. */
  bar: SessionTimelineContainerSpan;
  traceId: string;
  selectedSpan?: SessionViewSelectedSpan;
  onClick: (traceId: string, spanId: string) => void;
}

const SessionTimelineSpanBarElement = ({ bar, traceId, selectedSpan, onClick }: SessionTimelineSpanBarElementProps) => {
  const isSelected = useMemo(
    () => selectedSpan?.traceId === traceId && selectedSpan?.spanId === bar.span.spanId,
    [selectedSpan, traceId, bar.span.spanId]
  );

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!bar.span.pending) {
      onClick(traceId, bar.span.spanId);
    }
  };

  return (
    <div
      className={cn("absolute rounded-xs cursor-pointer hover:brightness-110", {
        "border border-white/70 z-20": isSelected,
      })}
      style={{
        // left/width are percentages of the container's width (trace-relative).
        left: `${bar.left}%`,
        width: `max(${bar.width}%, 4px)`,
        top: bar.row * ROW_HEIGHT,
        height: ROW_HEIGHT - 2,
        backgroundColor: bar.color,
      }}
      onClick={handleClick}
    />
  );
};

export default memo(SessionTimelineSpanBarElement);
