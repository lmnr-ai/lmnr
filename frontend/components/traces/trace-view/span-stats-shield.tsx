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
  variant?: "badge" | "inline";
}

export function SpanStatsShield({
  startTime,
  endTime,
  tokens,
  cost,
  cacheReadInputTokens,
  className,
  variant = "badge",
}: SpanStatsShieldProps) {
  const isInline = variant === "inline";
  const itemColor = isInline ? "text-muted-foreground" : "text-secondary-foreground";

  return (
    <div
      className={cn(
        "items-center gap-2 text-xs flex shrink-0",
        !isInline && "bg-muted px-1.5 rounded-md animate-in fade-in duration-200",
        className
      )}
    >
      <div className={cn(itemColor, "inline-flex items-center gap-1 whitespace-nowrap", !isInline && "py-0.5")}>
        <Clock3 size={12} className="min-w-3 min-h-3" />
        <span>{getDurationString(startTime, endTime)}</span>
      </div>
      {!!tokens && (
        <div className={cn(itemColor, "inline-flex items-center gap-1 whitespace-nowrap", !isInline && "py-0.5")}>
          <Coins size={isInline ? 12 : 14} className={isInline ? "min-w-3 min-h-3" : "min-w-3.5 min-h-3.5"} />
          <span>{numberFormatter.format(tokens)}</span>
          {!!cacheReadInputTokens && (
            <span className="text-success-bright">({numberFormatter.format(cacheReadInputTokens)})</span>
          )}
        </div>
      )}
      {!!cost && (
        <div className={cn(itemColor, "inline-flex items-center gap-1 whitespace-nowrap", !isInline && "py-0.5")}>
          <CircleDollarSign
            size={isInline ? 12 : 14}
            className={isInline ? "min-w-3 min-h-3" : "min-w-3.5 min-h-3.5"}
          />
          <span>${cost.toFixed(4)}</span>
        </div>
      )}
    </div>
  );
}
