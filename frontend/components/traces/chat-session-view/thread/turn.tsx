import { CircleAlert } from "lucide-react";
import { memo } from "react";

import { useSessionViewStore } from "@/components/traces/session-view/store";
import { StatsShields } from "@/components/traces/stats-shields";
import { Skeleton } from "@/components/ui/skeleton";
import { type TraceRow } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import { useChatViewStore } from "../store";
import { useTurnDataStore } from "../turn-data";
import CollapsibleReply from "./collapsible-reply";
import UserBubble from "./user-bubble";
import WorkedRow from "./worked-row";

/** One trace rendered as a chat exchange: user bubble → work summary → assistant reply. */
function Turn({
  trace,
  dividerAbove,
  dividerBelow,
}: {
  trace: TraceRow;
  dividerAbove: boolean;
  dividerBelow: boolean;
}) {
  const output = useSessionViewStore((s) => s.agentOutputs[trace.id]);
  const active = useChatViewStore((s) => s.openTraceId === trace.id);
  const toggleTrace = useChatViewStore((s) => s.toggleTrace);
  const statsBelow = useChatViewStore((s) => s.statsPosition === "below");

  const counts = useTurnDataStore((s) => s.counts[trace.id]);
  const failed = trace.status === "error" || (counts?.errors ?? 0) > 0;

  return (
    // Full-bleed row so the selected background spans the thread; content keeps the column width.
    <div
      className={cn(
        "group/turn w-full transition-colors",
        // Extra room beside a time divider so its pill doesn't crowd the turn.
        dividerAbove ? "pt-9" : "pt-6",
        dividerBelow ? "pb-9" : "pb-6",
        active && "bg-surface-300"
      )}
      data-trace-id={trace.id}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-8">
        {trace.agentInput && <UserBubble text={trace.agentInput} time={trace.startTime} />}
        <WorkedRow trace={trace} counts={counts} showStats={!statsBelow} onClick={() => toggleTrace(trace.id)} />
        {output ? (
          <CollapsibleReply text={output} />
        ) : output === undefined ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {failed && <CircleAlert className="size-4 text-destructive-text" />}
            {failed ? "The agent didn't reply — the turn ended with an error." : "No reply extracted."}
          </div>
        )}
        {statsBelow && (
          <StatsShields
            stats={trace}
            className="h-auto w-fit rounded-none bg-transparent px-0 text-xs text-secondary-foreground"
          />
        )}
      </div>
    </div>
  );
}

export default memo(Turn);
