import Image from "next/image";

import check from "@/assets/landing/hero/eval-check.svg";
import x from "@/assets/landing/hero/eval-x.svg";
import issueBright from "@/assets/landing/hero/issue-warning-bright.svg";
import issueDim from "@/assets/landing/hero/issue-warning-dim.svg";
import { cn } from "@/lib/utils";

interface CellProps {
  index: number;
}

const EVAL_RESULTS = [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1] as const;

// First 21 follow the Figma issues strip; the rest continue the same irregular mix.
const ISSUE_BRIGHT = [
  0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1,
  1, 0,
] as const;

const cellClass = "flex size-full items-center justify-center";

export const TraceCell = (_props: CellProps) => (
  <div className={cn(cellClass, "bg-surface-350")}>
    <span className="size-[3px] rounded-full bg-[#808080]" />
  </div>
);

export const IssueCell = ({ index }: CellProps) => (
  <div className={cn(cellClass, "bg-surface-350")}>
    <Image
      src={ISSUE_BRIGHT[index % ISSUE_BRIGHT.length] ? issueBright : issueDim}
      alt=""
      className="h-[9.29px] w-[10px]"
    />
  </div>
);

export const EvalCell = ({ index }: CellProps) => {
  const passed = EVAL_RESULTS[index % EVAL_RESULTS.length] === 1;

  return (
    <div className={cn(cellClass, passed ? "bg-surface-350" : "bg-surface-300")}>
      <Image src={passed ? check : x} alt="" className="size-[10px]" />
    </div>
  );
};
