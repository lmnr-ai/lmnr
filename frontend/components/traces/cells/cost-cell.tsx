"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";

import { CostBreakdown } from "@/components/traces/cells/cost-breakdown";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type CostStats, currencyFormatter } from "@/lib/traces/format";
import { cn } from "@/lib/utils";

interface CostCellProps {
  stats: CostStats;
  className?: string;
}

export function CostCell({ stats, className }: CostCellProps) {
  const totalCost = stats.totalCost ?? 0;

  if (totalCost <= 0) {
    return <span className={cn("truncate text-muted-foreground", className)}>-</span>;
  }

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("truncate", className)}>{currencyFormatter.format(totalCost)}</span>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent className="flex flex-col border gap-1 min-w-[200px] px-3 py-2">
            <CostBreakdown stats={stats} />
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}
