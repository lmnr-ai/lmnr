import { ChevronRightIcon } from "lucide-react";

import CopyTooltip from "@/components/ui/copy-tooltip";
import { type SessionRow as SessionRowType, type TraceTimelineItem } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import {
  CHEVRON_COLUMN_WIDTH_CLASSNAME,
  SESSION_ID_COLUMN_WIDTH_CLASSNAME,
  TIME_RANGE_COLUMN_WIDTH_CLASSNAME,
  TOTALS_COLUMN_WIDTH_CLASSNAME,
} from "./session-table-header";
import SessionTimeRange from "./session-time-range";
import TotalsPill from "./totals-pill";
import TracesTimeline from "./traces-timeline";

interface SessionRowProps {
  session: SessionRowType;
  timeline?: TraceTimelineItem[];
  isExpanded: boolean;
  isLast?: boolean;
  onToggle: () => void;
}

export default function SessionRow({ session, timeline, isExpanded, isLast, onToggle }: SessionRowProps) {
  return (
    <div
      className={cn(
        "bg-secondary border-b flex h-11 items-center w-full cursor-pointer hover:bg-muted",
        isLast && "border-b-0"
      )}
      onClick={onToggle}
    >
      {/* Chevron */}
      <button
        className={`flex items-center justify-center shrink-0 ${CHEVRON_COLUMN_WIDTH_CLASSNAME} h-full`}
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

      {/* Time range */}
      <div className={`flex items-center px-4 py-0.5 shrink-0 ${TIME_RANGE_COLUMN_WIDTH_CLASSNAME}`}>
        <SessionTimeRange startTime={session.startTime} endTime={session.endTime} />
      </div>

      {/* Session ID */}
      <div
        className={`flex items-center px-4 py-0.5 shrink-0 ${SESSION_ID_COLUMN_WIDTH_CLASSNAME}`}
        onClick={(e) => e.stopPropagation()}
      >
        <CopyTooltip className="truncate" value={session.sessionId}>
          <span className="text-sm text-primary-foreground truncate block" title={session.sessionId}>
            {session.sessionId}
          </span>
        </CopyTooltip>
      </div>

      {/* Totals pill */}
      <div className={`flex items-center px-4 py-0.5 shrink-0 ${TOTALS_COLUMN_WIDTH_CLASSNAME}`}>
        <TotalsPill duration={session.duration} totalTokens={session.totalTokens} totalCost={session.totalCost} />
      </div>

      {/* Traces overview */}
      <div className="flex flex-1 h-full items-center min-w-0 overflow-hidden px-4 py-0.5">
        {timeline && timeline.length > 0 ? (
          <TracesTimeline traces={timeline} />
        ) : (
          <span className="text-xs text-secondary-foreground whitespace-nowrap">{session.traceCount ?? 0}</span>
        )}
      </div>
    </div>
  );
}
