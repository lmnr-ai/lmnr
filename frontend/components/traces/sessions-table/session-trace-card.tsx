import { CircleDollarSign, Clock3, Coins } from "lucide-react";

import { type TraceRow } from "@/lib/traces/types";
import { cn, formatRelativeTime, getDurationString } from "@/lib/utils";

const compactNumberFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
});

const PLACEHOLDER_TEXT =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore " +
  "et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut " +
  "aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse " +
  "cillum dolore eu fugiat nulla pariatur.";

interface SessionTraceCardProps {
  trace: TraceRow;
  isFirst: boolean;
  isLast: boolean;
}

export default function SessionTraceCard({ trace, isFirst, isLast }: SessionTraceCardProps) {
  return (
    <div
      className={cn("flex w-full pl-6 pr-0", {
        "pt-2": isFirst,
        "pt-0": !isFirst,
        "pb-6": isLast,
        "pb-2": !isLast,
      })}
    >
      <div className="bg-secondary border rounded flex items-start overflow-clip w-full h-[173px]">
        {/* Details column */}
        <div className="flex flex-col h-full justify-between px-4 py-3 shrink-0 w-40">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-secondary-foreground leading-4">{formatRelativeTime(trace.startTime)}</span>
            <span className="text-xs text-primary-foreground leading-4 truncate">{trace.id}</span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex gap-1 h-4 items-center">
              <Clock3 size={12} className="shrink-0 text-muted-foreground" />
              <span className="font-mono text-xs text-muted-foreground whitespace-nowrap leading-4">
                {getDurationString(trace.startTime, trace.endTime)}
              </span>
            </div>
            <div className="flex gap-1 h-4 items-center">
              <Coins size={12} className="shrink-0 text-muted-foreground" />
              <span className="font-mono text-xs text-muted-foreground whitespace-nowrap leading-4">
                {compactNumberFormat.format(trace.totalTokens)}
              </span>
            </div>
            <div className="flex gap-1 h-4 items-center">
              <CircleDollarSign size={12} className="shrink-0 text-muted-foreground" />
              <span className="font-mono text-xs text-muted-foreground whitespace-nowrap leading-4">
                {trace.totalCost.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Input column */}
        <div className="bg-[rgba(34,34,38,0.5)] border-l flex-1 h-full min-w-0 overflow-clip px-3 py-2 relative">
          {/* TODO: Replace placeholder with actual trace input data */}
          <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-4">{PLACEHOLDER_TEXT}</p>
          <div className="absolute bg-gradient-to-b bottom-0 from-transparent to-secondary h-12 left-0 right-0" />
        </div>

        {/* Output column */}
        <div className="bg-[rgba(34,34,38,0.5)] border-l flex-1 h-full min-w-0 overflow-clip px-3 py-2 relative">
          {/* TODO: Replace placeholder with actual trace output data */}
          <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-4">{PLACEHOLDER_TEXT}</p>
          <div className="absolute bg-gradient-to-b bottom-0 from-transparent to-secondary h-12 left-0 right-0" />
        </div>
      </div>
    </div>
  );
}
