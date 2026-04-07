"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { format, formatDuration, intervalToDuration } from "date-fns";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type TraceTimelineItem } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

interface TracesTimelineProps {
  traces: TraceTimelineItem[];
  sessionStartTime: string;
  sessionEndTime: string;
  onTraceClick?: (traceId: string) => void;
}

const MIN_TRACE_FLEX = 0.01;
const MIN_GAP_FLEX = 0.005;

function formatTimeLabel(date: Date): string {
  return format(date, "MMM d, HH:mm");
}

function formatTraceDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const duration = intervalToDuration({ start: 0, end: Math.round(ms / 1000) * 1000 });
  return formatDuration(duration, { format: ["hours", "minutes", "seconds"], delimiter: " ", zero: false })
    .replace(/ hours?/, "h")
    .replace(/ minutes?/, "m")
    .replace(/ seconds?/, "s");
}

type Segment =
  | { type: "gap"; flex: number }
  | { type: "trace"; flex: number; trace: TraceTimelineItem; durationMs: number };

export default function TracesTimeline({
  traces,
  sessionStartTime,
  sessionEndTime,
  onTraceClick,
}: TracesTimelineProps) {
  const sessionStart = new Date(sessionStartTime).getTime();
  const sessionEnd = new Date(sessionEndTime).getTime();
  const totalSpan = Math.max(sessionEnd - sessionStart, 1);

  const segments: Segment[] = [];
  const sorted = [...traces].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  let cursor = sessionStart;
  for (const trace of sorted) {
    const traceStart = new Date(trace.startTime).getTime();
    const traceEnd = new Date(trace.endTime).getTime();

    const gapFlex = (traceStart - cursor) / totalSpan;
    if (traceStart > cursor && gapFlex >= MIN_GAP_FLEX) {
      segments.push({ type: "gap", flex: gapFlex });
    }

    const duration = Math.max(traceEnd - traceStart, 1);
    segments.push({
      type: "trace",
      flex: Math.max(duration / totalSpan, MIN_TRACE_FLEX),
      trace,
      durationMs: duration,
    });

    cursor = Math.max(cursor, traceEnd);
  }

  const trailingGap = (sessionEnd - cursor) / totalSpan;
  if (cursor < sessionEnd && trailingGap >= MIN_GAP_FLEX) {
    segments.push({ type: "gap", flex: trailingGap });
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="bg-muted/50 flex flex-1 gap-1 items-center min-w-0 p-0.5 rounded-[2px]">
        {segments.map((seg, i) =>
          seg.type === "gap" ? (
            <div key={i} style={{ flex: seg.flex }} className="h-1.5 min-w-0" />
          ) : (
            <Tooltip key={seg.trace.id}>
              <TooltipTrigger asChild>
                <div
                  style={{ flex: seg.flex }}
                  className={cn("h-1.5 min-w-0 rounded-[2px]", {
                    "bg-success-bright": seg.trace.status !== "error",
                    "bg-destructive-bright": seg.trace.status === "error",
                    "cursor-pointer hover:brightness-125": onTraceClick,
                  })}
                  onClick={
                    seg.trace.id && onTraceClick
                      ? (e) => {
                          e.stopPropagation();
                          onTraceClick(seg.trace.id);
                        }
                      : undefined
                  }
                />
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent side="top" className="border text-xs">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <div
                        className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          seg.trace.status === "error" ? "bg-destructive-bright" : "bg-success-bright"
                        )}
                      />
                      <span className="font-medium text-[11px] truncate max-w-48">
                        {seg.trace.name || seg.trace.id.slice(0, 8)}
                      </span>
                    </div>
                    <span className="text-muted-foreground">
                      {formatTimeLabel(new Date(seg.trace.startTime))} · {formatTraceDuration(seg.durationMs)}
                    </span>
                  </div>
                </TooltipContent>
              </TooltipPortal>
            </Tooltip>
          )
        )}
      </div>
    </TooltipProvider>
  );
}
