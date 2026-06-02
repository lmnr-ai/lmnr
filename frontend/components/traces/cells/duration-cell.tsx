"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { useMemo } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { durationMsBetween, formatDurationExact, formatDurationMs } from "@/lib/traces/format";
import { cn } from "@/lib/utils";

interface DurationCellProps {
  // Sessions store seconds — multiply by 1000 at the call site.
  durationMs?: number | null;
  startTime?: string;
  endTime?: string;
  className?: string;
}

export function DurationCell({ durationMs, startTime, endTime, className }: DurationCellProps) {
  const ms = useMemo(
    () => (durationMs != null ? durationMs : durationMsBetween(startTime, endTime)),
    [durationMs, startTime, endTime]
  );

  if (ms == null) {
    return <span className={cn("truncate text-muted-foreground", className)}>-</span>;
  }

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("truncate", className)}>{formatDurationMs(ms)}</span>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent className="border">{formatDurationExact(ms)}</TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}
