"use client";

import { useMemo } from "react";

import { Tooltip, TooltipContent, TooltipPortal, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
    <TooltipProvider delay={250}>
      <Tooltip>
        <TooltipTrigger render={<span className={cn("truncate", className)} />}>{formatDurationMs(ms)}</TooltipTrigger>
        <TooltipPortal>
          <TooltipContent className="border p-2">{formatDurationExact(ms)}</TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}
