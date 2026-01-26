import { TooltipPortal } from "@radix-ui/react-tooltip";
import { isNil } from "lodash";
import { ChevronDown, ChevronRight, Settings, X } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";

import { MiniTree } from "@/components/rollout-sessions/rollout-session-view/list/mini-tree.tsx";
import {
  type TraceViewListSpan,
  useRolloutSessionStoreContext,
} from "@/components/rollout-sessions/rollout-session-view/rollout-session-store";
import { NoSpanTooltip } from "@/components/traces/no-span-tooltip";
import SpanTypeIcon from "@/components/traces/span-type-icon.tsx";
import Markdown from "@/components/traces/trace-view/list/markdown.tsx";
import { generateSpanPathKey } from "@/components/traces/trace-view/list/utils.ts";
import { SpanStatsShield } from "@/components/traces/trace-view/span-stats-shield.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { isStringDateOld } from "@/lib/traces/utils";
import { cn } from "@/lib/utils.ts";

interface ListItemProps {
  span: TraceViewListSpan;
  output: any | undefined;
  onSpanSelect: (span: TraceViewListSpan) => void;
  onOpenSettings: (span: TraceViewListSpan) => void;
  isLast: boolean;
}

const ListItem = ({ span, output, onSpanSelect, onOpenSettings, isLast = false }: ListItemProps) => {
  const { selectedSpan, spans, cacheToSpan, uncacheFromSpan, isSpanCached } = useRolloutSessionStoreContext(
    (state) => ({
      selectedSpan: state.selectedSpan,
      spans: state.spans,
      cacheToSpan: state.cacheToSpan,
      uncacheFromSpan: state.uncacheFromSpan,
      isSpanCached: state.isSpanCached,
    })
  );

  const spanPathKey = useMemo(() => generateSpanPathKey(span), [span]);

  const savedTemplate = useRolloutSessionStoreContext((state) => state.getSpanTemplate(spanPathKey));

  // Get full span from store to check cache status
  const fullSpan = useMemo(() => spans.find((s) => s.spanId === span.spanId), [spans, span.spanId]);

  const isCached = fullSpan ? isSpanCached(fullSpan) : false;

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

  return (
    <div
      className={cn(
        "flex flex-col cursor-pointer transition-all hover:bg-secondary group/message",
        selectedSpan?.spanId === span.spanId
          ? "bg-primary/5 border-l-4 border-l-primary"
          : "border-l-4 border-l-transparent",
        {
          "border-t pt-1": span.spanType === "LLM",
          "pb-1": isLast,
          "opacity-50": isCached,
        }
      )}
      onClick={() => {
        if (!isPending) {
          onSpanSelect(span);
        }
      }}
    >
      <div className="flex items-center gap-2 pl-2 pr-3 py-2">
        <div className="flex items-center gap-2 flex-1 justify-between overflow-hidden">
          <div className="flex items-center gap-2 min-w-0 flex-shrink-[2]">
            <SpanTypeIcon spanType={span.spanType} className={cn({ "text-muted-foreground bg-muted": isPending })} />
            <span className={cn("font-medium text-sm truncate min-w-0", isPending && "text-muted-foreground shimmer")}>
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
            {(span.spanType === "LLM" || span.spanType === "CACHED") && fullSpan && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    className={cn(
                      "py-0 px-2 h-5 bg-muted rounded text-secondary-foreground animate-in fade-in duration-200 text-xs",
                      isCached ? "block" : "hidden group-hover/message:block"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isCached) {
                        uncacheFromSpan(fullSpan);
                      } else {
                        cacheToSpan(fullSpan);
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
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="px-3 w-full p-2 pt-0 flex flex-col gap-2 h-full flex-1">
          {isLoadingOutput ? (
            <>
              <Skeleton className="h-5 w-full" />
            </>
          ) : isNil(output) ? (
            <div className="text-sm text-muted-foreground italic">No output available</div>
          ) : (
            <Markdown className="max-h-60" output={output} defaultValue={savedTemplate} />
          )}
        </div>
      )}
    </div>
  );
};

export default ListItem;
