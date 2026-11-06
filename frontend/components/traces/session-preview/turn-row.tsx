import { memo } from "react";

import { StatsShields } from "@/components/traces/stats-shields";
import { agentInputText } from "@/lib/traces/agent-input";
import { type TraceRow } from "@/lib/traces/types";
import { cn, formatTimestamp } from "@/lib/utils";

interface TurnRowProps {
  trace: TraceRow;
  current: boolean;
  onSelect: (traceId: string) => void;
}

/** One turn in the session preview: its user input, then when it ran and its stats pills. */
function TurnRow({ trace, current, onSelect }: TurnRowProps) {
  const input = agentInputText(trace.agentInput);
  const failed = trace.status === "error";

  return (
    // div, not button: StatsShields renders tooltip-trigger buttons, which can't nest in a button.
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(trace.id)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(trace.id))}
      className={cn(
        "flex w-full cursor-pointer flex-col gap-1 border-l-2 px-3 py-2 text-left text-xs",
        // Same selected treatment as the trace view's transcript and tree.
        current ? "border-l-primary bg-primary/15 hover:bg-primary/20" : "border-l-transparent hover:bg-emphasis-0.5"
      )}
    >
      <span className={cn("line-clamp-2 break-words", !input && "text-muted-foreground italic")}>
        {input || "No input"}
      </span>
      <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
        {formatTimestamp(trace.startTime)}
        <StatsShields
          stats={trace}
          // The pills hard-code text-xs and 14px icons; scale them to this row's 11px meta line.
          className="h-auto w-fit gap-2 rounded-none bg-transparent px-0 text-[11px] [&_label]:text-[11px] [&_label]:text-muted-foreground [&_svg]:size-3"
        />
        {failed && <span className="text-destructive-text">error</span>}
      </span>
    </div>
  );
}

export default memo(TurnRow);
