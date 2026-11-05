import { Bolt, ChevronRight, CircleAlert, MessageCircle } from "lucide-react";

import { StatsShields } from "@/components/traces/stats-shields";
import { Skeleton } from "@/components/ui/skeleton";
import { type TraceRow } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import { type TurnCounts } from "../format";

interface WorkedRowProps {
  trace: TraceRow;
  counts?: TurnCounts;
  active: boolean;
  onClick: () => void;
}

/** Turn summary: trace stats + LLM/tool/error counts; opens the trace panel. */
export default function WorkedRow({ trace, counts, active, onClick }: WorkedRowProps) {
  return (
    // div, not button: StatsShields renders tooltip-trigger buttons, which can't nest in a button.
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick())}
      className={cn(
        "group -ml-2 flex w-fit shrink-0 cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-md px-2 py-1 text-xs text-secondary-foreground hover:bg-secondary",
        active && "bg-secondary"
      )}
    >
      <StatsShields stats={trace} className="h-auto rounded-none bg-transparent px-0" />
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
      <ChevronRight className={cn("-ml-1 size-3.5 transition-transform", active && "rotate-180")} />
    </div>
  );
}
