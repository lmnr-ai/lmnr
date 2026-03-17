import { CircleDollarSign, Clock3, Coins } from "lucide-react";

import { cn, getDurationString } from "@/lib/utils";

const numberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
});

interface SpanStatsShieldProps {
  startTime: string;
  endTime: string;
  tokens?: number | null;
  cost?: number | null;
  cacheReadInputTokens?: number | null;
  className?: string;
}

export function SpanStatsShield({
  startTime,
  endTime,
  tokens,
  cost,
  cacheReadInputTokens,
  className,
}: SpanStatsShieldProps) {
  return (
    <div
      className={cn(
        "items-center gap-2 text-xs bg-muted px-1.5 rounded-md flex flex-shrink-0 animate-in fade-in duration-200",
        className
      )}
    >
      <div className="text-secondary-foreground py-0.5 inline-flex items-center gap-1 whitespace-nowrap">
        <Clock3 size={12} className="min-w-3 min-h-3" />
        <span>{getDurationString(startTime, endTime)}</span>
      </div>
      {!!tokens && (
        <div className="text-secondary-foreground py-0.5 inline-flex items-center gap-1 whitespace-nowrap">
          <Coins size={14} className="min-w-[14px] min-h-[14px]" />
          <span>{numberFormatter.format(tokens)}</span>
          {!!cacheReadInputTokens && (
            <span className="text-success-bright">({numberFormatter.format(cacheReadInputTokens)})</span>
          )}
        </div>
      )}
      {!!cost && (
        <div className="text-secondary-foreground py-0.5 inline-flex items-center gap-1 whitespace-nowrap">
          <CircleDollarSign size={14} className="min-w-[14px] min-h-[14px]" />
          <span>${cost.toFixed(4)}</span>
        </div>
      )}
    </div>
  );
}
