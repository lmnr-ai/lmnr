import { ArrowRight } from "lucide-react";

import { pctChange } from "@/components/evaluation/metrics-panel/utils";
import { cn, isValidNumber } from "@/lib/utils";

interface MetricDeltaProps {
  label: string;
  current?: number;
  compared?: number;
  /** Value formatter. Defaults to a locale number with up to 3 decimals. */
  format?: (value: number) => string;
  /**
   * Whether a rise is an improvement. Drives ONLY the color; the arrow always
   * reflects factual direction. Cost/tokens/duration pass `false` (lower is
   * better), scores pass their resolved direction.
   */
  isHigherBetter?: boolean;
}

const defaultFormat = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });

/**
 * One `compared → current` metric row with a signed percent delta.
 *
 * A delta renders only when BOTH sides are real numbers and the baseline is
 * non-zero (`pctChange` returns null otherwise) — a percent change against a
 * zero baseline is meaningless, and a missing side means the datapoint doesn't
 * exist in that run, not that its value was zero.
 */
export default function MetricDelta({
  label,
  current,
  compared,
  format = defaultFormat,
  isHigherBetter = true,
}: MetricDeltaProps) {
  const hasCurrent = isValidNumber(current);
  const hasCompared = isValidNumber(compared);
  const change = hasCurrent && hasCompared ? pctChange(current!, compared!) : null;

  const increased = change !== null && change >= 0;
  // No change (0%) always reads as neutral-good, matching ScoreCardItem.
  const improved = change !== null && (change === 0 || increased === isHigherBetter);

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-2 text-xs">
      <span className="truncate text-secondary-foreground" title={label}>
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span className="tabular-nums text-muted-foreground">{hasCompared ? format(compared!) : "—"}</span>
        <ArrowRight size={10} className="shrink-0 self-center text-muted-foreground" />
        <span className="tabular-nums font-medium">{hasCurrent ? format(current!) : "—"}</span>
      </div>
      <span
        className={cn(
          "justify-self-end whitespace-nowrap tabular-nums",
          change === null ? "text-muted-foreground" : improved ? "text-success-bright" : "text-destructive"
        )}
      >
        {change === null ? "" : `${increased ? "▲" : "▼"} ${Math.abs(change).toFixed(1)}%`}
      </span>
    </div>
  );
}
