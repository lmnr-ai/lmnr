import { type TraceTimelineItem } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

interface TracesTimelineProps {
  traces: TraceTimelineItem[];
  sessionStartTime: string;
  sessionEndTime: string;
  onTraceClick?: (traceId: string) => void;
}

// Minimum flex value for trace bars so they remain visible even for very short durations
const MIN_TRACE_FLEX = 0.01;
// Minimum gap flex to show; gaps smaller than this are omitted (back-to-back traces)
const MIN_GAP_FLEX = 0.005;

export default function TracesTimeline({
  traces,
  sessionStartTime,
  sessionEndTime,
  onTraceClick,
}: TracesTimelineProps) {
  const sessionStart = new Date(sessionStartTime).getTime();
  const sessionEnd = new Date(sessionEndTime).getTime();
  const totalSpan = Math.max(sessionEnd - sessionStart, 1);

  // Build segments: alternating gaps and trace bars
  const segments: { type: "gap" | "trace"; flex: number; status?: string; traceId?: string }[] = [];
  const sorted = [...traces].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  let cursor = sessionStart;
  for (const trace of sorted) {
    const traceStart = new Date(trace.startTime).getTime();
    const traceEnd = new Date(trace.endTime).getTime();

    // Gap before this trace -- skip if negligible (back-to-back traces)
    const gapFlex = (traceStart - cursor) / totalSpan;
    if (traceStart > cursor && gapFlex >= MIN_GAP_FLEX) {
      segments.push({ type: "gap", flex: gapFlex });
    }

    // The trace bar itself -- enforce minimum width for very short durations
    const duration = Math.max(traceEnd - traceStart, 1);
    segments.push({
      type: "trace",
      flex: Math.max(duration / totalSpan, MIN_TRACE_FLEX),
      status: trace.status,
      traceId: trace.id,
    });

    cursor = Math.max(cursor, traceEnd);
  }

  // Trailing gap -- skip if negligible
  const trailingGap = (sessionEnd - cursor) / totalSpan;
  if (cursor < sessionEnd && trailingGap >= MIN_GAP_FLEX) {
    segments.push({ type: "gap", flex: trailingGap });
  }

  return (
    <div className="bg-muted/50 flex flex-1 gap-1 items-center min-w-0 p-0.5 rounded-[2px]">
      {segments.map((seg, i) => (
        <div
          key={i}
          style={{ flex: seg.flex }}
          className={cn("h-1.5 min-w-0 rounded-[2px]", {
            "bg-success-bright": seg.type === "trace" && seg.status !== "error",
            "bg-destructive-bright": seg.type === "trace" && seg.status === "error",
            "cursor-pointer hover:brightness-125": seg.type === "trace" && onTraceClick,
          })}
          onClick={
            seg.type === "trace" && seg.traceId && onTraceClick
              ? (e) => {
                  e.stopPropagation();
                  onTraceClick(seg.traceId!);
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}
