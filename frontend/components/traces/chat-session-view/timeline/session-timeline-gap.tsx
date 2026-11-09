import { memo } from "react";

import { cn } from "@/lib/utils";

import { useChatSession } from "../store";
import { formatGapDuration, GAP_WIDTH_PX } from "./utils";

interface SessionTimelineGapProps {
  durationMs: number;
  startMs: number;
  endMs: number;
}

function SessionTimelineGap({ durationMs, startMs, endMs }: SessionTimelineGapProps) {
  // Highlight when the turns on screen sit on both sides of this gap.
  const isInRange = useChatSession(
    (s) => !!s.visibleRange && s.visibleRange.start <= startMs && s.visibleRange.end >= endMs
  );

  return (
    <div
      className={cn("flex-shrink-0 h-full sticky top-0 px-2", isInRange && "bg-emphasis-1")}
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
