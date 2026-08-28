"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { CircleDollarSign, Clock3, Coins } from "lucide-react";
import { type ReactNode } from "react";

import { CostBreakdown, TokensBreakdown } from "@/components/traces/cells";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type EvaluationTotals } from "@/lib/evaluation/types";
import { formatCostNumber, formatDurationMs, formatTokensCompact } from "@/lib/traces/format";
import { cn } from "@/lib/utils";

interface RunTotalsProps {
  totals?: EvaluationTotals;
  /** Compared run's totals — shown as a second breakdown row when comparing. */
  comparedTotals?: EvaluationTotals;
  isComparison?: boolean;
  className?: string;
}

const Shield = ({ icon, value, breakdown }: { icon: ReactNode; value: string; breakdown: ReactNode }) => (
  <Tooltip delayDuration={250}>
    <TooltipTrigger asChild>
      <div className="flex items-center gap-1 text-sm text-secondary-foreground">
        {icon}
        <span className="tabular-nums">{value}</span>
      </div>
    </TooltipTrigger>
    <TooltipPortal>
      <TooltipContent className="flex min-w-55 flex-col gap-1 border p-2">{breakdown}</TooltipContent>
    </TooltipPortal>
  </Tooltip>
);

/**
 * Whole-run cost / token / duration totals, aggregated server-side over the
 * eval's datapoints under the active filters. Sidecar on the scores control
 * row — not a second summary band.
 *
 * Cost and tokens reuse the trace-cell breakdown components so the tooltip
 * wording (incl. cache-read being a subset of input) matches the trace views.
 */
export default function RunTotals({ totals, comparedTotals, isComparison, className }: RunTotalsProps) {
  if (!totals) return null;

  const costBreakdown = (
    <>
      <CostBreakdown stats={totals} />
      {isComparison && comparedTotals && (
        <div className="mt-1 flex flex-col gap-1 border-t pt-2">
          <CostBreakdown stats={comparedTotals} labelPrefix="Compared" />
        </div>
      )}
    </>
  );

  const tokensBreakdown = (
    <>
      <TokensBreakdown stats={totals} />
      {!!totals.cacheCreationInputTokens && (
        <div className="flex justify-between gap-4 text-xs text-secondary-foreground">
          <span>Cache write tokens</span>
          <span className="tabular-nums">{formatTokensCompact(totals.cacheCreationInputTokens)}</span>
        </div>
      )}
      {isComparison && comparedTotals && (
        <div className="mt-1 flex flex-col gap-1 border-t pt-2">
          <TokensBreakdown stats={comparedTotals} labelPrefix="Compared" />
        </div>
      )}
    </>
  );

  const durationBreakdown = (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between gap-4 text-xs">
        <span className="text-secondary-foreground">Datapoints</span>
        <span className="tabular-nums">{totals.datapointCount}</span>
      </div>
      <div className="flex justify-between gap-4 text-xs">
        <span className="text-secondary-foreground">Total duration</span>
        <span className="tabular-nums">{formatDurationMs(totals.totalDuration * 1000)}</span>
      </div>
      <div className="flex justify-between gap-4 text-xs">
        <span className="text-secondary-foreground">Average datapoint duration</span>
        <span className="tabular-nums">
          {totals.datapointCount > 0
            ? formatDurationMs((totals.totalDuration / totals.datapointCount) * 1000)
            : formatDurationMs(0)}
        </span>
      </div>
    </div>
  );

  return (
    <div className={cn("flex shrink-0 items-center gap-3", className)}>
      <Shield
        icon={<CircleDollarSign size={12} className="min-w-3" />}
        value={formatCostNumber(totals.totalCost)}
        breakdown={costBreakdown}
      />
      <Shield
        icon={<Coins size={12} className="min-w-3" />}
        value={formatTokensCompact(totals.totalTokens)}
        breakdown={tokensBreakdown}
      />
      <Shield
        icon={<Clock3 size={12} className="min-w-3" />}
        value={formatDurationMs(totals.totalDuration * 1000)}
        breakdown={durationBreakdown}
      />
    </div>
  );
}
