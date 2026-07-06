"use client";

import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";

import HistoryCard, { type RunPoint } from "@/components/evaluation/row-score-chips/history-card";
import { useHoverGrowCard } from "@/components/evaluation/row-score-chips/use-hover-grow-card";
import { isValidNumber } from "@/lib/utils";

interface RowScoreChipProps {
  name: string;
  /** This datapoint's value for the score, not an aggregate. */
  value?: number;
  /** This datapoint's value per run in the group, oldest first. */
  points: RunPoint[];
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });
const CARD_WIDTH = 340;

/**
 * One selected-row score chip. Hover grows the run-history line card out of
 * the chip (cluster-item choreography via use-hover-grow-card): this
 * datapoint's value across previous runs, current run emphasized. No hover
 * when the datapoint exists in fewer than two runs — there is no history.
 */
export default function RowScoreChip({ name, value, points }: RowScoreChipProps) {
  const hasValue = isValidNumber(value);
  const hoverable = points.filter((p) => p.value !== null).length >= 2;

  const { triggerRef, hovered, rect, handleMouseEnter, scheduleClose, closeImmediately } =
    useHoverGrowCard<HTMLDivElement>(CARD_WIDTH);

  return (
    <>
      <div
        ref={triggerRef}
        onWheel={hoverable ? closeImmediately : undefined}
        onMouseEnter={hoverable ? handleMouseEnter : undefined}
        onMouseLeave={hoverable ? scheduleClose : undefined}
        className="flex items-baseline gap-1.5 rounded-md border bg-secondary px-2 py-1 text-xs"
      >
        <span className="text-muted-foreground">{name}</span>
        <span className="font-medium tabular-nums">{hasValue ? fmt(value) : "—"}</span>
      </div>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {hovered && rect && (
              <motion.div
                onMouseEnter={handleMouseEnter}
                onMouseLeave={scheduleClose}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.15 } }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                className="fixed z-50"
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
                    <HistoryCard name={name} points={points} />
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
