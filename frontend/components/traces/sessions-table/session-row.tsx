import { ChevronRightIcon } from "lucide-react";

import CopyTooltip from "@/components/ui/copy-tooltip";
import { type SessionRow as SessionRowType } from "@/lib/traces/types";
import { formatDuration } from "@/lib/traces/utils";
import { cn } from "@/lib/utils";

import {
  CHEVRON_COLUMN_WIDTH_CLASSNAME,
  COST_COLUMN_WIDTH_CLASSNAME,
  COUNT_COLUMN_WIDTH_CLASSNAME,
  DURATION_COLUMN_WIDTH_CLASSNAME,
  SESSION_ID_COLUMN_WIDTH_CLASSNAME,
  TIME_RANGE_COLUMN_WIDTH_CLASSNAME,
  TOKENS_COLUMN_WIDTH_CLASSNAME,
} from "./session-table-header";
import SessionTimeRange from "./session-time-range";

const compactNumberFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
});

interface SessionRowProps {
  session: SessionRowType;
  isExpanded: boolean;
  isLast?: boolean;
  onToggle: () => void;
  /** Click on the body of the row (everything except the chevron). Opens the
   *  session view side panel in the current route. */
  onOpen?: () => void;
}

export default function SessionRow({ session, isExpanded, isLast, onToggle, onOpen }: SessionRowProps) {
  return (
    <div
      className={cn(
        "bg-secondary border-b flex h-10.5 items-center w-full cursor-pointer hover:bg-muted",
        isLast && "border-b-0"
      )}
      onClick={onOpen}
    >
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

      <div className={`flex items-center px-4 py-0.5 shrink-0 ${TIME_RANGE_COLUMN_WIDTH_CLASSNAME}`}>
        <SessionTimeRange startTime={session.startTime} endTime={session.endTime} />
      </div>

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

      <div className={`flex items-center px-4 py-0.5 shrink-0 ${DURATION_COLUMN_WIDTH_CLASSNAME}`}>
        <span className="text-sm tabular-nums">{formatDuration(session.duration ?? 0)}</span>
      </div>

      <div className={`flex items-center px-4 py-0.5 shrink-0 ${TOKENS_COLUMN_WIDTH_CLASSNAME}`}>
        <span className="text-sm tabular-nums">{compactNumberFormat.format(session.totalTokens ?? 0)}</span>
      </div>

      <div className={`flex items-center px-4 py-0.5 shrink-0 ${COST_COLUMN_WIDTH_CLASSNAME}`}>
        <span className="text-sm tabular-nums">${(session.totalCost ?? 0).toFixed(2)}</span>
      </div>

      <div className={`flex items-center px-4 py-0.5 shrink-0 ${COUNT_COLUMN_WIDTH_CLASSNAME}`}>
        <span className="text-sm tabular-nums">{session.traceCount ?? 0}</span>
      </div>

      <div className="flex-1 min-w-0" />
    </div>
  );
}
