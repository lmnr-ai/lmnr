import { isNil } from "lodash";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { SpanDisplayTooltip } from "@/components/traces/trace-view/span-display-tooltip.tsx";
import { SpanStatsShield } from "@/components/traces/trace-view/span-stats-shield.tsx";
import { type TraceViewSpan, useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
import { type PathInfo } from "@/components/traces/trace-view/trace-view-store-utils.ts";
import { getLLMMetrics, getSpanDisplayName } from "@/components/traces/trace-view/utils.ts";
import { isStringDateOld } from "@/lib/traces/utils";
import { cn } from "@/lib/utils";

import { Skeleton } from "../../ui/skeleton";
import { NoSpanTooltip } from "../no-span-tooltip";
import SpanTypeIcon from "../span-type-icon";
import Markdown from "./list/markdown";

const ROW_HEIGHT = 36;
const SQUARE_SIZE = 20;
const SQUARE_ICON_SIZE = 16;

const DEPTH_INDENT = 16;
const TREE_CONTAINER_PADDING_LEFT = 10;
const BASE_PADDING_LEFT = 8;

const TREE_LINE_WIDTH = 12;
const TREE_LINE_HEIGHT_ADJUSTMENT = 12;
const TREE_LINE_TOP_ANCHOR = 31;
const TREE_LINE_LEFT_BASE = 10;

interface SpanCardProps {
  span: TraceViewSpan;
  parentY: number;
  getOutput: (spanId: string) => any | undefined;
  depth: number;
  yOffset: number;
  pathInfo: PathInfo;
  onSpanSelect?: (span?: TraceViewSpan) => void;
}

// Generate span path key from pathInfo for template lookup
const generateSpanPathKeyFromPathInfo = (span: TraceViewSpan, pathInfo: PathInfo): string => {
  if (!pathInfo) {
    return span.name;
  }

  const pathSegments = pathInfo.full.map((item) => item.name);
  pathSegments.push(span.name);

  return pathSegments.join(", ");
};

export function SpanCard({ span, getOutput, yOffset, parentY, onSpanSelect, depth, pathInfo }: SpanCardProps) {
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

  const spanPathKey = useMemo(() => generateSpanPathKeyFromPathInfo(span, pathInfo), [span, pathInfo]);

  const savedTemplate = useTraceViewStoreContext((state) => state.getSpanTemplate(spanPathKey));

  const [isShowContent, setIsShowContent] = useState(
    span.spanType === "LLM" || span.spanType === "EXECUTOR" || span.spanType === "EVALUATOR"
  );

  const hasChildren = childSpans && childSpans.length > 0;

  useEffect(() => {
    if (ref.current) {
      setSegmentHeight(Math.max(0, yOffset - parentY));
    }
  }, [yOffset, parentY]);

  const isSelected = useMemo(() => selectedSpan?.spanId === span.spanId, [selectedSpan?.spanId, span.spanId]);

  const output = getOutput(span.spanId);
  const isLoadingOutput = output === undefined;

  return (
    <div className="text-md flex w-full flex-col" ref={ref}>
      <div
        className={cn(
          "flex flex-col cursor-pointer transition-all w-full min-w-full border-l-2",
          "hover:bg-red-100/10",
          isSelected ? "bg-primary/25 border-l-primary" : "border-l-transparent"
        )}
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
            className="border-l-2 border-b-2 rounded-bl-md absolute"
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
            <div
              className={cn(
                "text-ellipsis overflow-hidden whitespace-nowrap text-base truncate",
                span.pending && "text-muted-foreground"
              )}
            >
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
            <SpanStatsShield
              startTime={span.startTime}
              endTime={span.endTime}
              tokens={llmMetrics?.tokens}
              cost={llmMetrics?.cost}
              cacheReadInputTokens={llmMetrics?.cacheReadInputTokens}
            />
          )}
          <button
            className="z-30 p-1 hover:bg-muted transition-all text-muted-foreground rounded-sm"
            onClick={(e) => {
              e.stopPropagation();
              setIsShowContent(!isShowContent);
              if (hasChildren) {
                toggleCollapse(span.spanId);
              }
            }}
          >
            {(hasChildren ? span.collapsed : !isShowContent) ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          <div className="grow" />
        </div>
        {isShowContent && (
          <div
            className="px-3 pb-2 pt-0"
            style={{
              paddingLeft: TREE_CONTAINER_PADDING_LEFT + depth * DEPTH_INDENT + BASE_PADDING_LEFT,
            }}
          >
            {isLoadingOutput ? (
              <Skeleton className="h-12 w-full" />
            ) : isNil(output) ? (
              <div className="text-sm text-muted-foreground italic">No output available</div>
            ) : (
              <Markdown className="max-h-60" output={output} defaultValue={savedTemplate} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
