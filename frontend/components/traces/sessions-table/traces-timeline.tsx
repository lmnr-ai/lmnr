import { type TraceTimelineItem } from "@/lib/traces/types";

interface TracesTimelineProps {
  traces: TraceTimelineItem[];
}

export default function TracesTimeline({ traces }: TracesTimelineProps) {
  const total = traces.length;
  const errorCount = traces.filter((t) => t.status === "error").length;
  const successRatio = total > 0 ? (total - errorCount) / total : 1;

  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-xs text-secondary-foreground tabular-nums">{total}</span>
      <div className="flex w-40 h-2 rounded-full bg-muted overflow-hidden">
        {successRatio > 0 && (
          <div className="h-full bg-success-bright/90" style={{ width: `${successRatio * 100}%` }} />
        )}
        {errorCount > 0 && (
          <div className="h-full bg-destructive-bright/90" style={{ width: `${(1 - successRatio) * 100}%` }} />
        )}
      </div>
      {errorCount > 0 && (
        <span className="text-[11px] font-medium tabular-nums px-1.5 py-0.5 rounded-sm bg-destructive-bright/15 text-destructive-bright">
          {errorCount}
        </span>
      )}
    </div>
  );
}
