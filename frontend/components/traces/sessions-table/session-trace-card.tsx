import { CircleDollarSign, Clock3, Coins } from "lucide-react";

import CopyTooltip from "@/components/ui/copy-tooltip";
import { type TraceRow } from "@/lib/traces/types";
import { cn, formatRelativeTime, getDurationString } from "@/lib/utils";

const compactNumberFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
});

const PLACEHOLDER_TEXT =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore " +
  "et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut " +
  "aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse " +
  "cillum dolore eu fugiat nulla pariatur.\n\n" +
  "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est " +
  "laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque " +
  "laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto " +
  "beatae vitae dicta sunt explicabo.\n\n" +
  "Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur " +
  "magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum " +
  "quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut " +
  "labore et dolore magnam aliquam quaerat voluptatem.";

interface SessionTraceCardProps {
  trace: TraceRow;
  isFirst: boolean;
  isLast: boolean;
  onClick?: () => void;
}

export default function SessionTraceCard({ trace, isFirst, isLast, onClick }: SessionTraceCardProps) {
  return (
    <div
      className={cn("flex w-full px-6 cursor-pointer pb-2", {
        "pb-6 border-b": isLast,
      })}
    >
      <div
        className="bg-secondary border rounded flex items-start overflow-clip w-full h-[140px] hover:border-muted-foreground/50"
        onClick={onClick}
      >
        {/* Details column */}
        <div className="flex flex-col h-full justify-between px-4 py-3 shrink-0 w-40">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-secondary-foreground leading-4">{formatRelativeTime(trace.startTime)}</span>
            <CopyTooltip value={trace.id}>
              <span className="text-xs text-primary-foreground leading-4 truncate block" title={trace.id}>
                {trace.id}
              </span>
            </CopyTooltip>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex gap-1 h-4 items-center">
              <Clock3 size={12} className="shrink-0 text-muted-foreground" />
              <span className="font-mono text-xs text-muted-foreground whitespace-nowrap leading-4">
                {getDurationString(trace.startTime, trace.endTime)}
              </span>
            </div>
            <div className="flex gap-1 h-4 items-center">
              <Coins size={12} className="shrink-0 text-muted-foreground" />
              <span className="font-mono text-xs text-muted-foreground whitespace-nowrap leading-4">
                {compactNumberFormat.format(trace.totalTokens)}
              </span>
            </div>
            <div className="flex gap-1 h-4 items-center">
              <CircleDollarSign size={12} className="shrink-0 text-muted-foreground" />
              <span className="font-mono text-xs text-muted-foreground whitespace-nowrap leading-4">
                {(trace.totalCost ?? 0).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Input column */}
        <div className="bg-muted/50 border-l flex-1 h-full min-w-0 overflow-hidden relative">
          <div className="h-full overflow-y-auto px-3 py-2">
            {/* TODO: Replace placeholder with actual trace input data */}
            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-4">{PLACEHOLDER_TEXT}</p>
          </div>
          <div className="absolute bg-gradient-to-b bottom-0 from-transparent to-muted/50 h-12 left-0 right-0 pointer-events-none" />
        </div>

        {/* Output column */}
        <div className="bg-muted/50 border-l flex-1 h-full min-w-0 overflow-hidden relative">
          <div className="h-full overflow-y-auto px-3 py-2">
            {/* TODO: Replace placeholder with actual trace output data */}
            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-4">{PLACEHOLDER_TEXT}</p>
          </div>
          <div className="absolute bg-gradient-to-b bottom-0 from-transparent to-muted/50 h-12 left-0 right-0 pointer-events-none" />
        </div>
      </div>
    </div>
  );
}
