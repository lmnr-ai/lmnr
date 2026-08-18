"use client";

import { ArrowRight } from "lucide-react";

import { type AggregationKind, pctChange } from "@/components/evaluation/metrics-panel/utils";
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";
import { type EvaluationScoreStatistics } from "@/lib/evaluation/types";
import { cn, isValidNumber } from "@/lib/utils";

interface ScoreCardItemProps {
  name: string;
  aggregation: AggregationKind;
  statistics: EvaluationScoreStatistics | null;
  comparedStatistics: EvaluationScoreStatistics | null;
  isComparison?: boolean;
  /** Resolved score direction. Absent = higher is better. */
  isHigherBetter?: boolean;
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmtPrecise = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 6 });

// Exact per-run aggregate for the selected function. Values are computed
// server-side over the raw datapoint scores (see lib/evaluation/aggregation.ts).
function scalarFor(aggregation: AggregationKind, statistics: EvaluationScoreStatistics | null): number | undefined {
  if (!statistics) return undefined;
  return aggregation === "avg" ? statistics.averageValue : statistics[aggregation];
}

// One score's whole-run aggregate: name on top, big number below, and (in
// comparison mode) the compared value + percent delta. Dividers live between
// items only (see first: / not-first: border classes).
export default function ScoreCardItem({
  name,
  aggregation,
  statistics,
  comparedStatistics,
  isComparison,
  isHigherBetter = true,
}: ScoreCardItemProps) {
  const cur = scalarFor(aggregation, statistics);
  const cmp = isComparison ? scalarFor(aggregation, comparedStatistics) : undefined;

  const validCur = isValidNumber(cur);
  const validCmp = isComparison && isValidNumber(cmp);
  const change = validCur && validCmp ? pctChange(cur!, cmp!) : null;
  // Arrow = factual movement; "improved" (color) accounts for score direction.
  // No change (0%) always reads as improved.
  const increased = change !== null && change >= 0;
  const improved = change !== null && (change === 0 || increased === isHigherBetter);

  return (
    <div className="relative flex min-w-[140px] shrink-0 flex-col gap-1.5">
      <span className="truncate text-xs font-medium text-muted-foreground" title={name}>
        {name}
      </span>
      <div className="flex items-baseline gap-2">
        <div className="flex items-center gap-1 text-4xl tabular-nums">
          {validCmp && (
            <>
              <FormattedAggregate value={cmp!} className="text-muted-foreground" />
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </>
          )}
          {validCur ? (
            <FormattedAggregate value={cur!} className="text-foreground" />
          ) : (
            <span className="font-medium leading-none tracking-[-0.4px] text-foreground">—</span>
          )}
        </div>
        {change !== null && (
          <span
            className={cn(
              "whitespace-nowrap text-[12px] leading-[10px] tabular-nums",
              improved ? "text-success-bright" : "text-destructive"
            )}
          >
            <DeltaTriangle direction={increased ? "up" : "down"} />
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

function FormattedAggregate({ value, className }: { value: number; className?: string }) {
  return (
    <Tooltip delayDuration={250}>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex cursor-default font-medium leading-none tracking-[-0.4px]", className)}>
          {fmt(value)}
        </span>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent className="tabular-nums">{fmtPrecise(value)}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}

function DeltaTriangle({ direction }: { direction: "up" | "down" }) {
  const points = direction === "up" ? "4,0 8,7 0,7" : "0,0 8,0 4,7";
  return (
    <svg
      width="8"
      height="7"
      viewBox="0 0 8 7"
      className="mr-1 inline-block fill-current align-baseline"
      aria-hidden="true"
    >
      <polygon points={points} />
    </svg>
  );
}
