import { memo } from "react";

import { formatGapDuration, GAP_WIDTH_PX } from "./utils";

interface SessionTimelineGapProps {
  durationMs: number;
  contentHeight: number;
}

function SessionTimelineGap({ durationMs, contentHeight }: SessionTimelineGapProps) {
  return (
    <div
      className="flex-shrink-0 bg-muted/30 h-full border-x sticky top-0 grid place-items-center"
      style={{ width: GAP_WIDTH_PX }}
    >
      <span className="text-[10px] text-muted-foreground select-none max-w-[20px] text-center">
        {formatGapDuration(durationMs)}
      </span>
    </div>
  );
}

export default memo(SessionTimelineGap);
