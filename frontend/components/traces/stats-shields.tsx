import { TooltipPortal } from "@radix-ui/react-tooltip";
import { CircleDollarSign, Clock3, Coins, InfoIcon } from "lucide-react";
import { PropsWithChildren } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getDurationString } from "@/lib/flow/utils";
import { cn } from "@/lib/utils";

import { Label } from "../ui/label";

interface StatsShieldsProps {
  startTime: string;
  endTime: string;
  totalTokenCount: number;
  inputTokenCount: number;
  outputTokenCount: number;
  inputCost: number | null;
  outputCost: number | null;
  cost: number | null;
  className?: string;
}

export default function StatsShields({
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
}: PropsWithChildren<StatsShieldsProps>) {
  return (
    <div className={cn("flex items-center gap-2 font-mono min-w-0", className)}>
      <div className="flex space-x-1 items-center p-0.5 px-2 border rounded-md min-w-0">
        <Clock3 size={12} className="min-w-3 min-h-3" />
        <Label className="text-xs truncate" title={getDurationString(startTime, endTime)}>
          {getDurationString(startTime, endTime)}
        </Label>
      </div>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger className="min-w-0">
            <div className="flex space-x-1 items-center p-0.5 px-2 border rounded-md">
              <Coins size={12} />
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
          <TooltipTrigger className="min-w-0">
            <div className="flex space-x-1 items-center p-0.5 px-2 border rounded-md">
              <CircleDollarSign size={12} />
              <Label className="text-xs truncate">${cost?.toFixed(5)}</Label>
              <InfoIcon size={12} />
            </div>
          </TooltipTrigger>
          {/* portal here so that SpanView does not overlay */}
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
