"use client";

import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

const ROW_HEIGHT = 28;
const TREE_GUTTER_WIDTH = 16;
const TREE_LINE_LEFT_BASE = 9;
const TREE_LINE_WIDTH = TREE_GUTTER_WIDTH - TREE_LINE_LEFT_BASE;

interface BranchConnectorProps {
  depth: number;
  branchMask: boolean[];
  mode: "tree" | "reader";
}

const connectorVariants = {
  tree: {
    width: TREE_GUTTER_WIDTH,
    opacity: 1,
    transition: { duration: 0.6, ease: "easeInOut" },
  },
  reader: {
    width: 0,
    opacity: 0,
    transition: { duration: 1.2, ease: "easeInOut" },
  },
};

const lineVariants = {
  tree: {
    borderColor: "var(--color-landing-surface-400)",
    transition: { duration: 0.6, ease: "easeInOut" },
  },
  reader: {
    borderColor: "var(--color-landing-text-600)",
    transition: { duration: 1.2, ease: "easeInOut" },
  },
};

export function BranchConnector({ depth, branchMask, mode }: BranchConnectorProps) {
  return (
    <>
      {Array.from({ length: depth }).map((_, d) => {
        const isLastColumn = d === depth - 1;

        return (
          <motion.div
            key={d}
            className={cn("shrink-0 relative overflow-hidden")}
            variants={connectorVariants}
            animate={mode}
            initial={false}
          >
            {/* L-connector for the last column */}
            {isLastColumn && (
              <motion.div
                className="absolute border-l-2 border-b-2 rounded-bl-md"
                style={{
                  height: ROW_HEIGHT / 2,
                  left: TREE_LINE_LEFT_BASE,
                  width: TREE_LINE_WIDTH,
                }}
                variants={lineVariants}
                animate={mode}
                initial={false}
              />
            )}

            {/* Vertical continuation line if more siblings at this depth */}
            {branchMask[d] && (
              <motion.div
                className="absolute h-full border-l-2"
                style={{ left: TREE_LINE_LEFT_BASE }}
                variants={lineVariants}
                animate={mode}
                initial={false}
              />
            )}
          </motion.div>
        );
      })}
    </>
  );
}
