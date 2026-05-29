import { ArrowRight } from "lucide-react";

import { binaryCounts, pctChange } from "@/components/evaluation/metrics-panel/utils";
import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";
import { cn, isValidNumber } from "@/lib/utils";

interface BinaryCardProps {
  name: string;
  statistics: EvaluationScoreStatistics | null;
  distribution: EvaluationScoreDistributionBucket[] | null;
  comparedDistribution?: EvaluationScoreDistributionBucket[] | null;
  isComparison?: boolean;
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function BinaryCard({
  name,
  statistics,
  distribution,
  comparedDistribution,
  isComparison,
}: BinaryCardProps) {
  const cur = binaryCounts(distribution);
  const cmp = comparedDistribution ? binaryCounts(comparedDistribution) : null;
  const curRate: number | undefined = cur.total > 0 ? cur.positive / cur.total : statistics?.averageValue;
  const cmpRate: number | undefined = isComparison && cmp && cmp.total > 0 ? cmp.positive / cmp.total : undefined;

  const curValid = isValidNumber(curRate);
  const cmpValid = isComparison && isValidNumber(cmpRate);
  const change = curValid && cmpValid ? pctChange(curRate!, cmpRate!) : null;
  const improved = change !== null && change >= 0;

  return (
    <div className="flex items-end gap-6 h-[74px] w-full px-5 py-4 border border-border rounded-[4px] bg-secondary">
      <div className="flex flex-col gap-2 shrink-0 min-w-[120px]">
        <p className="text-xs leading-4 text-muted-foreground truncate">{name}</p>
        <div className="flex items-baseline gap-2">
          <div className="flex items-center gap-1 tabular-nums">
            {cmpValid && (
              <>
                <span className="text-[20px] font-medium leading-4 tracking-[-0.4px] text-muted-foreground">
                  {fmt(cmpRate!)}
                </span>
                <ArrowRight className="size-3 text-muted-foreground shrink-0" />
              </>
            )}
            <span className="text-[20px] font-medium leading-4 tracking-[-0.4px] text-foreground">
              {curValid ? fmt(curRate!) : "—"}
            </span>
          </div>
          {change !== null && (
            <span
              className={cn(
                "text-[12px] leading-[10px] tabular-nums whitespace-nowrap",
                improved ? "text-success-bright" : "text-destructive"
              )}
            >
              <DeltaTriangle direction={improved ? "up" : "down"} />
              {Math.abs(change).toFixed(1)}%
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 min-w-0 flex items-center pb-1">
        <DeltaBar curRate={curValid ? curRate! : 0} cmpRate={cmpValid ? cmpRate! : null} />
      </div>
    </div>
  );
}

// Three flex segments sum to 1. Same shape for both directions:
//   LEFT  (0   → min(prev,cur)):  faded direction colour
//   CENTER(min → max         ):  bright direction colour, triangle pointing at cur
//   RIGHT (max → 1           ):  grey
// Increase → green, triangle right; decrease → red, triangle left.
// No-comparison: solid bright from 0→cur, grey from cur→1.
function DeltaBar({ curRate, cmpRate }: { curRate: number; cmpRate: number | null }) {
  const cur = clamp01(curRate);
  if (cmpRate === null) {
    return (
      <div className="flex items-center w-full">
        <div className="bg-success h-1 rounded-l-full" style={{ flex: cur }} />
        <div className="bg-muted h-1 rounded-r-full" style={{ flex: Math.max(0, 1 - cur) }} />
      </div>
    );
  }
  const cmp = clamp01(cmpRate);
  const lo = Math.min(cur, cmp);
  const hi = Math.max(cur, cmp);
  const delta = hi - lo;
  const right = Math.max(0, 1 - hi);

  if (cur >= cmp) {
    // Increase: faded green | bright green +▶ | grey
    return (
      <div className="flex items-center w-full">
        <div className="h-1 rounded-l-full bg-success opacity-30" style={{ flex: lo }} />
        <div className="h-2 relative bg-success" style={{ flex: delta }}>
          <span className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-full pointer-events-none text-success">
            <BarTriangle direction="right" />
          </span>
        </div>
        <div className="h-1 rounded-r-full bg-muted" style={{ flex: right }} />
      </div>
    );
  }
  // Decrease: faded red | bright red +◀ | grey
  return (
    <div className="flex items-center w-full">
      <div className="h-1 rounded-l-full bg-destructive opacity-50" style={{ flex: lo }} />
      <div className="h-2 relative bg-destructive" style={{ flex: delta }}>
        <span className="absolute top-1/2 left-0 -translate-y-1/2 -translate-x-full pointer-events-none text-destructive">
          <BarTriangle direction="left" />
        </span>
      </div>
      <div className="h-1 rounded-r-full bg-muted" style={{ flex: right }} />
    </div>
  );
}

function BarTriangle({ direction }: { direction: "right" | "left" }) {
  const points = direction === "right" ? "0,0 6,5 0,10" : "6,0 0,5 6,10";
  return (
    <svg width="6" height="10" viewBox="0 0 6 10" className="fill-current block">
      <polygon points={points} />
    </svg>
  );
}

function DeltaTriangle({ direction }: { direction: "up" | "down" }) {
  const points = direction === "up" ? "4,0 8,7 0,7" : "0,0 8,0 4,7";
  return (
    <svg
      width="8"
      height="7"
      viewBox="0 0 8 7"
      className="fill-current inline-block align-baseline mr-1"
      aria-hidden="true"
    >
      <polygon points={points} />
    </svg>
  );
}

function clamp01(n: number): number {
  if (!isValidNumber(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
