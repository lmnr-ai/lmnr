import { memo } from "react";

import { StatsShields } from "@/components/traces/stats-shields";
import { agentInputText } from "@/lib/traces/agent-input";
import { type TraceRow } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import { useTurnDetails } from "../data/use-turn-details";
import { useOpenTrace } from "../use-open-trace";
import TurnReply from "./turn-reply";
import UserBubble from "./user-bubble";
import WorkedRow from "./worked-row";

/** One trace rendered as a chat exchange: user bubble → work summary → assistant reply. */
function Turn({
  trace,
  live,
  dividerAbove,
  dividerBelow,
}: {
  trace: TraceRow;
  /** Still receiving updates, so its reply and counts aren't final. */
  live: boolean;
  dividerAbove: boolean;
  dividerBelow: boolean;
}) {
  const { reply, retryReply, counts } = useTurnDetails(trace, live);
  const { openTraceId, toggleTrace } = useOpenTrace();
  const active = openTraceId === trace.id;

  const inputText = agentInputText(trace.agentInput);
  const failed = trace.status === "error" || (counts?.errors ?? 0) > 0;

  return (
    // Full-bleed row so the selected background spans the thread; content keeps the column width.
    <div
      className={cn(
        "group/turn w-full transition-colors",
        // Extra room beside a time divider so its pill doesn't crowd the turn.
        dividerAbove ? "pt-9" : "pt-6",
        dividerBelow ? "pb-9" : "pb-6",
        active && "bg-emphasis-0.5"
      )}
      data-trace-id={trace.id}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-8">
        {inputText && <UserBubble text={inputText} time={trace.startTime} />}
        <WorkedRow counts={counts} open={active} onClick={() => toggleTrace(trace.id)} />
        <TurnReply reply={reply} turnFailed={failed} onRetry={retryReply} />
        <StatsShields
          stats={trace}
          className="h-auto w-fit rounded-none bg-transparent px-0 text-xs text-secondary-foreground"
        />
      </div>
    </div>
  );
}

export default memo(Turn);
