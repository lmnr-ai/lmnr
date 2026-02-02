import React, { memo, useMemo } from "react";

import { type TraceViewSpan } from "@/components/traces/trace-view/trace-view-store";
import { type CondensedTimelineSpan } from "@/components/traces/trace-view/trace-view-store-utils";
import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 8;

interface CondensedTimelineElementProps {
  condensedSpan: CondensedTimelineSpan;
  selectedSpan?: TraceViewSpan;
  isIncludedInGroupSelection: boolean | null;
  onClick: (span: TraceViewSpan) => void;
}

const CondensedTimelineElement = ({
  condensedSpan,
  selectedSpan,
  isIncludedInGroupSelection,
  onClick,
}: CondensedTimelineElementProps) => {
  const { span, left, width, row } = condensedSpan;

  const isSelected = useMemo(() => selectedSpan?.spanId === span.spanId, [span.spanId, selectedSpan?.spanId]);
  const opacity = isIncludedInGroupSelection === false ? "opacity-30" : "";

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!span.pending) {
      onClick(span);
    }
  };

  const backgroundColor = useMemo(() => {
    if (span.status === "error") {
      return "rgba(204, 51, 51, 1)";
    }
    return SPAN_TYPE_TO_COLOR[span.spanType];
  }, [span.status, span.spanType]);

  return (
    <div
      className={cn("absolute rounded-xs cursor-pointer", "hover:brightness-110", opacity, {
        "ring ring-white z-20": isSelected,
      })}
      style={{
        left: `${left}%`,
        width: `max(${width}%, 4px)`,
        top: row * ROW_HEIGHT + 1,
        height: ROW_HEIGHT - 2,
        backgroundColor,
      }}
      onClick={handleClick}
    />
  );
};

export default memo(CondensedTimelineElement);

export { ROW_HEIGHT };
