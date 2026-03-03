"use client";

import { diffWords } from "diff";
import { useMemo } from "react";

import { formatOutput } from "@/components/traces/trace-view/list/markdown";
import { cn } from "@/lib/utils";

import SpanCell from "./span-cell";
import { type DiffRow } from "./trace-diff-types";

const VoidCell = ({ className }: { className?: string }) => (
  <div className={cn("h-full min-h-[40px] rounded-sm", className)} />
);

interface DiffSpanRowProps {
  row: DiffRow;
  index: number;
  isSelected: boolean;
  onClick: (index: number) => void;
  leftOutput: unknown;
  rightOutput: unknown;
}

const DiffSpanRow = ({ row, index, isSelected, onClick, leftOutput, rightOutput }: DiffSpanRowProps) => {
  const diffChanges = useMemo(() => {
    if (row.type !== "matched") return undefined;
    if (leftOutput === undefined || rightOutput === undefined) return undefined;
    const leftStr = formatOutput(leftOutput);
    const rightStr = formatOutput(rightOutput);
    if (leftStr === rightStr) return undefined;
    return diffWords(leftStr, rightStr);
  }, [row.type, leftOutput, rightOutput]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(index)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick(index);
      }}
      className="group/row flex w-full gap-2 transition-colors cursor-pointer text-left pb-0.5"
    >
      <div
        className={cn(
          "flex-1 min-w-0 rounded-sm transition-colors",
          row.type !== "right-only" && (isSelected ? "bg-primary/10" : "bg-secondary group-hover/row:bg-secondary/80")
        )}
      >
        {row.type === "right-only" ? (
          <VoidCell />
        ) : (
          <SpanCell span={row.left} output={leftOutput} diffSide="left" diffChanges={diffChanges} />
        )}
      </div>
      <div
        className={cn(
          "flex-1 min-w-0 rounded-sm transition-colors",
          row.type !== "left-only" && (isSelected ? "bg-primary/10" : "bg-secondary group-hover/row:bg-secondary/80")
        )}
      >
        {row.type === "left-only" ? (
          <VoidCell />
        ) : (
          <SpanCell span={row.right} output={rightOutput} diffSide="right" diffChanges={diffChanges} />
        )}
      </div>
    </div>
  );
};

export default DiffSpanRow;
