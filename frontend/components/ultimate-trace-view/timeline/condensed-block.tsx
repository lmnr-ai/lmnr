"use client";

import { memo, useMemo } from "react";

import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";
import { cn } from "@/lib/utils";

import { ROW_HEIGHT } from "./timeline-element";
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

function CondensedBlockComponent({
  block,
  summary,
  totalDurationMs,
  traceStartMs,
  isSelected,
  onClick,
}: CondensedBlockProps) {
  const left = totalDurationMs > 0 ? ((block.startTimeMs - traceStartMs) / totalDurationMs) * 100 : 0;
  const width = totalDurationMs > 0 ? ((block.endTimeMs - block.startTimeMs) / totalDurationMs) * 100 : 0;
  const heightPx = block.heightInRows * ROW_HEIGHT - 2;
  const isCondensed = block.spanCount > 1;

  const backgroundColor = useMemo(() => SPAN_TYPE_TO_COLOR[block.primarySpanType], [block.primarySpanType]);

  const IconComponent = summary?.icon ? ICON_MAP[summary.icon] : null;

  // Single span: identical to condensed timeline element
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

  // Condensed block: taller bar spanning subtree rows
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
        opacity: 0.6,
      }}
      onClick={onClick}
      title={summary?.summary ?? block.spanName}
    >
      {heightPx >= 20 && (
        <div className="flex items-start justify-between gap-0.5 px-1 pt-0.5 h-full text-[10px] leading-tight">
          <div className="flex items-center gap-0.5 truncate min-w-0">
            {IconComponent && <IconComponent className="size-3 flex-none" />}
            <span className="truncate">{summary?.summary ?? block.spanName}</span>
          </div>
          <span className="flex-none opacity-70 text-[9px]">{block.spanCount}</span>
        </div>
      )}
    </div>
  );
}

export default memo(CondensedBlockComponent);
