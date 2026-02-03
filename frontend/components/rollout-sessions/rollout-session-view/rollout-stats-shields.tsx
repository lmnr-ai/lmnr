import { TooltipPortal } from "@radix-ui/react-tooltip";
import { pick } from "lodash";
import { CircleDollarSign, Clock3, Coins } from "lucide-react";
import { memo, useMemo } from "react";

import { useRolloutSessionStoreContext } from "@/components/rollout-sessions/rollout-session-view/rollout-session-store";
import { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/trace-view-store.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, getDurationString } from "@/lib/utils";

import { Label } from "../../ui/label";

interface RolloutTraceStatsShieldsProps {
  trace: TraceViewTrace;
  className?: string;
  singlePill?: boolean;
}

// Compute aggregate stats from a list of spans
function computeSpanStats(
  spans: TraceViewSpan[]
): Pick<
  TraceViewSpan,
  | "startTime"
  | "endTime"
  | "inputTokens"
  | "outputTokens"
  | "totalTokens"
  | "inputCost"
  | "outputCost"
  | "totalCost"
  | "cacheReadInputTokens"
> {
  if (spans.length === 0) {
    return {
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      cacheReadInputTokens: 0,
    };
  }

  let minStart = new Date(spans[0].startTime).getTime();
  let maxEnd = new Date(spans[0].endTime).getTime();
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let inputCost = 0;
  let outputCost = 0;
  let totalCost = 0;
  let cacheReadInputTokens = 0;

  for (const span of spans) {
    const start = new Date(span.startTime).getTime();
    const end = new Date(span.endTime).getTime();
    if (start < minStart) minStart = start;
    if (end > maxEnd) maxEnd = end;

    inputTokens += span.inputTokens || 0;
    outputTokens += span.outputTokens || 0;
    totalTokens += span.totalTokens || 0;
    inputCost += span.inputCost || 0;
    outputCost += span.outputCost || 0;
    totalCost += span.totalCost || 0;
    cacheReadInputTokens += span.cacheReadInputTokens || 0;
  }

  return {
    startTime: new Date(minStart).toISOString(),
    endTime: new Date(maxEnd).toISOString(),
    inputTokens,
    outputTokens,
    totalTokens,
    inputCost,
    outputCost,
    totalCost,
    cacheReadInputTokens,
  };
}

const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 3,
});

const compactNumberFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
});

function StatsShieldsContent({
  stats,
  className,
  singlePill = false,
}: {
  stats: Pick<
    TraceViewSpan,
    | "startTime"
    | "endTime"
    | "inputTokens"
    | "outputTokens"
    | "totalTokens"
    | "inputCost"
    | "outputCost"
    | "totalCost"
    | "cacheReadInputTokens"
  >;
  className?: string;
  singlePill?: boolean;
}) {
  const durationContent = (
    <div className="flex space-x-1 items-center">
      <Clock3 size={12} className="min-w-3 min-h-3" />
      <Label className="text-xs truncate" title={getDurationString(stats.startTime, stats.endTime)}>
        {getDurationString(stats.startTime, stats.endTime)}
      </Label>
    </div>
  );

  const tokensContent = (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger className="min-w-8">
          <div className="flex space-x-1 items-center">
            <Coins className="min-w-3" size={12} />
            <Label className="text-xs truncate">{compactNumberFormat.format(stats.totalTokens)}</Label>
          </div>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side="bottom" className="p-2 border">
            <div className="flex-col space-y-1">
              <Label className="flex text-xs gap-1">
                <span className="text-secondary-foreground">Input tokens</span> {numberFormat.format(stats.inputTokens)}
              </Label>
              <Label className="flex text-xs gap-1">
                <span className="text-secondary-foreground">Output tokens</span>{" "}
                {numberFormat.format(stats.outputTokens)}
              </Label>
              {!!stats.cacheReadInputTokens && (
                <Label className="flex text-xs gap-1 text-success-bright">
                  <span>Cache read input tokens</span> {numberFormat.format(stats.cacheReadInputTokens)}
                </Label>
              )}
            </div>
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );

  const costContent = (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger className="min-w-8">
          <div className="flex space-x-1 items-center">
            <CircleDollarSign className="min-w-3" size={12} />
            <Label className="text-xs truncate">{stats.totalCost?.toFixed(2)}</Label>
          </div>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side="bottom" className="p-2 border">
            <div className="flex-col space-y-1">
              <Label className="flex text-xs gap-1">
                <span className="text-secondary-foreground">Total cost</span> {"$" + stats.totalCost?.toFixed(5)}
              </Label>
              <Label className="flex text-xs gap-1">
                <span className="text-secondary-foreground">Input cost</span> {"$" + stats.inputCost?.toFixed(5)}
              </Label>
              <Label className="flex text-xs gap-1">
                <span className="text-secondary-foreground">Output cost</span> {"$" + stats.outputCost?.toFixed(5)}
              </Label>
            </div>
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );

  if (singlePill) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-1.5 py-0.5 rounded-md overflow-hidden text-xs font-mono min-w-0",
          "bg-muted text-secondary-foreground",
          className
        )}
      >
        {durationContent}
        {tokensContent}
        {costContent}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2 font-mono min-w-0", className)}>
      <div className="flex space-x-1 items-center p-0.5 min-w-8 px-2 border rounded-md">{durationContent}</div>
      <div className="flex space-x-1 items-center p-0.5 min-w-8 px-2 border rounded-md">{tokensContent}</div>
      <div className="flex space-x-1 items-center p-0.5 px-2 min-w-8 border rounded-md">{costContent}</div>
    </div>
  );
}

const PureRolloutTraceStatsShields = ({ trace, className, singlePill }: RolloutTraceStatsShieldsProps) => {
  const { spans, condensedTimelineVisibleSpanIds } = useRolloutSessionStoreContext((state) => ({
    spans: state.spans,
    condensedTimelineVisibleSpanIds: state.condensedTimelineVisibleSpanIds,
  }));

  // Compute stats: use filtered spans if selection is active, otherwise use trace stats
  const stats = useMemo(() => {
    const hasSelection = condensedTimelineVisibleSpanIds.size > 0;

    if (!hasSelection) {
      return pick(trace, [
        "startTime",
        "endTime",
        "inputTokens",
        "outputTokens",
        "totalTokens",
        "cacheReadInputTokens",
        "inputCost",
        "outputCost",
        "totalCost",
      ]);
    }

    // Filter spans by selection and compute aggregate stats
    const filteredSpans = spans.filter((s) => condensedTimelineVisibleSpanIds.has(s.spanId));
    return computeSpanStats(filteredSpans);
  }, [trace, spans, condensedTimelineVisibleSpanIds]);

  return <StatsShieldsContent stats={stats} className={className} singlePill={singlePill} />;
};

export const RolloutTraceStatsShields = memo(PureRolloutTraceStatsShields);
