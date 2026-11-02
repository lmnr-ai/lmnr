import { cn } from "@/lib/utils";

import { BOX_CELLS, CELL, type Rect } from "./geometry";
import WarningMark from "./warning-mark";

// ~60% muted, the rest split across the landing accents.
const MUTED_SHARE = 0.6;
const MUTED_COLOR = "var(--color-foreground-500)";
const ISSUE_ACCENTS = ["#fddb08", "#a789f2", "#f59ed5", "#f78079", "#26ae6c", "#4685e7"] as const;

// Deterministic shuffle so server and client agree on which cells get an accent.
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

const TraceCell = () => (
  <div className={cn(cellClass, "bg-surface-550")}>
    <span className="size-[3px] rounded-full bg-[#808080]" />
  </div>
);

const IssueCell = ({ index }: { index: number }) => {
  const color = ISSUE_COLOR_BY_CELL[index];
  const muted = color === MUTED_COLOR;
  return (
    <div className={cn(cellClass, muted ? "bg-surface-500" : "bg-surface-550")}>
      <WarningMark color={color} markColor={muted ? "var(--color-surface-500)" : "var(--color-surface-550)"} />
    </div>
  );
};

interface CellBoxProps {
  rect: Rect;
  kind: "traces" | "issues";
  /** Fractional count of cells filled so far. */
  count: number;
  opacity: number;
}

export const CellBox = ({ rect, kind, count, opacity }: CellBoxProps) => (
  <div
    className="absolute flex flex-wrap content-start bg-surface-550"
    style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, opacity }}
  >
    {Array.from({ length: BOX_CELLS[kind] }, (_, index) => (
      <div
        key={index}
        className="border-r border-b border-surface-500"
        style={{ width: CELL, height: CELL, opacity: Math.max(0, Math.min(1, count - index)) }}
      >
        {kind === "traces" ? <TraceCell /> : <IssueCell index={index} />}
      </div>
    ))}
  </div>
);
