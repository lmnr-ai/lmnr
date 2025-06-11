import { TooltipPortal } from "@radix-ui/react-tooltip";
import { CircleDollarSign, Clock3, Coins, InfoIcon } from "lucide-react";
import { PropsWithChildren } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getDurationString } from "@/lib/flow/utils";
import { cn } from "@/lib/utils";

import { Label } from "../ui/label";

interface TraceStatsShieldsProps {
  trace: {
    startTime: string;
    endTime: string;
    totalTokenCount: number;
    inputTokenCount: number;
    outputTokenCount: number;
    inputCost: number | null;
    outputCost: number | null;
    cost: number | null;
  };
  className?: string;
}

interface SpanStatsShieldsProps {
  startTime: string;
  endTime: string;
  attributes: Record<string, any>;
  className?: string;
}

function StatsShieldsContent({
  startTime,
  endTime,
  totalTokenCount,
  inputTokenCount,
  outputTokenCount,
  inputCost,
  outputCost,
  cost,
  className,
  children,
}: PropsWithChildren<{
  startTime: string;
  endTime: string;
  totalTokenCount: number;
  inputTokenCount: number;
  outputTokenCount: number;
  inputCost: number | null;
  outputCost: number | null;
  cost: number | null;
  className?: string;
}>) {
  return (
    <div className={cn("flex items-center gap-2 font-mono min-w-0", className)}>
      <div className="flex space-x-1 items-center p-0.5 min-w-8 px-2 border rounded-md">
        <Clock3 size={12} className="min-w-3 min-h-3" />
        <Label className="text-xs truncate" title={getDurationString(startTime, endTime)}>
          {getDurationString(startTime, endTime)}
        </Label>
      </div>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger className="min-w-8">
            <div className="flex space-x-1 items-center p-0.5 min-w-8 px-2 border rounded-md">
              <Coins className="min-w-3" size={12} />
              <Label className="text-xs truncate">{totalTokenCount}</Label>
              <InfoIcon size={12} />
            </div>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent side="bottom" className="p-2 border">
              <div className="flex-col space-y-1">
                <Label className="flex text-xs gap-1">
                  <span className="text-secondary-foreground">Input tokens</span> {inputTokenCount}
                </Label>
                <Label className="flex text-xs gap-1">
                  <span className="text-secondary-foreground">Output tokens</span> {outputTokenCount}
                </Label>
              </div>
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger className="min-w-8">
            <div className="flex space-x-1 items-center p-0.5 px-2 min-w-8 border rounded-md">
              <CircleDollarSign className="min-w-3" size={12} />
              <Label className="text-xs truncate">${cost?.toFixed(5)}</Label>
              <InfoIcon size={12} />
            </div>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent side="bottom" className="p-2 border">
              <div className="flex-col space-y-1">
                <Label className="flex text-xs gap-1">
                  <span className="text-secondary-foreground">Input cost</span> {"$" + inputCost?.toFixed(5)}
                </Label>
                <Label className="flex text-xs gap-1">
                  <span className="text-secondary-foreground">Output cost</span> {"$" + outputCost?.toFixed(5)}
                </Label>
              </div>
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>
      </TooltipProvider>
      {children}
    </div>
  );
}

export function TraceStatsShields({
  trace,
  className,
  children,
}: PropsWithChildren<TraceStatsShieldsProps>) {
  return (
    <StatsShieldsContent
      startTime={trace.startTime}
      endTime={trace.endTime}
      totalTokenCount={trace.totalTokenCount}
      inputTokenCount={trace.inputTokenCount}
      outputTokenCount={trace.outputTokenCount}
      inputCost={trace.inputCost}
      outputCost={trace.outputCost}
      cost={trace.cost}
      className={className}
    >
      {children}
    </StatsShieldsContent>
  );
}

export function SpanStatsShields({
  startTime,
  endTime,
  attributes,
  className,
  children,
}: PropsWithChildren<SpanStatsShieldsProps>) {
  const inputTokenCount = attributes["gen_ai.usage.input_tokens"] ?? 0;
  const outputTokenCount = attributes["gen_ai.usage.output_tokens"] ?? 0;
  const totalTokenCount = inputTokenCount + outputTokenCount;
  const inputCost = attributes["gen_ai.usage.input_cost"] ?? 0;
  const outputCost = attributes["gen_ai.usage.output_cost"] ?? 0;
  const cost = attributes["gen_ai.usage.cost"] ?? 0;

  return (
    <StatsShieldsContent
      startTime={startTime}
      endTime={endTime}
      totalTokenCount={totalTokenCount}
      inputTokenCount={inputTokenCount}
      outputTokenCount={outputTokenCount}
      inputCost={inputCost}
      outputCost={outputCost}
      cost={cost}
      className={className}
    >
      {children}
    </StatsShieldsContent>
  );
}
