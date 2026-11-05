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

  // Matches trace-view's condensed-timeline-element: once a bar is >= 5px the inner fill drops 1px,
  // so abutting spans keep a visible seam. Selecting a span mutes the rest.
  const isMuted = selectedSpan != null && !isSelected;

  return (
    <div
      className={cn("@container absolute cursor-pointer rounded-xs", isMuted && "bg-surface-400")}
      style={{
        // left/width are percentages of the container's width (trace-relative).
        left: `${bar.left}%`,
        width: `max(${bar.width}%, 4px)`,
        top: bar.row * ROW_HEIGHT,
        height: ROW_HEIGHT - 2,
      }}
      onClick={handleClick}
    >
      <div
        className={cn("relative size-full rounded-xs hover:brightness-110 @min-[5px]:w-[calc(100%-1px)]", {
          "ring-1 ring-white/70 z-20": isSelected,
          "opacity-60": isMuted,
        })}
        style={{ backgroundColor: bar.color }}
      />
    </div>
  );
};

export default memo(SessionTimelineSpanBarElement);
