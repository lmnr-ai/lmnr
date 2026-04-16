import React, { memo } from "react";

import { type SessionViewSelectedSpan } from "../store";
import SessionTimelineSpanBarElement from "./session-timeline-span-bar";
import { ROW_HEIGHT } from "./session-timeline-trace-bar";
import { type SessionTimelineSpanContainer } from "./utils";

interface SessionTimelineSpanContainerElementProps {
  container: SessionTimelineSpanContainer;
  selectedSpan?: SessionViewSelectedSpan;
  onClick: (traceId: string) => void;
  onSpanClick: (traceId: string, spanId: string) => void;
}

/**
 * Bordered container that REPLACES the trace bar when a trace is expanded.
 * Spans are rendered inside using trace-relative percentages. The container's
 * outer box uses `box-sizing: content-box` so the 1px border sits OUTSIDE
 * the declared height — which means the span rows fit exactly inside.
 *
 * Click on empty container area = collapse the trace (onClick). Clicks on
 * spans are intercepted by the span bar (stopPropagation) and route to
 * onSpanClick.
 */
const SessionTimelineSpanContainerElement = ({
  container,
  selectedSpan,
  onClick,
  onSpanClick,
}: SessionTimelineSpanContainerElementProps) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(container.traceId);
  };

  return (
    <div
      className="absolute rounded-xs border border-muted-foreground/30 bg-muted/50 cursor-pointer"
      style={{
        boxSizing: "content-box",
        left: `${container.left}%`,
        width: `max(${container.width}%, 4px)`,
        top: container.row * ROW_HEIGHT + 1,
        // Interior height = rowHeight rows. Border adds 2px outside (content-box).
        height: container.rowHeight * ROW_HEIGHT - 2,
      }}
      onClick={handleClick}
    >
      {container.spans.map((bar) => (
        <SessionTimelineSpanBarElement
          key={bar.span.spanId}
          bar={bar}
          traceId={container.traceId}
          selectedSpan={selectedSpan}
          onClick={onSpanClick}
        />
      ))}
    </div>
  );
};

export default memo(SessionTimelineSpanContainerElement);
