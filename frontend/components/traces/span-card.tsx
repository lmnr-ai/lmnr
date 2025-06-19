import { ChevronDown, ChevronRight, X } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { Span } from "@/lib/traces/types";
import { isStringDateOld } from "@/lib/traces/utils";
import { cn, formatSecondsToMinutesAndSeconds, getDuration, getDurationString } from "@/lib/utils";

import { Skeleton } from "../ui/skeleton";
import { NoSpanTooltip } from "./no-span-tooltip";
import SpanTypeIcon from "./span-type-icon";

const ROW_HEIGHT = 36;
const SQUARE_SIZE = 22;
const SQUARE_ICON_SIZE = 16;

interface SpanCardProps {
  span: Span;
  activeSpans: string[];
  parentY: number;
  childSpans: { [key: string]: Span[] };
  containerWidth: number;
  depth: number;
  yOffset: number;
  selectedSpan?: Span | null;
  collapsedSpans: Set<string>;
  traceStartTime: string;
  onSpanSelect?: (span: Span) => void;
  onToggleCollapse?: (spanId: string) => void;
  onSelectTime?: (time: number) => void;
}

export function SpanCard({
  span,
  childSpans,
  yOffset,
  parentY,
  onSpanSelect,
  containerWidth,
  depth,
  selectedSpan,
  collapsedSpans,
  onToggleCollapse,
  traceStartTime,
  activeSpans,
  onSelectTime,
}: SpanCardProps) {
  const [segmentHeight, setSegmentHeight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const childrenSpans = childSpans[span.spanId];

  const hasChildren = childrenSpans && childrenSpans.length > 0;

  useEffect(() => {
    if (ref.current) {
      setSegmentHeight(Math.max(0, yOffset - parentY));
    }
  }, [yOffset, parentY]);

  const isSelected = useMemo(() => selectedSpan?.spanId === span.spanId, [selectedSpan?.spanId, span.spanId]);

  return (
    <div
      className="text-md flex w-full flex-col"
      ref={ref}
      style={{
        paddingLeft: depth * 24,
      }}
    >
      <div className="flex flex-col">
        <div
          className="flex w-full items-center space-x-2 cursor-pointer group relative"
          style={{
            height: ROW_HEIGHT,
          }}
        >
          <div
            className="border-l-2 border-b-2 rounded-bl-lg absolute left-0"
            style={{
              height: segmentHeight - ROW_HEIGHT / 2 + SQUARE_SIZE / 4,
              top: -(segmentHeight - ROW_HEIGHT + SQUARE_SIZE / 4),
              left: -(SQUARE_SIZE / 4),
              width: SQUARE_SIZE / 2,
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
              "text-ellipsis overflow-hidden whitespace-nowrap text-base truncate",
              span.pending && "text-muted-foreground"
            )}
          >
            {span.name}
          </div>
          {span.pending ? (
            isStringDateOld(span.startTime) ? (
              // TODO: Fix this tooltip.
              <NoSpanTooltip>
                <div className="flex rounded bg-secondary p-1">
                  <X className="w-4 h-4 text-secondary-foreground" />
                </div>
              </NoSpanTooltip>
            ) : (
              <Skeleton className="w-10 h-4 text-secondary-foreground px-2 py-0.5 bg-secondary rounded-full text-xs" />
            )
          ) : (
            <div className="text-secondary-foreground px-2 py-0.5 bg-secondary rounded-full text-xs">
              {getDurationString(span.startTime, span.endTime)}
            </div>
          )}
          <div
            className="z-30 top-[-px]  hover:bg-red-100/10 absolute transition-all"
            style={{
              width: containerWidth,
              height: ROW_HEIGHT,
              left: -(depth + 1) * 24 - 8,
            }}
            onClick={(e) => {
              if (!span.pending) {
                onSpanSelect?.(span);
              }
            }}
          />
          {isSelected && (
            <div
              className="absolute top-0 w-full bg-primary/25 border-l-2 border-l-primary"
              style={{
                width: containerWidth,
                height: ROW_HEIGHT,
                left: -(depth + 1) * 24 - 8,
              }}
            />
          )}
          {hasChildren && (
            <button
              className="z-30 p-1 hover:bg-muted transition-all text-muted-foreground rounded-sm"
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse?.(span.spanId);
              }}
            >
              {collapsedSpans.has(span.spanId) ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          )}
          <div className="flex-grow" />
          <div
            className="flex items-center z-40"
            style={{
              height: ROW_HEIGHT,
            }}
            onClick={() => {
              onSelectTime?.(getDuration(traceStartTime, span.startTime) / 1000);
            }}
          >
            <div
              className={cn(
                "flex items-center text-xs font-mono text-muted-foreground p-1 cursor-pointer rounded-l-full px-2",
                activeSpans.includes(span.spanId) ? "bg-primary/80 text-white" : "hover:bg-muted"
              )}
            >
              {formatSecondsToMinutesAndSeconds(getDuration(traceStartTime, span.startTime) / 1000)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
