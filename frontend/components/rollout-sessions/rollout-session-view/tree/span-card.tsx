import { TooltipPortal } from "@radix-ui/react-tooltip";
import { isNil } from "lodash";
import { ChevronDown, ChevronRight, Settings, X } from "lucide-react";
import { useMemo, useRef } from "react";

import { useRolloutSessionStoreContext } from "@/components/rollout-sessions/rollout-session-view/rollout-session-store.tsx";
import { NoSpanTooltip } from "@/components/traces/no-span-tooltip";
import SpanTypeIcon from "@/components/traces/span-type-icon";
import Markdown from "@/components/traces/trace-view/list/markdown";
import { SpanDisplayTooltip } from "@/components/traces/trace-view/span-display-tooltip.tsx";
import { SpanStatsShield } from "@/components/traces/trace-view/span-stats-shield.tsx";
import { type TraceViewSpan } from "@/components/traces/trace-view/trace-view-store.tsx";
import { type PathInfo } from "@/components/traces/trace-view/trace-view-store-utils.ts";
import { getLLMMetrics, getSpanDisplayName } from "@/components/traces/trace-view/utils.ts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { isStringDateOld } from "@/lib/traces/utils";
import { cn } from "@/lib/utils";

import { BranchConnector } from "./branch-connector";

const ROW_HEIGHT = 36;
const SQUARE_SIZE = 20;
const SQUARE_ICON_SIZE = 14;

interface SpanCardProps {
  span: TraceViewSpan;
  branchMask: boolean[];
  output: any | undefined;
  depth: number;
  pathInfo: PathInfo;
  onSpanSelect?: (span?: TraceViewSpan) => void;
  onOpenSettings?: (span: TraceViewSpan & { pathInfo: PathInfo }) => void;
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

export function SpanCard({ span, branchMask, output, onSpanSelect, depth, pathInfo, onOpenSettings }: SpanCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const { selectedSpan, spans, toggleCollapse, cacheToSpan, uncacheFromSpan, isSpanCached } =
    useRolloutSessionStoreContext((state) => ({
      selectedSpan: state.selectedSpan,
      spans: state.spans,
      toggleCollapse: state.toggleCollapse,
      cacheToSpan: state.cacheToSpan,
      uncacheFromSpan: state.uncacheFromSpan,
      isSpanCached: state.isSpanCached,
    }));

  const isCached = isSpanCached(span);

  const llmMetrics = getLLMMetrics(span);
  // Get child spans from the store
  const childSpans = useMemo(() => spans.filter((s) => s.parentSpanId === span.spanId), [spans, span.spanId]);

  const spanPathKey = useMemo(() => generateSpanPathKeyFromPathInfo(span, pathInfo), [span, pathInfo]);

  const savedTemplate = useRolloutSessionStoreContext((state) => state.getSpanTemplate(spanPathKey));

  const hasChildren = childSpans && childSpans.length > 0;
  const isExpandable = hasChildren || span.spanType === "LLM" || span.spanType === "TOOL";

  const isSelected = useMemo(() => selectedSpan?.spanId === span.spanId, [selectedSpan?.spanId, span.spanId]);

  const isLoadingOutput = output === undefined;

  return (
    <div
      ref={ref}
      className={cn(
        "group flex flex-row cursor-pointer transition-all w-full min-w-full border-l-2 pl-2 text-md",
        "hover:bg-red-100/10",
        isSelected ? "bg-primary/25 border-l-primary hover:bg-primary/30" : "border-l-transparent",
        {
          "opacity-60": isCached,
        }
      )}
      onClick={() => {
        if (!span.pending) {
          onSpanSelect?.(span);
        }
      }}
    >
      {/* Tree gutter - one column per depth level */}
      <BranchConnector depth={depth} branchMask={branchMask} isSelected={isSelected} />

      {/* Icon column */}
      <div className="flex flex-col items-center shrink-0 pt-2 self-stretch">
        <SpanTypeIcon
          iconClassName="min-w-4 min-h-4"
          spanType={span.spanType}
          containerWidth={SQUARE_SIZE}
          containerHeight={SQUARE_SIZE}
          size={SQUARE_ICON_SIZE}
          status={span.status}
          className={cn("min-w-[22px]", { "text-muted-foreground bg-muted ": span.pending })}
        />
        {/* Tiny connector if there are children and not collapsed */}
        {hasChildren && !span.collapsed && (
          <div
            className={cn("h-full flex-1 border-l-2 group-hover:border-[hsl(240_6%_26%)]", {
              "border-[hsl(240_6%_34%)] group-hover:border-[hsl(240_6%_40%)] ": isSelected,
            })}
          />
        )}
      </div>

      {/* Content column - title and markdown aligned */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-center space-x-2 group pl-2 pr-1" style={{ height: ROW_HEIGHT }}>
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
          {isExpandable && (
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
          {/* Rollout-specific cache buttons */}
          {(span.spanType === "LLM" || span.spanType === "CACHED") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    "py-0 px-2 h-5 bg-muted rounded text-secondary-foreground animate-in fade-in duration-200 text-xs",
                    isCached ? "block" : "hidden group-hover:block"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isCached) {
                      uncacheFromSpan(span);
                    } else {
                      cacheToSpan(span);
                    }
                  }}
                >
                  {isCached ? "Cached" : "Cache until here"}
                </Button>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent side="top" className="text-xs">
                  {isCached ? "Remove cache from this point" : "Cache up to and including this span"}
                </TooltipContent>
              </TooltipPortal>
            </Tooltip>
          )}
          <div className="grow" />
          <Button
            disabled={isLoadingOutput}
            variant="ghost"
            className="hidden py-0 px-[3px] h-5 group-hover:block hover:bg-muted animate-in fade-in duration-200"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSettings?.({ ...span, pathInfo });
            }}
          >
            <Settings className="size-3.5 text-secondary-foreground" />
          </Button>
        </div>

        {/* Expandable content */}
        {!span.collapsed && (span.spanType === "LLM" || span.spanType === "TOOL") && (
          <div className="px-2 pb-2 pt-0">
            {isLoadingOutput && <Skeleton className="h-12 w-full" />}
            {!isLoadingOutput && isNil(output) && (
              <div className="text-sm text-muted-foreground italic">No output available</div>
            )}
            {!isLoadingOutput && !isNil(output) && (
              <Markdown className="max-h-60" output={output} defaultValue={savedTemplate} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
