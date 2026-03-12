"use client";

import { cn } from "@/lib/utils";

import type { SpanTimelineData } from "./types";

const SPAN_COLORS = [
  "bg-primary/60",
  "bg-blue-500/60",
  "bg-emerald-500/60",
  "bg-amber-500/60",
  "bg-purple-500/60",
  "bg-pink-500/60",
  "bg-cyan-500/60",
  "bg-orange-500/60",
];

function getSpanColor(index: number, status: string): string {
  if (status === "error") return "bg-red-500/70";
  return SPAN_COLORS[index % SPAN_COLORS.length];
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms.toFixed(0)}ms`;
}

export function SpanTimelineComponent({ data }: { data: SpanTimelineData }) {
  const maxDuration = data.totalDurationMs;

  // Build time markers
  const markerCount = 4;
  const markers = Array.from({ length: markerCount + 1 }, (_, i) => ({
    position: (i / markerCount) * 100,
    label: formatDuration((i / markerCount) * maxDuration),
  }));

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <span className="text-xs font-medium">Span Timeline</span>
        <span className="text-[10px] text-muted-foreground font-mono">
          Total: {formatDuration(data.totalDurationMs)}
        </span>
      </div>

      {/* Time axis markers */}
      <div className="relative h-4 border-b bg-muted/10 mx-3">
        {markers.map((marker, i) => (
          <div
            key={i}
            className="absolute top-0 h-full flex flex-col items-center"
            style={{ left: `${marker.position}%` }}
          >
            <div className="w-px h-1.5 bg-border" />
            <span className="text-[8px] text-muted-foreground font-mono mt-0.5">{marker.label}</span>
          </div>
        ))}
      </div>

      {/* Spans */}
      <div className="px-3 py-2 space-y-0.5">
        {data.spans.map((span, index) => {
          const leftPercent = maxDuration > 0 ? (span.startOffsetMs / maxDuration) * 100 : 0;
          const widthPercent = maxDuration > 0 ? Math.max(1, (span.durationMs / maxDuration) * 100) : 100;

          return (
            <div
              key={span.spanId}
              className="flex items-center gap-2 group h-6"
              style={{ paddingLeft: `${span.depth * 12}px` }}
            >
              {/* Span name */}
              <div className="w-24 flex-none truncate">
                <span
                  className={cn(
                    "text-[10px] font-mono",
                    span.status === "error" ? "text-red-400" : "text-foreground/80"
                  )}
                >
                  {span.name}
                </span>
              </div>

              {/* Timeline bar */}
              <div className="flex-1 relative h-4 bg-muted/20 rounded-sm overflow-hidden">
                <div
                  className={cn(
                    "absolute top-0.5 bottom-0.5 rounded-sm transition-all",
                    getSpanColor(index, span.status)
                  )}
                  style={{
                    left: `${leftPercent}%`,
                    width: `${widthPercent}%`,
                  }}
                />
                {/* Hover tooltip shown via group-hover */}
                <div className="absolute inset-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div
                    className="absolute text-[9px] font-mono text-foreground bg-background/90 px-1 rounded border shadow-sm whitespace-nowrap z-10"
                    style={{
                      left: `${Math.min(leftPercent + widthPercent + 1, 75)}%`,
                    }}
                  >
                    {formatDuration(span.durationMs)}
                    {span.spanType && <span className="text-muted-foreground ml-1">({span.spanType})</span>}
                  </div>
                </div>
              </div>

              {/* Duration label */}
              <div className="w-14 flex-none text-right">
                <span className="text-[10px] font-mono text-muted-foreground">{formatDuration(span.durationMs)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="px-3 py-1.5 border-t bg-muted/10 flex items-center gap-3">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-primary/60" />
          <span className="text-[9px] text-muted-foreground">Normal</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-red-500/70" />
          <span className="text-[9px] text-muted-foreground">Error</span>
        </div>
        <span className="text-[9px] text-muted-foreground ml-auto">{data.spans.length} spans</span>
      </div>
    </div>
  );
}
