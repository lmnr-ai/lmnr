"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { createPortal } from "react-dom";

import BinaryCard from "@/components/evaluation/metrics-panel/classic/binary-card";
import HistogramCard from "@/components/evaluation/metrics-panel/classic/histogram-card";
import { isBinaryDistribution, pctChange } from "@/components/evaluation/metrics-panel/utils";
import { useHoverGrowCard } from "@/components/evaluation/poc/score-hover-chips/use-hover-grow-card";
import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";
import { cn, isValidNumber } from "@/lib/utils";

interface ScoreHoverChipProps {
  name: string;
  statistics: EvaluationScoreStatistics | null;
  distribution: EvaluationScoreDistributionBucket[] | null;
  comparedStatistics: EvaluationScoreStatistics | null;
  comparedDistribution: EvaluationScoreDistributionBucket[] | null;
  isComparison?: boolean;
  selected: boolean;
  onSelect: () => void;
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
// Fixed content width the card grows into — Histogram/BinaryCard are w-full,
// so this pins what their "auto" animation target resolves to.
const CARD_WIDTH = 340;

/**
 * One chip in compact-v1's resting score row. Hovering grows the classic
 * histogram/binary card out of the chip in place — same choreography as
 * signal/clusters-section/cluster-list/cluster-item.tsx (see use-hover-grow-card).
 */
export default function ScoreHoverChip({
  name,
  statistics,
  distribution,
  comparedStatistics,
  comparedDistribution,
  isComparison,
  selected,
  onSelect,
}: ScoreHoverChipProps) {
  const cur = statistics?.averageValue;
  const cmp = isComparison ? comparedStatistics?.averageValue : undefined;
  const change = isValidNumber(cur) && isValidNumber(cmp) ? pctChange(cur, cmp) : null;
  const improved = change !== null && change >= 0;
  const isBinary = isBinaryDistribution(distribution);

  const { triggerRef, hovered, rect, handleMouseEnter, scheduleClose, closeImmediately } =
    useHoverGrowCard<HTMLButtonElement>();

  return (
    <>
      <button
        ref={triggerRef}
        onClick={onSelect}
        onWheel={closeImmediately}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={scheduleClose}
        className={cn(
          "flex items-baseline gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted",
          selected ? "border-primary/60 bg-muted" : "bg-secondary"
        )}
        title={selected ? `${name} (primary)` : name}
      >
        <span className="text-muted-foreground">{name}</span>
        <span className="flex items-center gap-1 font-medium tabular-nums">
          {isValidNumber(cmp) && (
            <>
              <span className="text-muted-foreground">{fmt(cmp)}</span>
              <ArrowRight className="size-2.5 text-muted-foreground" />
            </>
          )}
          {isValidNumber(cur) ? fmt(cur) : "—"}
        </span>
        {change !== null && (
          <span className={cn("tabular-nums text-[0.7rem]", improved ? "text-success-bright" : "text-destructive")}>
            {improved ? "▲" : "▼"}
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {hovered && rect && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.15 } }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                className="fixed z-50 pointer-events-none"
                style={{ top: rect.top, left: rect.left, minWidth: rect.width }}
              >
                <motion.div
                  className="overflow-hidden rounded-[4px] shadow-lg shadow-background/80"
                  initial={{ width: rect.width, height: rect.height }}
                  animate={{ width: "auto", height: "auto", transition: { duration: 0.15, ease: "easeOut" } }}
                  exit={{ width: rect.width, height: rect.height, transition: { duration: 0.15, ease: "easeOut" } }}
                  style={{ minWidth: rect.width, minHeight: rect.height }}
                >
                  <div style={{ width: CARD_WIDTH }}>
                    {isBinary ? (
                      <BinaryCard
                        name={name}
                        statistics={statistics}
                        distribution={distribution}
                        comparedDistribution={comparedDistribution}
                        isComparison={isComparison}
                      />
                    ) : (
                      <HistogramCard
                        name={name}
                        statistics={statistics}
                        comparedStatistics={comparedStatistics}
                        distribution={distribution}
                        comparedDistribution={comparedDistribution}
                        isComparison={isComparison}
                      />
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
