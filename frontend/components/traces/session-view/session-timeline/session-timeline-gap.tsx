import { memo } from "react";

import { cn } from "@/lib/utils";

import { useSessionViewStore } from "../store";
import { formatGapDuration, GAP_WIDTH_PX } from "./utils";

interface SessionTimelineGapProps {
  durationMs: number;
  startMs: number;
  endMs: number;
}

function SessionTimelineGap({ durationMs, startMs, endMs }: SessionTimelineGapProps) {
  // Highlight when the session-panel's visible scroll range spans across this
  // gap — i.e. the user is looking at rows on both sides of it.
  const isInRange = useSessionViewStore((s) => {
    if (s.scrollStartTime === undefined || s.scrollEndTime === undefined) return false;
    return s.scrollStartTime <= startMs && s.scrollEndTime >= endMs;
  });

  return (
    <div
      className={cn("flex-shrink-0 h-full sticky top-0 px-2", isInRange && "bg-muted/75")}
      style={{ width: GAP_WIDTH_PX }}
    >
      <div className="h-full border-x grid place-items-center">
        <span className="text-[10px] text-muted-foreground select-none max-w-[20px] text-center">
          {formatGapDuration(durationMs)}
        </span>
      </div>
    </div>
  );
}

export default memo(SessionTimelineGap);
