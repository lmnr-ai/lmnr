"use client";

import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";

import HistogramCard from "@/components/evaluation/metrics-panel/classic/histogram-card";
import { isBinaryDistribution } from "@/components/evaluation/metrics-panel/utils";
import { useHoverGrowCard } from "@/components/evaluation/poc/score-hover-chips/use-hover-grow-card";
import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";
import { isValidNumber } from "@/lib/utils";

interface RowScoreChipProps {
  name: string;
  /** This datapoint's value for the score, not an aggregate. */
  value?: number;
  statistics: EvaluationScoreStatistics | null;
  distribution: EvaluationScoreDistributionBucket[] | null;
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });
const CARD_WIDTH = 340;

/**
 * One selected-row score chip. Hover grows the SAME full-view histogram card
 * out of the chip, with this datapoint's bucket at full opacity and every
 * other bar dimmed (cluster-item choreography via use-hover-grow-card).
 * Binary distributions get no hover: a 0/1 bar pair says nothing about where
 * one row sits that the chip value doesn't already say.
 */
export default function RowScoreChip({ name, value, statistics, distribution }: RowScoreChipProps) {
  const hasValue = isValidNumber(value);
  const hoverable = hasValue && !!distribution?.length && !isBinaryDistribution(distribution);

  const { triggerRef, hovered, rect, handleMouseEnter, scheduleClose, closeImmediately } =
    useHoverGrowCard<HTMLDivElement>();

  return (
    <>
      <div
        ref={triggerRef}
        onWheel={hoverable ? closeImmediately : undefined}
        onMouseEnter={hoverable ? handleMouseEnter : undefined}
        onMouseLeave={hoverable ? scheduleClose : undefined}
        className="flex items-baseline gap-1.5 rounded-md border bg-secondary px-2 py-1 text-xs"
        title={name}
      >
        <span className="text-muted-foreground">{name}</span>
        <span className="font-medium tabular-nums">{hasValue ? fmt(value) : "—"}</span>
      </div>

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
                    <HistogramCard
                      name={name}
                      statistics={statistics}
                      distribution={distribution}
                      highlightValue={value}
                    />
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
