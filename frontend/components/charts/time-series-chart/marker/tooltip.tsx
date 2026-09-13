"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { type PropsWithChildren } from "react";

import { parseUtcTimestamp } from "@/components/chart-builder/charts/utils";
import { Tooltip, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";

import { type TimeSeriesMarker } from "../types";

const formatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
});

const formatTime = (timestamp: string): string => {
  const date = parseUtcTimestamp(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : formatter.format(date);
};

export default function MarkerTooltip({
  entries,
  children,
}: PropsWithChildren<{ entries: NonNullable<TimeSeriesMarker["tooltip"]> }>) {
  const [first, ...rest] = entries;
  if (!first) return children;

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipPortal>
        <TooltipPrimitive.Content
          side="right"
          sideOffset={4}
          className="z-50 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          <div className="grid min-w-32 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
            {rest.length === 0 ? (
              <>
                <div className="font-medium">{formatTime(first.timestamp)}</div>
                <span className="text-muted-foreground">{first.label}</span>
              </>
            ) : (
              <div className="grid gap-1.5">
                {entries.map((entry) => (
                  <div key={`${entry.label}-${entry.timestamp}`} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{entry.label}</span>
                    <span className="shrink-0 font-mono font-medium tabular-nums text-foreground">
                      {formatTime(entry.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TooltipPrimitive.Content>
      </TooltipPortal>
    </Tooltip>
  );
}
