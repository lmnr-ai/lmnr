import { Check, X } from "lucide-react";

import { cn } from "@/lib/utils";

import WarningMark from "../../warning-mark";
import { BOX_CELLS } from "./geometry";

interface CellProps {
  index: number;
}

const EVAL_RESULTS = [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1] as const;

// ~60% muted, the rest split evenly across the Figma accents (minus its #2e2e2e,
// which would vanish against the cell).
const MUTED_SHARE = 0.6;
const MUTED_COLOR = "var(--color-foreground-500)";
const ISSUE_ACCENTS = ["#fddb08", "#a789f2", "#f59ed5", "#f78079", "#26ae6c", "#4685e7"] as const;

// Deterministic shuffle (server and client agree): the first ~60% of the order
// stay muted, the rest cycle through the accents so each gets an even share.
const scatter = (index: number) => {
  let hash = Math.imul(index, 0x9e3779b1) ^ 0x51f15e;
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
};

const ISSUE_COLOR_BY_CELL = (() => {
  const total = BOX_CELLS.issues;
  const mutedCount = Math.round(total * MUTED_SHARE);
  const order = Array.from({ length: total }, (_, index) => index).sort((a, b) => scatter(a) - scatter(b));
  const colors: string[] = [];
  order.forEach((cell, rank) => {
    colors[cell] = rank < mutedCount ? MUTED_COLOR : ISSUE_ACCENTS[(rank - mutedCount) % ISSUE_ACCENTS.length];
  });
  return colors;
})();

const cellClass = "flex size-full items-center justify-center";

export const TraceCell = (_props: CellProps) => (
  <div className={cn(cellClass, "bg-surface-550")}>
    <span className="size-[3px] rounded-full bg-[#808080]" />
  </div>
);

// Muted issues sit on the same darker cell as failed evals.
export const IssueCell = ({ index }: CellProps) => {
  const color = ISSUE_COLOR_BY_CELL[index];
  const muted = color === MUTED_COLOR;

  return (
    <div className={cn(cellClass, muted ? "bg-surface-500" : "bg-surface-550")}>
      <WarningMark color={color} markColor={muted ? "var(--color-surface-500)" : "var(--color-surface-550)"} />
    </div>
  );
};

export const EvalCell = ({ index }: CellProps) => {
  const passed = EVAL_RESULTS[index % EVAL_RESULTS.length] === 1;
  const Icon = passed ? Check : X;

  return (
    <div className={cn(cellClass, passed ? "bg-surface-550" : "bg-surface-500")}>
      <Icon
        aria-hidden="true"
        className={cn("size-[10px]", passed ? "text-[#1B845E]" : "text-[#DA495A]")}
        strokeWidth={1.5}
        absoluteStrokeWidth
      />
    </div>
  );
};
