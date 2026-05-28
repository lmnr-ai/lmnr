import { ArrowRight } from "lucide-react";

import { type BinaryStyle } from "@/components/evaluation/metrics-panel/binary-viz";
import SmartViz from "@/components/evaluation/metrics-panel/smart-viz";
import { pctChange } from "@/components/evaluation/metrics-panel/utils";
import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";
import { cn, isValidNumber } from "@/lib/utils";

// full   = card + inline viz (sparkline / binary)
// card   = card layout, label + values, no inline viz (Figma node 4227:3443)
// compact = single tight row (Bloomberg ticker)
export type MetricRowDensity = "full" | "card" | "compact";

interface MetricRowProps {
  name: string;
  statistics: EvaluationScoreStatistics | null;
  comparedStatistics?: EvaluationScoreStatistics | null;
  distribution: EvaluationScoreDistributionBucket[] | null;
  comparedDistribution?: EvaluationScoreDistributionBucket[] | null;
  isComparison?: boolean;
  selected?: boolean;
  onClick?: () => void;
  density?: MetricRowDensity;
  binaryStyle?: BinaryStyle;
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function MetricRow({
  name,
  statistics,
  comparedStatistics,
  distribution,
  comparedDistribution,
  isComparison,
  selected,
  onClick,
  density = "full",
  binaryStyle = "dual",
}: MetricRowProps) {
  const avg = statistics?.averageValue;
  const cAvg = comparedStatistics?.averageValue;
  const validAvg = isValidNumber(avg);
  const validC = isValidNumber(cAvg);
  const change = validAvg && validC ? pctChange(avg, cAvg) : null;
  const showViz = density === "full";

  if (density === "compact") {
    return (
      <CompactRow
        name={name}
        avg={avg}
        cAvg={cAvg}
        change={change}
        isComparison={isComparison}
        selected={selected}
        onClick={onClick}
      />
    );
  }

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        "group w-full text-left cursor-pointer transition-colors rounded-[4px] border border-border",
        "px-5 py-4 flex flex-col gap-2 items-start justify-center",
        selected ? "bg-muted/50" : "hover:bg-muted/30"
      )}
    >
      <p className="text-xs leading-4 text-muted-foreground truncate w-full">{name}</p>
      <div className="flex items-end gap-2">
        <div className="flex items-center gap-1 tabular-nums">
          {isComparison && validC && (
            <>
              <span className="text-[20px] font-medium leading-4 tracking-[-0.4px] text-muted-foreground">
                {fmt(cAvg)}
              </span>
              <ArrowRight className="size-3 text-muted-foreground shrink-0" />
            </>
          )}
          <span className="text-[20px] font-medium leading-4 tracking-[-0.4px] text-foreground">
            {validAvg ? fmt(avg) : "—"}
          </span>
        </div>
        {change !== null && (
          <div
            className={cn(
              "flex items-center gap-0.5 self-end pb-px",
              change >= 0 ? "text-success-bright" : "text-destructive"
            )}
          >
            <DeltaTriangle direction={change >= 0 ? "up" : "down"} />
            <span className="text-xs leading-[10px] tabular-nums">{Math.abs(change).toFixed(1)}%</span>
          </div>
        )}
      </div>
      {showViz && (
        <div className="mt-1 w-full">
          <SmartViz
            distribution={distribution}
            comparedDistribution={isComparison ? comparedDistribution : null}
            isComparison={isComparison}
            binaryStyle={binaryStyle}
            size="sm"
            className="h-20"
          />
        </div>
      )}
    </div>
  );
}

function DeltaTriangle({ direction }: { direction: "up" | "down" }) {
  const points = direction === "up" ? "4,0 8,7 0,7" : "0,0 8,0 4,7";
  return (
    <svg width="8" height="7" viewBox="0 0 8 7" className="fill-current shrink-0" aria-hidden="true">
      <polygon points={points} />
    </svg>
  );
}

function CompactRow({
  name,
  avg,
  cAvg,
  change,
  isComparison,
  selected,
  onClick,
}: {
  name: string;
  avg?: number;
  cAvg?: number;
  change: number | null;
  isComparison?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const validAvg = isValidNumber(avg);
  const validC = isValidNumber(cAvg);
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        "w-full cursor-pointer flex items-baseline gap-2 px-2 py-1 border-l-2 hover:bg-accent/30 rounded-[2px]",
        selected ? "bg-muted/50 border-l-primary" : "border-l-transparent"
      )}
    >
      <span className="text-xs text-muted-foreground truncate flex-1">{name}</span>
      <span className="flex items-baseline gap-1.5 tabular-nums shrink-0">
        {isComparison && validC && <span className="text-xs text-muted-foreground">{fmt(cAvg!)}</span>}
        <span className="text-sm font-medium">{validAvg ? fmt(avg!) : "—"}</span>
        {change !== null && (
          <span
            className={cn(
              "text-[11px] flex items-center gap-0.5",
              change >= 0 ? "text-success-bright" : "text-destructive"
            )}
          >
            <DeltaTriangle direction={change >= 0 ? "up" : "down"} />
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </span>
    </div>
  );
}
