"use client";

import SpanTypeIcon from "@/components/traces/span-type-icon";
import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";
import { cn } from "@/lib/utils";

import { ICON_MAP } from "./timeline-icons";
import { type BlockSummary, type CondensedBlock as CondensedBlockType, ROW_HEIGHT } from "./timeline-types";

interface CondensedBlockProps {
  block: CondensedBlockType;
  summary?: BlockSummary;
  sharedDurationMs: number;
  traceStartMs: number;
  timelineWidthPx: number;
  onClick: () => void;
}

const CondensedBlockComponent = ({
  block,
  summary,
  sharedDurationMs,
  traceStartMs,
  timelineWidthPx,
  onClick,
}: CondensedBlockProps) => {
  const leftPx = sharedDurationMs > 0 ? ((block.startTimeMs - traceStartMs) / sharedDurationMs) * timelineWidthPx : 0;
  const widthPx =
    sharedDurationMs > 0 ? ((block.endTimeMs - block.startTimeMs) / sharedDurationMs) * timelineWidthPx : 0;

  const color = SPAN_TYPE_TO_COLOR[block.primarySpanType] ?? SPAN_TYPE_TO_COLOR.DEFAULT;

  const IconComponent = summary?.icon ? ICON_MAP[summary.icon] : null;

  return (
    <div
      className={cn(
        "absolute flex items-center gap-1 px-1.5 rounded cursor-pointer",
        "border transition-opacity hover:opacity-80 overflow-hidden"
      )}
      style={{
        left: leftPx,
        width: Math.max(widthPx, 24),
        top: block.row * ROW_HEIGHT,
        height: ROW_HEIGHT - 4,
        backgroundColor: `color-mix(in srgb, ${color} 30%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 60%, transparent)`,
      }}
      onClick={onClick}
      title={summary?.summary ?? block.spanName}
    >
      {/* Icon */}
      {IconComponent ? (
        <IconComponent className="size-3.5 flex-none" />
      ) : (
        <SpanTypeIcon spanType={block.primarySpanType} containerWidth={16} containerHeight={16} size={12} />
      )}

      {/* Summary or span name */}
      <span className="text-[11px] truncate flex-1 leading-tight">
        {summary ? summary.summary : <span className={cn(!summary && "shimmer")}>{block.spanName}</span>}
      </span>

      {/* Span count pill */}
      {block.spanCount > 1 && (
        <span
          className="text-[10px] rounded-full px-1 flex-none leading-tight"
          style={{
            backgroundColor: `color-mix(in srgb, ${color} 50%, transparent)`,
          }}
        >
          {block.spanCount}
        </span>
      )}
    </div>
  );
};

export default CondensedBlockComponent;
