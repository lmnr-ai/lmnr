import React, { memo, useMemo } from "react";

import { type TraceViewSpan } from "@/components/traces/trace-view/store";
import { type CondensedTimelineSpan } from "@/components/traces/trace-view/store/utils";
import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 8;
const SEGMENT_HEIGHT = 6;

interface TimelineElementProps {
  condensedSpan: CondensedTimelineSpan;
  isSelected: boolean;
  onClick: (span: TraceViewSpan) => void;
}

function TimelineElement({ condensedSpan, isSelected, onClick }: TimelineElementProps) {
  const { span, left, width, row } = condensedSpan;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!span.pending) onClick(span);
  };

  const backgroundColor = useMemo(() => {
    if (span.status === "error") return "rgba(204, 51, 51, 1)";
    return SPAN_TYPE_TO_COLOR[span.spanType];
  }, [span.status, span.spanType]);

  return (
    <div
      className={cn("group/span absolute rounded-xs cursor-pointer", "hover:brightness-110", {
        "border border-white/70 z-20": isSelected,
      })}
      style={{
        left: `${left}%`,
        width: `max(${width}%, 4px)`,
        top: row * ROW_HEIGHT + (ROW_HEIGHT - SEGMENT_HEIGHT) / 2,
        height: SEGMENT_HEIGHT,
        backgroundColor,
      }}
      onClick={handleClick}
    />
  );
}

export default memo(TimelineElement);

export { ROW_HEIGHT };
