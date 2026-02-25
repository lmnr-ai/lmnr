import { TooltipPortal } from "@radix-ui/react-tooltip";
import { isNil } from "lodash";
import { ChevronDown, ChevronRight, Settings, X } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";

import { useRolloutCaching } from "@/components/rollout-sessions/rollout-session-view/rollout-session-store";
import { NoSpanTooltip } from "@/components/traces/no-span-tooltip";
import SpanTypeIcon from "@/components/traces/span-type-icon";
import { BreakpointIndicator } from "@/components/traces/trace-view/breakpoint-indicator";
import Markdown from "@/components/traces/trace-view/list/markdown";
import { MiniTree } from "@/components/traces/trace-view/list/mini-tree";
import { generateSpanPathKey } from "@/components/traces/trace-view/list/utils";
import { SpanStatsShield } from "@/components/traces/trace-view/span-stats-shield";
import { type TraceViewListSpan, useTraceViewContext } from "@/components/traces/trace-view/store/base";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { isStringDateOld } from "@/lib/traces/utils";
import { cn } from "@/lib/utils";

interface ListItemProps {
  span: TraceViewListSpan;
  output: any | undefined;
  onSpanSelect: (span: TraceViewListSpan) => void;
  onOpenSettings: (span: TraceViewListSpan) => void;
  isFirst: boolean;
  isLast: boolean;
}

const ListItem = ({ span, output, onSpanSelect, onOpenSettings, isFirst = false, isLast = false }: ListItemProps) => {
  const { selectedSpan, spans } = useTraceViewContext((state) => ({
    selectedSpan: state.selectedSpan,
    spans: state.spans,
  }));

  const {
    enabled: cachingEnabled,
    state: { isSpanCached },
  } = useRolloutCaching((s) => ({
    isSpanCached: s.isSpanCached,
  }));

  const spanPathKey = useMemo(() => generateSpanPathKey(span), [span]);

  const savedTemplate = useTraceViewContext((state) => state.getSpanTemplate(spanPathKey));

  const fullSpan = useMemo(() => spans.find((s) => s.spanId === span.spanId), [spans, span.spanId]);
  const isCached = cachingEnabled && fullSpan ? isSpanCached(fullSpan) : false;

  const [isExpanded, setIsExpanded] = useState(
    span.spanType === "LLM" ||
      span.spanType === "CACHED" ||
      span.spanType === "EXECUTOR" ||
      span.spanType === "EVALUATOR"
  );

  useEffect(() => {
    const shouldBeExpanded =
      span.spanType === "LLM" ||
      span.spanType === "CACHED" ||
      span.spanType === "EXECUTOR" ||
      span.spanType === "EVALUATOR";
    setIsExpanded(shouldBeExpanded);
  }, [span.spanId, span.spanType]);

  const isPending = span.pending;
  const isLoadingOutput = output === undefined;

  const displayName = useMemo(
    () => (span.spanType === "LLM" && span.model ? span.model : span.name),
    [span.spanType, span.model, span.name]
  );

  const isSelected = selectedSpan?.spanId === span.spanId;

  const outerClasses = cn(
    "flex flex-row group/message cursor-pointer transition-all border-l-4",
    "hover:bg-secondary",
    isSelected ? "bg-primary/5 border-l-primary" : "border-l-transparent",
    { "opacity-60": isCached }
  );

  const lockColumnClasses = cn("flex items-start justify-center shrink-0 w-10 p-1 self-stretch pt-2.5");

  return (
    <div
      className={outerClasses}
      onClick={() => {
        if (!isPending) {
          onSpanSelect(span);
        }
      }}
    >
      {cachingEnabled && <div className={lockColumnClasses}>{fullSpan && <BreakpointIndicator span={fullSpan} />}</div>}

      <div
        className={cn("flex flex-col flex-1 min-w-0", {
          "pt-1": span.spanType === "LLM" && !isFirst,
          "pb-1": isLast,
        })}
      >
        <div className="flex items-center gap-2 pl-2 pr-3 py-2">
          <div className="flex items-center gap-2 flex-1 justify-between overflow-hidden">
            <div className="flex items-center gap-2 min-w-0 flex-shrink-[2]">
              <SpanTypeIcon spanType={span.spanType} className={cn({ "text-muted-foreground bg-muted": isPending })} />
              <span
                className={cn("font-medium text-sm truncate min-w-0", isPending && "text-muted-foreground shimmer")}
              >
                {displayName}
              </span>
              <Button
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded((prevState) => !prevState);
                }}
                className="h-5 py-0 px-0.5 hover:bg-muted rounded transition-colors"
              >
                <ChevronDown
                  className={cn(
                    "size-4 text-secondary-foreground transition-transform ease-in-out",
                    !isExpanded && "-rotate-90"
                  )}
                />
              </Button>
            </div>

            <div className="flex items-center gap-2 min-w-0 ml-auto">
              {isPending ? (
                isStringDateOld(span.startTime) ? (
                  <NoSpanTooltip>
                    <div className="flex rounded bg-secondary p-1">
                      <X className="w-4 h-4 text-secondary-foreground" />
                    </div>
                  </NoSpanTooltip>
                ) : (
                  <Skeleton className="w-20 h-4 text-secondary-foreground px-2 py-0.5 bg-secondary rounded-full text-xs" />
                )
              ) : (
                <SpanStatsShield
                  className="hidden group-hover/message:flex"
                  startTime={span.startTime}
                  endTime={span.endTime}
                  tokens={span.totalTokens}
                  cost={span.totalCost}
                  cacheReadInputTokens={span.cacheReadInputTokens}
                />
              )}
              <Button
                disabled={isLoadingOutput}
                variant="ghost"
                className="hidden py-0 px-[3px] h-5 group-hover/message:block hover:bg-muted animate-in fade-in duration-200"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSettings(span);
                }}
              >
                <Settings className="size-3.5 text-secondary-foreground" />
              </Button>

              {span.pathInfo && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-0.5 text-xs text-muted-foreground min-w-0 overflow-hidden">
                        {span.pathInfo.display.map((ref, index) => (
                          <React.Fragment key={ref.spanId}>
                            {index > 0 && <ChevronRight size={12} className="flex-shrink-0" />}
                            <span className="truncate">{ref.name}</span>
                            {ref.count && (
                              <span className="text-secondary-foreground px-1.5 py-0.5 bg-muted rounded text-[10px] font-medium flex-shrink-0">
                                {ref.count}
                              </span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </TooltipTrigger>
                    <TooltipPortal>
                      <TooltipContent className="p-1 border">
                        <MiniTree span={span} />
                      </TooltipContent>
                    </TooltipPortal>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="px-3 w-full p-2 pt-0 flex flex-col gap-2 h-full flex-1">
            {isLoadingOutput ? (
              <>
                <Skeleton className="h-12 w-full" />
              </>
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
};

export default ListItem;
