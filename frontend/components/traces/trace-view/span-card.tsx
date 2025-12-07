import { ChevronDown, ChevronRight, X } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { TraceViewSpan, useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
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
const TREE_LINE_HORIZONTAL_WIDTH = 14;
const TREE_LINE_VERTICAL_OFFSET = 10;
const TREE_LINE_TOP_ADJUSTMENT = 8;

interface SpanCardProps {
  span: TraceViewSpan;
  parentY: number;
  containerWidth: number;
  depth: number;
  yOffset: number;
  onSpanSelect?: (span?: TraceViewSpan) => void;
}

export function SpanCard({ span, yOffset, parentY, onSpanSelect, containerWidth, depth }: SpanCardProps) {
  const [segmentHeight, setSegmentHeight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const { selectedSpan, spans, toggleCollapse } = useTraceViewStoreContext((state) => ({
    selectedSpan: state.selectedSpan,
    spans: state.spans,
    toggleCollapse: state.toggleCollapse,
  }));

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
              height: segmentHeight - ROW_HEIGHT / 2 + TREE_LINE_VERTICAL_OFFSET,
              top: -(segmentHeight - ROW_HEIGHT + TREE_LINE_TOP_ADJUSTMENT),
              left: TREE_CONTAINER_PADDING_LEFT + depth * DEPTH_INDENT + BASE_PADDING_LEFT - TREE_LINE_HORIZONTAL_WIDTH,
              width: TREE_LINE_HORIZONTAL_WIDTH,
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
          <div
            className={cn(
              "whitespace-nowrap text-base",
              span.pending && "text-muted-foreground"
            )}
          >
            {span.name}
          </div>
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
            <div className="text-secondary-foreground px-2 py-0.5 bg-muted rounded-full text-xs">
              {getDurationString(span.startTime, span.endTime)}
            </div>
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
