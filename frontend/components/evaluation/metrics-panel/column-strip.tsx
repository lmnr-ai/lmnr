import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { useMemo, useRef } from "react";

import BinaryCard from "@/components/evaluation/metrics-panel/binary-card";
import HistogramCard from "@/components/evaluation/metrics-panel/histogram-card";
import { type AggregationKind, isBinaryDistribution } from "@/components/evaluation/metrics-panel/utils";
import { ScrollBar } from "@/components/ui/scroll-area";
import ScrollEdgeFades from "@/components/ui/scroll-edge-fades";
import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";

const COLUMN_WIDTH = 400;
const COLUMN_GAP = 12;
// Vertical gap between stacked binaries — chosen so 74 + STACK_GAP + 74 == 156 (histogram height).
const STACK_GAP = 8;

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

type PackedColumn = { kind: "binary-pair"; top: string; bottom: string | null } | { kind: "histogram"; name: string };

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
  const columns = useMemo<PackedColumn[]>(() => {
    const ordered = [...scoreNames].sort((a, b) => a.localeCompare(b));
    const items = ordered.map((name) => ({
      name,
      binary: isBinaryDistribution(allDistributions?.[name] ?? null),
    }));
    // Gravity packing: the most recent open binary-pair column stays open
    // indefinitely (across any number of histograms) until a later binary
    // falls into its bottom slot.
    const out: PackedColumn[] = [];
    let openPairIdx: number | null = null;
    for (const item of items) {
      if (item.binary) {
        if (openPairIdx !== null) {
          const col = out[openPairIdx];
          if (col.kind === "binary-pair") col.bottom = item.name;
          openPairIdx = null;
        } else {
          out.push({ kind: "binary-pair", top: item.name, bottom: null });
          openPairIdx = out.length - 1;
        }
      } else {
        out.push({ kind: "histogram", name: item.name });
      }
    }
    return out;
  }, [scoreNames, allDistributions]);

  const viewportRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative w-full">
      <ScrollAreaPrimitive.Root className="relative w-full overflow-hidden">
        <ScrollAreaPrimitive.Viewport ref={viewportRef} className="w-full">
          {/* w-max + mx-auto: centers when content fits, left-aligns + scrolls when it overflows
              (auto margins collapse to 0 when there's no positive free space).
              items-stretch keeps lone-binary columns visually aligned with histogram columns. */}
          <div className="flex w-max mx-auto items-stretch" style={{ gap: COLUMN_GAP }}>
            {columns.map((col, i) => (
              <div key={i} className="shrink-0 flex flex-col" style={{ width: COLUMN_WIDTH, gap: STACK_GAP }}>
                {col.kind === "histogram" ? (
                  <HistogramCard
                    name={col.name}
                    statistics={allStatistics?.[col.name] ?? null}
                    comparedStatistics={comparedAllStatistics?.[col.name] ?? null}
                    distribution={allDistributions?.[col.name] ?? null}
                    comparedDistribution={comparedAllDistributions?.[col.name] ?? null}
                    isComparison={isComparison}
                    aggregation={aggregation}
                    onClick={() => onExpand?.(col.name)}
                  />
                ) : (
                  <>
                    <BinaryCard
                      name={col.top}
                      statistics={allStatistics?.[col.top] ?? null}
                      distribution={allDistributions?.[col.top] ?? null}
                      comparedDistribution={comparedAllDistributions?.[col.top] ?? null}
                      isComparison={isComparison}
                    />
                    {col.bottom && (
                      <BinaryCard
                        name={col.bottom}
                        statistics={allStatistics?.[col.bottom] ?? null}
                        distribution={allDistributions?.[col.bottom] ?? null}
                        comparedDistribution={comparedAllDistributions?.[col.bottom] ?? null}
                        isComparison={isComparison}
                      />
                    )}
                  </>
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
