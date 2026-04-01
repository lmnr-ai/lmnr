import { ChevronRightIcon } from "lucide-react";

import CopyTooltip from "@/components/ui/copy-tooltip";
import { type SessionRow as SessionRowType, type TraceTimelineItem } from "@/lib/traces/types";
import { cn, formatRelativeTime } from "@/lib/utils";

import TotalsPill from "./totals-pill";
import TracesTimeline from "./traces-timeline";

interface SessionRowProps {
  session: SessionRowType;
  timeline?: TraceTimelineItem[];
  isExpanded: boolean;
  onToggle: () => void;
  onTraceClick?: (traceId: string) => void;
}

export default function SessionRow({ session, timeline, isExpanded, onToggle, onTraceClick }: SessionRowProps) {
  return (
    <div
      className="bg-secondary border-x border-b flex h-9 items-center w-full cursor-pointer hover:bg-muted"
      onClick={onToggle}
    >
      {/* Chevron */}
      <button
        className="flex items-center justify-center shrink-0 w-10 h-full"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <ChevronRightIcon
          className={cn("w-4 h-4 text-secondary-foreground transition-transform duration-150", {
            "rotate-90": isExpanded,
          })}
        />
      </button>

      {/* Start time */}
      <div className="flex items-center px-4 py-0.5 shrink-0 w-[120px]">
        <span className="text-xs text-secondary-foreground truncate">{formatRelativeTime(session.startTime)}</span>
      </div>

      {/* Session ID */}
      <div className="flex items-center px-4 py-0.5 shrink-0 w-[189px]" onClick={(e) => e.stopPropagation()}>
        <CopyTooltip value={session.sessionId}>
          <span className="text-xs text-primary-foreground truncate block" title={session.sessionId}>
            {session.sessionId}
          </span>
        </CopyTooltip>
      </div>

      {/* Totals pill */}
      <div className="flex items-center px-4 py-0.5 shrink-0 w-60">
        <TotalsPill duration={session.duration} totalTokens={session.totalTokens} totalCost={session.totalCost} />
      </div>

      {/* Traces count + timeline */}
      <div className="flex flex-1 gap-4 h-full items-center min-w-0 px-4 py-0.5">
        <span className="text-xs text-secondary-foreground whitespace-nowrap">{session.traceCount ?? 0}</span>
        {timeline && timeline.length > 0 && (
          <TracesTimeline
            traces={timeline}
            sessionStartTime={session.startTime}
            sessionEndTime={session.endTime}
            onTraceClick={onTraceClick}
          />
        )}
      </div>
    </div>
  );
}
