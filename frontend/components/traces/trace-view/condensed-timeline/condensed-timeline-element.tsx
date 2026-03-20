import React, { memo, useMemo } from "react";

import { type TraceViewSpan } from "@/components/traces/trace-view/store";
import { useTraceViewBaseStore } from "@/components/traces/trace-view/store/base";
import { type CondensedTimelineSpan } from "@/components/traces/trace-view/store/utils";
import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 8;

interface CondensedTimelineElementProps {
  condensedSpan: CondensedTimelineSpan;
  selectedSpan?: TraceViewSpan;
  isIncludedInGroupSelection: boolean | null;
  maxSpanCost: number;
  onClick: (span: TraceViewSpan) => void;
}

const CondensedTimelineElement = ({
  condensedSpan,
  selectedSpan,
  isIncludedInGroupSelection,
  maxSpanCost,
  onClick,
}: CondensedTimelineElementProps) => {
  const { span, left, width, row } = condensedSpan;

  const isCostHeatmapVisible = useTraceViewBaseStore((state) => state.isCostHeatmapVisible);

  const isSelected = useMemo(() => selectedSpan?.spanId === span.spanId, [span.spanId, selectedSpan?.spanId]);
  const opacity = isIncludedInGroupSelection === false ? "opacity-30" : "";

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!span.pending) {
      onClick(span);
    }
  };

  const heatmapOpacity = useMemo(() => {
    if (!isCostHeatmapVisible) return 0;
    if (maxSpanCost === 0) return 0;
    return span.totalCost / maxSpanCost;
  }, [isCostHeatmapVisible, maxSpanCost, span.totalCost]);

  const backgroundColor = useMemo(() => {
    if (isCostHeatmapVisible) return undefined;
    if (span.status === "error") {
      return "rgba(204, 51, 51, 1)";
    }
    return SPAN_TYPE_TO_COLOR[span.spanType];
  }, [span.status, span.spanType, isCostHeatmapVisible]);

  return (
    <div
      className={cn("absolute rounded-xs cursor-pointer", "hover:brightness-110", opacity, {
        "border border-white/70 z-20": isSelected,
        "bg-muted": isCostHeatmapVisible,
      })}
      style={{
        left: `${left}%`,
        width: `max(${width}%, 4px)`,
        top: row * ROW_HEIGHT + 1,
        height: ROW_HEIGHT - 2,
        backgroundColor,
      }}
      onClick={handleClick}
    >
      {isCostHeatmapVisible && (
        <div
          className="absolute inset-0 rounded-xs"
          style={{
            backgroundColor: `rgba(239, 68, 68, ${heatmapOpacity})`,
          }}
        />
      )}
    </div>
  );
};

export default memo(CondensedTimelineElement);

export { ROW_HEIGHT };
