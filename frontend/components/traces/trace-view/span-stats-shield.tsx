import { ArrowRight, CircleDollarSign, Clock3, Coins } from "lucide-react";

import { cn, getDurationString } from "@/lib/utils";

const numberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
});

interface SpanStatsShieldProps {
  startTime: string;
  endTime: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cost?: number | null;
  cacheReadInputTokens?: number | null;
  className?: string;
  variant?: "badge" | "inline";
}

export function SpanStatsShield({
  startTime,
  endTime,
  inputTokens,
  outputTokens,
  cost,
  cacheReadInputTokens,
  className,
  variant = "badge",
}: SpanStatsShieldProps) {
  const isInline = variant === "inline";
  const itemColor = isInline ? "text-muted-foreground" : "text-secondary-foreground";
  const hasTokens = !!inputTokens || !!outputTokens;

  return (
    <div
      className={cn(
        "items-center gap-2 text-xs flex shrink-0",
        !isInline && "bg-muted px-1.5 rounded-md animate-in fade-in duration-200",
        className
      )}
    >
      <div className={cn(itemColor, "inline-flex items-center gap-1 whitespace-nowrap", !isInline && "py-0.5")}>
        <Clock3 size={isInline ? 12 : 14} className={cn("min-w-3 min-h-3", isInline ? "size-3" : "size-3.5")} />
        <span>{getDurationString(startTime, endTime)}</span>
      </div>
      {hasTokens && (
        <div className={cn(itemColor, "inline-flex items-center gap-1 whitespace-nowrap", !isInline && "py-0.5")}>
          <Coins size={isInline ? 12 : 14} className={cn("min-w-3 min-h-3", isInline ? "size-3" : "size-3.5")} />
          <span>{numberFormatter.format(inputTokens ?? 0)}</span>
          {!!cacheReadInputTokens && (
            <span className="text-success-bright">({numberFormatter.format(cacheReadInputTokens)})</span>
          )}
          <ArrowRight size={12} />
          <span>{numberFormatter.format(outputTokens ?? 0)}</span>
        </div>
      )}
      {!!cost && (
        <div className={cn(itemColor, "inline-flex items-center gap-1 whitespace-nowrap", !isInline && "py-0.5")}>
          <CircleDollarSign
            size={isInline ? 12 : 14}
            className={cn("min-w-3 min-h-3", isInline ? "size-3" : "size-3.5")}
          />
          <span>${cost.toFixed(4)}</span>
        </div>
      )}
    </div>
  );
}
