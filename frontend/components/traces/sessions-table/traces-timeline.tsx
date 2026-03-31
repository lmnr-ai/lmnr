import { type TraceTimelineItem } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

interface TracesTimelineProps {
  traces: TraceTimelineItem[];
  sessionStartTime: string;
  sessionEndTime: string;
}

export default function TracesTimeline({ traces, sessionStartTime, sessionEndTime }: TracesTimelineProps) {
  const sessionStart = new Date(sessionStartTime).getTime();
  const sessionEnd = new Date(sessionEndTime).getTime();
  const totalSpan = Math.max(sessionEnd - sessionStart, 1);

  // Build segments: alternating gaps and trace bars
  const segments: { type: "gap" | "trace"; flex: number; status?: string }[] = [];
  const sorted = [...traces].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  let cursor = sessionStart;
  for (const trace of sorted) {
    const traceStart = new Date(trace.startTime).getTime();
    const traceEnd = new Date(trace.endTime).getTime();

    // Gap before this trace
    if (traceStart > cursor) {
      segments.push({ type: "gap", flex: (traceStart - cursor) / totalSpan });
    }

    // The trace bar itself
    const duration = Math.max(traceEnd - traceStart, 1);
    segments.push({ type: "trace", flex: duration / totalSpan, status: trace.status });

    cursor = Math.max(cursor, traceEnd);
  }

  // Trailing gap
  if (cursor < sessionEnd) {
    segments.push({ type: "gap", flex: (sessionEnd - cursor) / totalSpan });
  }

  return (
    <div className="bg-[rgba(34,34,38,0.5)] flex flex-1 gap-px items-center min-w-0 p-0.5 rounded">
      {segments.map((seg, i) => (
        <div
          key={i}
          style={{ flex: Math.max(seg.flex, 0.005) }}
          className={cn("h-1.5 min-w-0 rounded-sm", {
            "bg-success-bright": seg.type === "trace" && seg.status !== "error",
            "bg-destructive-bright": seg.type === "trace" && seg.status === "error",
          })}
        />
      ))}
    </div>
  );
}
