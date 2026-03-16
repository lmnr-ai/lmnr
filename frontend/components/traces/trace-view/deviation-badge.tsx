import { TooltipPortal } from "@radix-ui/react-tooltip";
import { ArrowDown, ArrowUp } from "lucide-react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface DeviationBadgeProps {
  actualMs: number;
  avgMs: number;
  actualCost: number;
  avgCost: number;
  className?: string;
}

function formatDeviation(actual: number, avg: number): { percent: number; direction: "faster" | "slower" | "same" } {
  if (avg === 0) return { percent: 0, direction: "same" };
  const diff = ((actual - avg) / avg) * 100;
  if (Math.abs(diff) < 1) return { percent: 0, direction: "same" };
  return {
    percent: Math.abs(Math.round(diff)),
    direction: diff > 0 ? "slower" : "faster",
  };
}

function formatCostDeviation(actual: number, avg: number): { percent: number; direction: "more" | "less" | "same" } {
  if (avg === 0) return { percent: 0, direction: "same" };
  const diff = ((actual - avg) / avg) * 100;
  if (Math.abs(diff) < 1) return { percent: 0, direction: "same" };
  return {
    percent: Math.abs(Math.round(diff)),
    direction: diff > 0 ? "more" : "less",
  };
}

export function DeviationBadge({ actualMs, avgMs, actualCost, avgCost, className }: DeviationBadgeProps) {
  const duration = formatDeviation(actualMs, avgMs);
  const cost = formatCostDeviation(actualCost, avgCost);

  const hasDuration = avgMs > 0 && duration.direction !== "same";
  const hasCost = avgCost > 0 && cost.direction !== "same";

  if (!hasDuration && !hasCost) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "inline-flex items-center gap-1.5 text-[11px] font-medium px-1.5 py-0.5 rounded-md animate-in fade-in duration-200 cursor-default",
              className
            )}
          >
            {hasDuration && <DurationPill duration={duration} />}
            {hasCost && <CostPill cost={cost} />}
          </div>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side="bottom" className="p-2 border text-xs max-w-64">
            <div className="flex flex-col gap-1">
              {hasDuration && (
                <span>
                  Duration is{" "}
                  <strong>
                    {duration.percent}% {duration.direction}
                  </strong>{" "}
                  than the 3-day avg ({(avgMs / 1000).toFixed(2)}s)
                </span>
              )}
              {hasCost && (
                <span>
                  Cost is{" "}
                  <strong>
                    {cost.percent}% {cost.direction}
                  </strong>{" "}
                  than the 3-day avg ($
                  {avgCost.toFixed(4)})
                </span>
              )}
            </div>
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}

function DurationPill({ duration }: { duration: { percent: number; direction: "faster" | "slower" | "same" } }) {
  const isFaster = duration.direction === "faster";
  const Icon = isFaster ? ArrowDown : ArrowUp;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 px-1 py-px rounded",
        isFaster
          ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
          : "text-orange-600 dark:text-orange-400 bg-orange-500/10"
      )}
    >
      <Icon size={10} />
      {duration.percent}%
    </span>
  );
}

function CostPill({ cost }: { cost: { percent: number; direction: "more" | "less" | "same" } }) {
  const isLess = cost.direction === "less";
  const Icon = isLess ? ArrowDown : ArrowUp;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 px-1 py-px rounded",
        isLess
          ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
          : "text-orange-600 dark:text-orange-400 bg-orange-500/10"
      )}
    >
      <Icon size={10} />
      {cost.percent}%
    </span>
  );
}
