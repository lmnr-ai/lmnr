import { TooltipPortal } from "@radix-ui/react-tooltip";
import { isNil } from "lodash";
import { ChevronDown, ChevronRight, Settings, X } from "lucide-react";
import { useMemo, useRef } from "react";

import { useRolloutCaching } from "@/components/rollout-sessions/rollout-session-view/rollout-session-store";
import { type TraceViewSpan, useTraceViewContext } from "@/components/traces/trace-view/store/base";
import { type PathInfo } from "@/components/traces/trace-view/store/utils";
import { getLLMMetrics, getSpanDisplayName } from "@/components/traces/trace-view/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isStringDateOld } from "@/lib/traces/utils";
import { cn } from "@/lib/utils";

import { Skeleton } from "../../../ui/skeleton";
import { NoSpanTooltip } from "../../no-span-tooltip";
import SpanTypeIcon from "../../span-type-icon";
import Markdown from "../list/markdown";
import { SpanDisplayTooltip } from "../span-display-tooltip";
import { SpanStatsShield } from "../span-stats-shield";
import { BranchConnector } from "./branch-connector";

const ROW_HEIGHT = 32;
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

  const { selectedSpan, spans, toggleCollapse, showTreeContent } = useTraceViewContext((state) => ({
    selectedSpan: state.selectedSpan,
    spans: state.spans,
    toggleCollapse: state.toggleCollapse,
    showTreeContent: state.showTreeContent,
  }));

  const {
    enabled: cachingEnabled,
    state: { isSpanCached, cacheToSpan, uncacheFromSpan },
  } = useRolloutCaching((s) => ({
    isSpanCached: s.isSpanCached,
    cacheToSpan: s.cacheToSpan,
    uncacheFromSpan: s.uncacheFromSpan,
    cachedSpanCounts: s.cachedSpanCounts,
  }));

  const isCached = cachingEnabled ? isSpanCached(span) : false;

  const llmMetrics = getLLMMetrics(span);
  const childSpans = useMemo(() => spans.filter((s) => s.parentSpanId === span.spanId), [spans, span.spanId]);

  const spanPathKey = useMemo(() => generateSpanPathKeyFromPathInfo(span, pathInfo), [span, pathInfo]);

  const savedTemplate = useTraceViewContext((state) => state.getSpanTemplate(spanPathKey));

  const hasChildren = childSpans && childSpans.length > 0;
  const isExpandable = hasChildren || (span.spanType === "LLM" && (showTreeContent ?? true));

  const isSelected = useMemo(() => selectedSpan?.spanId === span.spanId, [selectedSpan?.spanId, span.spanId]);

  const showContent = (showTreeContent ?? true) && !span.collapsed && span.spanType === "LLM";

  const isLoadingOutput = output === undefined;

  return (
    <div
      ref={ref}
      className={cn(
        "group flex flex-row cursor-pointer transition-all w-full min-w-full border-l-2 pl-2 text-md",
        "hover:bg-red-100/5",
        isSelected ? "bg-primary/15 border-l-primary hover:bg-primary/20" : "border-l-transparent",
        { "opacity-60": isCached }
      )}
      onClick={() => {
        if (!span.pending) {
          onSpanSelect?.(span);
        }
      }}
    >
      <BranchConnector depth={depth} branchMask={branchMask} isSelected={isSelected} />

      <div className="flex flex-col items-center shrink-0 pt-[6px] self-stretch">
        <SpanTypeIcon
          iconClassName="min-w-4 min-h-4"
          spanType={span.spanType}
          containerWidth={SQUARE_SIZE}
          containerHeight={SQUARE_SIZE}
          size={SQUARE_ICON_SIZE}
          status={span.status}
          className={cn("min-w-[22px]", { "text-muted-foreground bg-muted ": span.pending })}
        />
        {hasChildren && !span.collapsed && (
          <div
            className={cn("h-full flex-1 border-l-2 group-hover:border-[hsl(240_6%_26%)]", {
              "border-[hsl(240_6%_34%)] group-hover:border-[hsl(240_6%_40%)] ": isSelected,
            })}
          />
        )}
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center space-x-2 group pl-2 pr-1" style={{ height: ROW_HEIGHT }}>
          <SpanDisplayTooltip isLLM={span.spanType === "LLM"} name={span.name}>
            <div
              className={cn(
                "text-ellipsis overflow-hidden whitespace-nowrap text-sm truncate",
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
          {cachingEnabled && (span.spanType === "LLM" || span.spanType === "CACHED") && (
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

        {showContent && (
          <div className="px-2 pt-0">
            {isLoadingOutput && (
              <div className="w-full pb-2">
                <Skeleton className="h-12 w-full" />
              </div>
            )}
            {!isLoadingOutput && !isNil(output) && (
              <Markdown className="max-h-48" output={output} defaultValue={savedTemplate} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
