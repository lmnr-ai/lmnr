import { TooltipPortal } from "@radix-ui/react-tooltip";
import { pick } from "lodash";
import { CircleDollarSign, Clock3, Coins } from "lucide-react";
import { memo, useMemo } from "react";

import { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/store";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type Span } from "@/lib/traces/types.ts";
import { cn, getDurationString } from "@/lib/utils";

import { Label } from "../ui/label";

const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 3,
});

const compactNumberFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
});

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

interface StatsShieldsProps {
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
  variant?: "filled" | "outline";
}

function StatsShields({ stats, className, variant = "filled" }: StatsShieldsProps) {
  const durationContent = (
    <div className="flex space-x-1 items-center">
      <Clock3 size={12} className="min-w-3 min-h-3" />
      <Label
        className={cn("text-xs truncate", { "text-white": variant === "outline" })}
        title={getDurationString(stats.startTime, stats.endTime)}
      >
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
            <Label className={cn("text-xs truncate", { "text-white": variant === "outline" })}>
              {compactNumberFormat.format(stats.totalTokens)}
            </Label>
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
            <Label className={cn("text-xs truncate", { "text-white": variant === "outline" })}>
              {stats.totalCost?.toFixed(2)}
            </Label>
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

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-1.5 py-0.5 rounded-md overflow-hidden text-xs font-mono min-w-0",
        variant === "outline" ? "border border-muted text-white" : "bg-muted text-secondary-foreground",
        className
      )}
    >
      {durationContent}
      {tokensContent}
      {costContent}
    </div>
  );
}

interface TraceStatsShieldsProps {
  trace: TraceViewTrace;
  spans?: TraceViewSpan[];
  className?: string;
}

const PureTraceStatsShields = ({ trace, spans, className }: TraceStatsShieldsProps) => {
  const stats = useMemo(() => {
    if (spans && spans.length > 0) {
      return computeSpanStats(spans);
    }

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
  }, [trace, spans]);

  return <StatsShields stats={stats} className={className} />;
};

interface SpanStatsShieldsProps {
  span: Span;
  className?: string;
  variant?: "filled" | "outline";
}

const SpanStatsShields = ({ span, className, variant }: SpanStatsShieldsProps) => (
  <StatsShields
    stats={pick(span, [
      "startTime",
      "endTime",
      "inputTokens",
      "outputTokens",
      "totalTokens",
      "inputCost",
      "outputCost",
      "totalCost",
    ])}
    className={className}
    variant={variant}
  />
);

export const TraceStatsShields = memo(PureTraceStatsShields);
export default memo(SpanStatsShields);
