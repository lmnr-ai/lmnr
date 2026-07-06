import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { useMemo, useRef } from "react";

import BinaryCard from "@/components/evaluation/metrics-panel/binary-card";
import HistogramCard from "@/components/evaluation/metrics-panel/histogram-card";
import { type AggregationKind, isBinaryDistribution } from "@/components/evaluation/metrics-panel/utils";
import { ScrollBar } from "@/components/ui/scroll-area";
import ScrollEdgeFades from "@/components/ui/scroll-edge-fades";
import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";

const CARD_WIDTH = 340;
const CARD_GAP = 12;

interface ColumnStripProps {
  scoreNames: string[];
  allStatistics?: Record<string, EvaluationScoreStatistics>;
  allDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  comparedAllStatistics?: Record<string, EvaluationScoreStatistics>;
  comparedAllDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  isComparison?: boolean;
  aggregation?: AggregationKind;
  onExpand?: (name: string) => void;
}

export default function ColumnStrip({
  scoreNames,
  allStatistics,
  allDistributions,
  comparedAllStatistics,
  comparedAllDistributions,
  isComparison,
  aggregation,
  onExpand,
}: ColumnStripProps) {
  // Every score is one compact, equal-size card — no more binary/histogram
  // half/full split or vertical stacking. Sort, then lay out in a single row.
  const ordered = useMemo(() => [...scoreNames].sort((a, b) => a.localeCompare(b)), [scoreNames]);

  const viewportRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative w-full">
      <ScrollAreaPrimitive.Root className="relative w-full overflow-hidden">
        <ScrollAreaPrimitive.Viewport ref={viewportRef} className="w-full">
          {/* w-max + mx-auto: centers when content fits, left-aligns + scrolls when it overflows
              (auto margins collapse to 0 when there's no positive free space). */}
          <div className="flex w-max mx-auto items-stretch" style={{ gap: CARD_GAP }}>
            {ordered.map((name) => (
              <div key={name} className="shrink-0" style={{ width: CARD_WIDTH }}>
                {isBinaryDistribution(allDistributions?.[name] ?? null) ? (
                  <BinaryCard
                    name={name}
                    statistics={allStatistics?.[name] ?? null}
                    distribution={allDistributions?.[name] ?? null}
                    comparedDistribution={comparedAllDistributions?.[name] ?? null}
                    isComparison={isComparison}
                  />
                ) : (
                  <HistogramCard
                    name={name}
                    statistics={allStatistics?.[name] ?? null}
                    comparedStatistics={comparedAllStatistics?.[name] ?? null}
                    distribution={allDistributions?.[name] ?? null}
                    comparedDistribution={comparedAllDistributions?.[name] ?? null}
                    isComparison={isComparison}
                    aggregation={aggregation}
                    onClick={() => onExpand?.(name)}
                  />
                )}
              </div>
            ))}
          </div>
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar orientation="horizontal" />
      </ScrollAreaPrimitive.Root>
      <ScrollEdgeFades scrollRef={viewportRef} />
    </div>
  );
}
