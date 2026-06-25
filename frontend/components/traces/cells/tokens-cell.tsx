"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";

import { TokensBreakdown } from "@/components/traces/cells/tokens-breakdown";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatTokensCompact, type TokenStats } from "@/lib/traces/format";
import { cn } from "@/lib/utils";

interface TokensCellProps {
  stats: TokenStats;
  className?: string;
  showCacheInline?: boolean;
}

export function TokensCell({ stats, className, showCacheInline = false }: TokensCellProps) {
  const inputTokens = stats.inputTokens ?? 0;
  const outputTokens = stats.outputTokens ?? 0;
  const totalTokens = stats.totalTokens ?? (inputTokens || outputTokens ? inputTokens + outputTokens : 0);
  const cacheReadInputTokens = stats.cacheReadInputTokens ?? 0;

  if (!totalTokens && !inputTokens && !outputTokens) {
    return <span className={cn("truncate text-muted-foreground", className)}>-</span>;
  }

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("truncate", className)}>
            {formatTokensCompact(stats.inputTokens)} {"→"} {formatTokensCompact(stats.outputTokens)}{" "}
            <span className="text-muted-foreground">({formatTokensCompact(totalTokens)})</span>
            {showCacheInline && cacheReadInputTokens > 0 && (
              <span className="text-success-bright"> {formatTokensCompact(cacheReadInputTokens)}</span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent className="flex flex-col border gap-1 min-w-[220px] px-3 py-2">
            <TokensBreakdown stats={stats} />
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}
