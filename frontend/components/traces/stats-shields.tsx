import { TooltipPortal } from "@radix-ui/react-tooltip";
import { pick } from "lodash";
import { CircleDollarSign, Clock3, Coins } from "lucide-react";
import { memo, useMemo } from "react";

import { CostBreakdown, TokensBreakdown } from "@/components/traces/cells";
import { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/store";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  durationMsBetween,
  formatCostNumber,
  formatDurationExact,
  formatDurationMs,
  formatTokensCompact,
} from "@/lib/traces/format";
import { type Span, type TraceRow } from "@/lib/traces/types.ts";
import { cn } from "@/lib/utils";

import { Label } from "../ui/label";

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
  | "reasoningTokens"
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
      reasoningTokens: 0,
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
  let reasoningTokens = 0;

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
    reasoningTokens += span.reasoningTokens || 0;
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
    reasoningTokens,
  };
}

// Session view aggregates client-side — no dedicated server endpoint.
export function computeTraceStats(
  traces: Pick<
    TraceRow,
    | "startTime"
    | "endTime"
    | "inputTokens"
    | "outputTokens"
    | "totalTokens"
    | "inputCost"
    | "outputCost"
    | "totalCost"
    | "cacheReadInputTokens"
  >[]
): StatsShieldsProps["stats"] {
  if (traces.length === 0) {
    const now = new Date().toISOString();
    return {
      startTime: now,
      endTime: now,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      cacheReadInputTokens: 0,
      reasoningTokens: 0,
    };
  }

  let minStart = new Date(traces[0].startTime).getTime();
  let maxEnd = new Date(traces[0].endTime).getTime();
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let inputCost = 0;
  let outputCost = 0;
  let totalCost = 0;
  let cacheReadInputTokens = 0;

  for (const t of traces) {
    const start = new Date(t.startTime).getTime();
    const end = new Date(t.endTime).getTime();
    if (start < minStart) minStart = start;
    if (end > maxEnd) maxEnd = end;

    inputTokens += t.inputTokens || 0;
    outputTokens += t.outputTokens || 0;
    totalTokens += t.totalTokens || 0;
    inputCost += t.inputCost || 0;
    outputCost += t.outputCost || 0;
    totalCost += t.totalCost || 0;
    cacheReadInputTokens += t.cacheReadInputTokens || 0;
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
    reasoningTokens: 0,
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
    | "reasoningTokens"
  >;
  className?: string;
  variant?: "filled" | "outline";
  labelPrefix?: string;
}

export function StatsShields({ stats, className, variant = "filled", labelPrefix }: StatsShieldsProps) {
  const durationMs = durationMsBetween(stats.startTime, stats.endTime);
  const durationContent = (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger className="min-w-8">
          <div className="flex space-x-1 items-center">
            <Clock3 size={12} className="min-w-3 min-h-3" />
            <Label className={cn("text-xs truncate", { "text-white": variant === "outline" })}>
              {formatDurationMs(durationMs)}
            </Label>
          </div>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent className="border">{formatDurationExact(durationMs)}</TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );

  const tokensContent = (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger className="min-w-8">
          <div className="flex space-x-1 items-center">
            <Coins className="min-w-3" size={12} />
            <Label className={cn("text-xs truncate", { "text-white": variant === "outline" })}>
              {formatTokensCompact(stats.totalTokens)}
            </Label>
          </div>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent className="flex flex-col border gap-1 min-w-55 px-3 py-2">
            <TokensBreakdown stats={stats} labelPrefix={labelPrefix} />
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
              {formatCostNumber(stats.totalCost)}
            </Label>
          </div>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent className="flex flex-col border gap-1 min-w-50 px-3 py-2">
            <CostBreakdown stats={stats} labelPrefix={labelPrefix} />
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
      "reasoningTokens",
      "inputCost",
      "outputCost",
      "totalCost",
    ]);
  }, [trace, spans]);

  return <StatsShields stats={stats} className={className} labelPrefix="Trace" />;
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
      "cacheReadInputTokens",
      "reasoningTokens",
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
