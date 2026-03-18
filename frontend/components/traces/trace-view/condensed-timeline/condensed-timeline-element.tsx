import React, { memo, useMemo } from "react";

import { type TraceViewSpan } from "@/components/traces/trace-view/store";
import { type CondensedTimelineSpan } from "@/components/traces/trace-view/store/utils";
import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 8;

interface CondensedTimelineElementProps {
  condensedSpan: CondensedTimelineSpan;
  selectedSpan?: TraceViewSpan;
  isIncludedInGroupSelection: boolean | null;
  isSignificant: boolean;
  isDimmedBySignalLens: boolean;
  onClick: (span: TraceViewSpan) => void;
}

const CondensedTimelineElement = ({
  condensedSpan,
  selectedSpan,
  isIncludedInGroupSelection,
  isSignificant,
  isDimmedBySignalLens,
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
    if (isSignificant) {
      return "hsl(var(--info))";
    }
    if (span.status === "error") {
      return "rgba(204, 51, 51, 1)";
    }
    return SPAN_TYPE_TO_COLOR[span.spanType];
  }, [span.status, span.spanType, isSignificant]);

  return (
    <div
      className={cn("absolute rounded-xs cursor-pointer", "hover:brightness-110", opacity, {
        "border border-white/70 z-20": isSelected,
        "opacity-35 hover:opacity-60": isDimmedBySignalLens,
      })}
      data-timeline-span-id={span.spanId}
      style={{
        left: `${left}%`,
        width: `max(${width}%, 4px)`,
        top: row * ROW_HEIGHT + 1,
        height: ROW_HEIGHT - 2,
        backgroundColor,
        ...(isSignificant ? { boxShadow: "0 0 0 1.5px hsl(var(--info) / 0.5)" } : {}),
      }}
      onClick={handleClick}
    />
  );
};

export default memo(CondensedTimelineElement);

export { ROW_HEIGHT };
