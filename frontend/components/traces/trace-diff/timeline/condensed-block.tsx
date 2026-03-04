"use client";

import { memo, useMemo } from "react";

import { ROW_HEIGHT } from "@/components/traces/trace-view/condensed-timeline/condensed-timeline-element";
import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";
import { cn } from "@/lib/utils";

import { ICON_MAP } from "./timeline-icons";
import { type BlockSummary, type CondensedBlock as CondensedBlockType } from "./timeline-types";

interface CondensedBlockProps {
  block: CondensedBlockType;
  summary?: BlockSummary;
  totalDurationMs: number;
  traceStartMs: number;
  isSelected: boolean;
  onClick: () => void;
}

const CondensedBlockComponent = ({
  block,
  summary,
  totalDurationMs,
  traceStartMs,
  isSelected,
  onClick,
}: CondensedBlockProps) => {
  const left = totalDurationMs > 0 ? ((block.startTimeMs - traceStartMs) / totalDurationMs) * 100 : 0;
  const width = totalDurationMs > 0 ? ((block.endTimeMs - block.startTimeMs) / totalDurationMs) * 100 : 0;
  const heightPx = block.heightInRows * ROW_HEIGHT - 2;
  const isCondensed = block.spanCount > 1;

  const backgroundColor = useMemo(() => SPAN_TYPE_TO_COLOR[block.primarySpanType], [block.primarySpanType]);

  const IconComponent = summary?.icon ? ICON_MAP[summary.icon] : null;

  // At full expansion (single span): identical to condensed timeline element
  if (!isCondensed) {
    return (
      <div
        className={cn("absolute rounded-xs cursor-pointer hover:brightness-110", {
          "border border-white/70 z-20": isSelected,
        })}
        style={{
          left: `${left}%`,
          width: `max(${width}%, 4px)`,
          top: block.topRow * ROW_HEIGHT + 1,
          height: heightPx,
          backgroundColor,
        }}
        onClick={onClick}
      />
    );
  }

  // Condensed block: taller bar spanning its subtree's rows
  return (
    <div
      className={cn("absolute rounded-xs cursor-pointer hover:brightness-110 overflow-hidden", {
        "border border-white/70 z-20": isSelected,
      })}
      style={{
        left: `${left}%`,
        width: `max(${width}%, 4px)`,
        top: block.topRow * ROW_HEIGHT + 1,
        height: heightPx,
        backgroundColor,
      }}
      onClick={onClick}
      title={summary?.summary ?? block.spanName}
    >
      {heightPx >= 20 && (
        <div className="flex items-center gap-0.5 px-1 h-full text-[10px] leading-tight truncate">
          {IconComponent && <IconComponent className="size-3 flex-none" />}
          <span className="truncate">{summary?.summary ?? block.spanName}</span>
          <span className="flex-none opacity-70">{block.spanCount}</span>
        </div>
      )}
    </div>
  );
};

export default memo(CondensedBlockComponent);
