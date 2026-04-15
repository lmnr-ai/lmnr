import React, { memo } from "react";

import { cn } from "@/lib/utils";

import { type SessionTimelineTraceBar } from "./utils";

export const TRACE_BAR_HEIGHT = 14;
export const ROW_HEIGHT = 8;

interface SessionTimelineTraceBarElementProps {
  bar: SessionTimelineTraceBar;
  onClick: (traceId: string) => void;
}

const SessionTimelineTraceBarElement = ({ bar, onClick }: SessionTimelineTraceBarElementProps) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(bar.traceId);
  };

  return (
    <div
      className={cn(
        "absolute rounded-xs cursor-pointer hover:brightness-125 bg-muted-foreground/50",
        // Shimmer while spans are loading after a click. `animate-pulse`
        // matches the convention used by `Skeleton` (ui/skeleton.tsx:9).
        bar.shimmer && "animate-pulse bg-muted-foreground/70"
      )}
      style={{
        left: `${bar.left}%`,
        width: `max(${bar.width}%, 4px)`,
        top: bar.row * ROW_HEIGHT + 1,
        height: TRACE_BAR_HEIGHT,
      }}
      onClick={handleClick}
    />
  );
};

export default memo(SessionTimelineTraceBarElement);
