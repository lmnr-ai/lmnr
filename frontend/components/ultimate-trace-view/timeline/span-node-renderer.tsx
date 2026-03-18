"use client";

import { memo } from "react";

import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";
import { cn } from "@/lib/utils";

import { ROW_HEIGHT } from "./timeline-element";
import { ICON_MAP } from "./timeline-icons";
import { type BlockSummary, type SpanTreeNode } from "./timeline-types";

/** Check if any descendant span in a subtree is in the given set */
function hasVisibleDescendant(node: SpanTreeNode, visibleIds: Set<string>): boolean {
  for (const child of node.children) {
    if (visibleIds.has(child.span.spanId)) return true;
    if (hasVisibleDescendant(child, visibleIds)) return true;
  }
  return false;
}

interface SpanNodeRendererProps {
  node: SpanTreeNode;
  timelineDepth: number;
  expandedRowMap: Map<string, number>;
  subtreeRowRanges: Map<string, { minRow: number; maxRow: number }>;
  totalDurationMs: number;
  traceStartMs: number;
  blockSummaries: Record<string, BlockSummary>;
  selectedSpanId: string | null;
  visibleSpanIds: Set<string>;
  onSpanClick: (spanId: string, isCondensed: boolean) => void;
}

const SpanNodeRenderer = memo(
  ({
    node,
    timelineDepth,
    expandedRowMap,
    subtreeRowRanges,
    totalDurationMs,
    traceStartMs,
    blockSummaries,
    selectedSpanId,
    visibleSpanIds,
    onSpanClick,
  }: SpanNodeRendererProps) => {
    const row = expandedRowMap.get(node.span.spanId) ?? 0;
    const hasChildren = node.children.length > 0;
    const isCondensed = node.depth === timelineDepth && hasChildren;

    // Span's own bar dimensions
    const spanStartMs = new Date(node.span.startTime).getTime();
    const spanEndMs = new Date(node.span.endTime).getTime();
    const left = totalDurationMs > 0 ? ((spanStartMs - traceStartMs) / totalDurationMs) * 100 : 0;
    const width = totalDurationMs > 0 ? ((spanEndMs - spanStartMs) / totalDurationMs) * 100 : 0;

    const backgroundColor = SPAN_TYPE_TO_COLOR[node.span.spanType];
    const isSelected = selectedSpanId === node.span.spanId;
    const hasGroupSelection = visibleSpanIds.size > 0;
    const isIncludedInGroup = hasGroupSelection ? visibleSpanIds.has(node.span.spanId) : null;
    const opacity = isIncludedInGroup === false ? "opacity-30" : "";

    // Overlay data
    const range = subtreeRowRanges.get(node.span.spanId);
    const summary = blockSummaries[node.span.spanId];
    const IconComponent = summary?.icon ? ICON_MAP[summary.icon] : null;

    // Overlay dimensions (subtree time range, subtree row range)
    const overlayLeft = totalDurationMs > 0 ? ((node.subtreeStartTime - traceStartMs) / totalDurationMs) * 100 : 0;
    const overlayWidth =
      totalDurationMs > 0 ? ((node.subtreeEndTime - node.subtreeStartTime) / totalDurationMs) * 100 : 0;
    const overlayHeightRows = range ? range.maxRow - range.minRow + 1 : 1;
    const overlayHeightPx = overlayHeightRows * ROW_HEIGHT - 2;

    return (
      <>
        {/* The span's own bar -- always rendered */}
        <div
          className={cn("absolute rounded-xs cursor-pointer hover:brightness-110", opacity, {
            "border border-white/70 z-20": isSelected && !isCondensed,
          })}
          style={{
            left: `${left}%`,
            width: `max(${width}%, 4px)`,
            top: row * ROW_HEIGHT + 1,
            height: ROW_HEIGHT - 2,
            backgroundColor,
          }}
          onClick={() => onSpanClick(node.span.spanId, false)}
        />

        {/* Children -- always rendered for seamless depth transitions */}
        {hasChildren &&
          node.children.map((child) => (
            <SpanNodeRenderer
              key={child.span.spanId}
              node={child}
              timelineDepth={timelineDepth}
              expandedRowMap={expandedRowMap}
              subtreeRowRanges={subtreeRowRanges}
              totalDurationMs={totalDurationMs}
              traceStartMs={traceStartMs}
              blockSummaries={blockSummaries}
              selectedSpanId={selectedSpanId}
              visibleSpanIds={visibleSpanIds}
              onSpanClick={onSpanClick}
            />
          ))}

        {/* Condensed overlay -- sits on top of children at/past depth cutoff */}
        {isCondensed && range && (
          <div
            className={cn(
              "absolute rounded-xs cursor-pointer hover:brightness-110 overflow-hidden z-10 bg-landing-surface-400/80 border border-secondary-foreground/50",
              { "border-white/70 !z-20": isSelected },
              hasGroupSelection &&
                !visibleSpanIds.has(node.span.spanId) &&
                !hasVisibleDescendant(node, visibleSpanIds) &&
                "opacity-30"
            )}
            style={{
              left: `${overlayLeft}%`,
              width: `max(${overlayWidth}%, 4px)`,
              top: range.minRow * ROW_HEIGHT + 1,
              height: overlayHeightPx,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSpanClick(node.span.spanId, true);
            }}
            title={summary?.summary ?? node.span.name}
          >
            {overlayHeightPx >= 12 && (
              <div className="flex items-start gap-0.5 px-1 pt-0.5 text-[10px] leading-tight overflow-hidden">
                {IconComponent && <IconComponent className="size-3 flex-none mt-px" />}
                <span className={cn("break-words", !summary && "shimmer")}>{summary?.summary ?? node.span.name}</span>
                <span className="flex-none text-secondary-foreground/70 ml-auto">{node.subtreeSpanCount}</span>
              </div>
            )}
          </div>
        )}
      </>
    );
  }
);

SpanNodeRenderer.displayName = "SpanNodeRenderer";

export default SpanNodeRenderer;
