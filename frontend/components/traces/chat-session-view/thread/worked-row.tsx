import { Bolt, ChevronRight, CircleAlert, MessageCircle } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { type TraceSpanCounts } from "@/lib/actions/traces/span-counts";

interface WorkedRowProps {
  counts?: TraceSpanCounts;
  onClick: () => void;
}

/** Turn summary: LLM/tool/error counts; opens the trace panel. */
export default function WorkedRow({ counts, onClick }: WorkedRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-2 flex w-fit shrink-0 cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-md px-2 py-1 text-xs text-secondary-foreground hover:bg-emphasis-0.5 active:bg-emphasis-0.5"
    >
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
    </button>
  );
}
