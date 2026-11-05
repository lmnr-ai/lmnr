import { Bolt, ChevronRight, CircleAlert, MessageCircle } from "lucide-react";

import { StatsShields } from "@/components/traces/stats-shields";
import { Skeleton } from "@/components/ui/skeleton";
import { type TraceSpanCounts } from "@/lib/actions/traces/span-counts";
import { type TraceRow } from "@/lib/traces/types";

interface WorkedRowProps {
  trace: TraceRow;
  counts?: TraceSpanCounts;
  /** False when the duration/tokens/cost shields render under the reply instead. */
  showStats: boolean;
  onClick: () => void;
}

/** Turn summary: trace stats + LLM/tool/error counts; opens the trace panel. */
export default function WorkedRow({ trace, counts, showStats, onClick }: WorkedRowProps) {
  return (
    // div, not button: StatsShields renders tooltip-trigger buttons, which can't nest in a button.
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick())}
      className="-ml-2 flex w-fit shrink-0 cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-md px-2 py-1 text-xs text-secondary-foreground hover:bg-emphasis-0.5 active:bg-emphasis-0.5"
    >
      {showStats && <StatsShields stats={trace} className="h-auto rounded-none bg-transparent px-0" />}
      {counts ? (
        <span className="flex items-center gap-2.5">
          <span className="flex items-center gap-1" title="LLM calls">
            <MessageCircle className="size-3.5 text-[var(--purple-icon-background)]" />
            {counts.llm}
          </span>
          {counts.tool > 0 && (
            <span className="flex items-center gap-1" title="Tool calls">
              <Bolt className="size-3.5 text-[var(--yellow-icon-background)]" />
              {counts.tool}
            </span>
          )}
          {counts.errors > 0 && (
            <span className="flex items-center gap-1 text-destructive-text" title="Errors">
              <CircleAlert className="size-3.5" />
              {counts.errors}
            </span>
          )}
        </span>
      ) : (
        <Skeleton className="h-3.5 w-16" />
      )}
      <span className="-ml-1 flex items-center transition-all delay-100 duration-200 group-hover/turn:pl-1.5">
        {/* 0fr → 1fr grid column: the label slides open at its natural width, pushing the chevron right. */}
        <span className="grid grid-cols-[0fr] opacity-0 transition-all delay-100 duration-200 group-hover/turn:grid-cols-[1fr] group-hover/turn:opacity-100">
          <span className="overflow-hidden pr-1">Open trace</span>
        </span>
        <ChevronRight className="size-3.5" />
      </span>
    </div>
  );
}
