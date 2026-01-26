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
    transition: { duration: 0.3, ease: "easeInOut" },
  },
  reader: {
    width: 0,
    opacity: 0,
    transition: { duration: 0.3, ease: "easeInOut" },
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
              <div
                className="absolute border-l-2 border-b-2 rounded-bl-md border-landing-surface-400"
                style={{
                  height: ROW_HEIGHT / 2,
                  left: TREE_LINE_LEFT_BASE,
                  width: TREE_LINE_WIDTH,
                }}
              />
            )}

            {/* Vertical continuation line if more siblings at this depth */}
            {branchMask[d] && (
              <div
                className="absolute h-full border-l-2 border-landing-surface-400"
                style={{ left: TREE_LINE_LEFT_BASE }}
              />
            )}
          </motion.div>
        );
      })}
    </>
  );
}
