import { ChevronDown, ChevronRight, CircleDollarSign, Coins, X } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { SpanDisplayTooltip } from "@/components/traces/trace-view/span-display-tooltip.tsx";
import { TraceViewSpan, useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
import { getLLMMetrics, getSpanDisplayName } from "@/components/traces/trace-view/utils.ts";
import { isStringDateOld } from "@/lib/traces/utils";
import { cn, getDurationString } from "@/lib/utils";

import { Skeleton } from "../../ui/skeleton";
import { NoSpanTooltip } from "../no-span-tooltip";
import SpanTypeIcon from "../span-type-icon";

const ROW_HEIGHT = 36;
const SQUARE_SIZE = 22;
const SQUARE_ICON_SIZE = 16;

const DEPTH_INDENT = 24;
const TREE_CONTAINER_PADDING_LEFT = 16;
const BASE_PADDING_LEFT = 8;

const TREE_LINE_WIDTH = 12;
const TREE_LINE_HEIGHT_ADJUSTMENT = 12;
const TREE_LINE_TOP_ANCHOR = 31;
const TREE_LINE_LEFT_BASE = 10;

interface SpanCardProps {
  span: TraceViewSpan;
  parentY: number;
  depth: number;
  yOffset: number;
  onSpanSelect?: (span?: TraceViewSpan) => void;
}

const numberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
});

export function SpanCard({ span, yOffset, parentY, onSpanSelect, depth }: SpanCardProps) {
  const [segmentHeight, setSegmentHeight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const { selectedSpan, spans, toggleCollapse } = useTraceViewStoreContext((state) => ({
    selectedSpan: state.selectedSpan,
    spans: state.spans,
    toggleCollapse: state.toggleCollapse,
  }));
  const llmMetrics = getLLMMetrics(span);
  // Get child spans from the store
  const childSpans = useMemo(() => spans.filter((s) => s.parentSpanId === span.spanId), [spans, span.spanId]);

  const hasChildren = childSpans && childSpans.length > 0;

  useEffect(() => {
    if (ref.current) {
      setSegmentHeight(Math.max(0, yOffset - parentY));
    }
  }, [yOffset, parentY]);

  const isSelected = useMemo(() => selectedSpan?.spanId === span.spanId, [selectedSpan?.spanId, span.spanId]);

  return (
    <div className="text-md flex w-full flex-col" ref={ref}>
      <div
        className={cn(
          "flex flex-col cursor-pointer transition-all w-full min-w-full border-l-2",
          "hover:bg-red-100/10",
          isSelected ? "bg-primary/25 border-l-primary" : "border-l-transparent"
        )}
        style={{
          height: ROW_HEIGHT,
        }}
        onClick={(e) => {
          if (!span.pending) {
            onSpanSelect?.(span);
          }
        }}
      >
        <div
          className="flex items-center space-x-2 group relative pl-2"
          style={{
            paddingLeft: TREE_CONTAINER_PADDING_LEFT + depth * DEPTH_INDENT + BASE_PADDING_LEFT,
            height: ROW_HEIGHT,
          }}
        >
          <div
            className="border-l-2 border-b-2 rounded-bl-lg absolute"
            style={{
              height: segmentHeight - TREE_LINE_HEIGHT_ADJUSTMENT,
              top: -(segmentHeight - TREE_LINE_TOP_ANCHOR),
              left: depth * DEPTH_INDENT + TREE_LINE_LEFT_BASE,
              width: TREE_LINE_WIDTH,
            }}
          />
          <SpanTypeIcon
            iconClassName="min-w-4 min-h-4"
            spanType={span.spanType}
            containerWidth={SQUARE_SIZE}
            containerHeight={SQUARE_SIZE}
            size={SQUARE_ICON_SIZE}
            status={span.status}
            className={cn("min-w-[22px]", { "text-muted-foreground bg-muted ": span.pending })}
          />
          <SpanDisplayTooltip isLLM={span.spanType === "LLM"} name={span.name}>
            <div className={cn("text-ellipsis overflow-hidden whitespace-nowrap text-base truncate", span.pending && "text-muted-foreground")}>
              {getSpanDisplayName(span)}
            </div>
          </SpanDisplayTooltip>
          {span.pending ? (
            isStringDateOld(span.startTime) ? (
              <NoSpanTooltip>
                <div className="flex rounded bg-secondary p-1">
                  <X className="w-4 h-4 text-secondary-foreground" />
                </div>
              </NoSpanTooltip>
            ) : (
              <Skeleton className="w-10 h-4 text-secondary-foreground px-2 py-0.5 bg-secondary rounded-full text-xs" />
            )
          ) : (
            <>
              <div className="text-secondary-foreground px-2 py-0.5 bg-muted rounded-full text-xs">
                {getDurationString(span.startTime, span.endTime)}
              </div>
              {llmMetrics && (
                <>
                  <div
                    className={
                      "text-secondary-foreground px-2 py-0.5 bg-muted rounded-full text-xs inline-flex items-center gap-1"
                    }
                  >
                    <Coins className="min-w-3" size={12} />
                    {numberFormatter.format(llmMetrics.tokens)}
                  </div>
                  <div
                    className={
                      "text-secondary-foreground px-2 py-0.5 bg-muted rounded-full text-xs inline-flex items-center gap-1"
                    }
                  >
                    <CircleDollarSign className="min-w-3" size={12} />
                    {llmMetrics.cost.toFixed(3)}
                  </div>
                </>
              )}
            </>
          )}
          {hasChildren && (
            <button
              className="z-30 p-1 hover:bg-muted transition-all text-muted-foreground rounded-sm"
              onClick={(e) => {
                e.stopPropagation();
                toggleCollapse(span.spanId);
              }}
            >
              {span.collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
          <div className="grow" />
        </div>
      </div>
    </div>
  );
}
