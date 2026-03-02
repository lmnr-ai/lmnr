"use client";


export interface SpanBreakdownItem {
  name: string;
  spanType: string;
  durationMs: number;
  startOffsetMs: number;
  totalDurationMs: number;
  tokens?: number;
  cost?: number;
  status?: string;
  model?: string;
  depth: number;
}

export interface SpanBreakdownData {
  traceId: string;
  totalDurationMs: number;
  spans: SpanBreakdownItem[];
}

const SPAN_TYPE_COLORS: Record<string, string> = {
  DEFAULT: "rgba(96, 165, 250, 0.7)",
  LLM: "rgba(168, 85, 247, 0.8)",
  EXECUTOR: "rgba(245, 158, 11, 0.7)",
  EVALUATOR: "rgba(6, 182, 212, 0.7)",
  EVALUATION: "rgba(16, 185, 129, 0.7)",
  TOOL: "rgba(227, 160, 8, 0.9)",
  EVENT: "rgba(204, 51, 51, 0.7)",
  CACHED: "rgba(168, 85, 247, 0.6)",
};

const SPAN_TYPE_LABELS: Record<string, string> = {
  DEFAULT: "Span",
  LLM: "LLM",
  EXECUTOR: "Exec",
  EVALUATOR: "Eval",
  TOOL: "Tool",
  EVENT: "Event",
  CACHED: "Cache",
};

const numberFormatter = new Intl.NumberFormat("en-US", { notation: "compact" });

function formatDuration(ms: number): string {
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function SpanBreakdown({ data }: { data: SpanBreakdownData }) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
        <span className="text-sm font-medium">Span Breakdown</span>
        <span className="text-xs text-muted-foreground">{formatDuration(data.totalDurationMs)} total</span>
      </div>

      {/* Span rows */}
      <div className="max-h-64 overflow-auto minimal-scrollbar">
        {data.spans.map((span, i) => {
          const leftPercent = data.totalDurationMs > 0 ? (span.startOffsetMs / data.totalDurationMs) * 100 : 0;
          const widthPercent = data.totalDurationMs > 0 ? (span.durationMs / data.totalDurationMs) * 100 : 0;
          const color =
            span.status === "error"
              ? "rgba(204, 51, 51, 1)"
              : SPAN_TYPE_COLORS[span.spanType] || SPAN_TYPE_COLORS.DEFAULT;

          return (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-1 border-b border-border/30 last:border-b-0 hover:bg-muted/20"
            >
              {/* Span info */}
              <div className="w-[130px] shrink-0 min-w-0">
                <div className="flex items-center gap-1" style={{ paddingLeft: span.depth * 8 }}>
                  <span className="text-[9px] px-1 rounded shrink-0" style={{ backgroundColor: color, color: "white" }}>
                    {SPAN_TYPE_LABELS[span.spanType] || "Span"}
                  </span>
                  <span className="text-[11px] truncate">{span.model || span.name}</span>
                </div>
              </div>

              {/* Timeline bar */}
              <div className="flex-1 min-w-0">
                <div className="relative h-4 bg-muted/30 rounded-sm overflow-hidden">
                  <div
                    className="absolute top-0.5 h-3 rounded-sm"
                    style={{
                      left: `${leftPercent}%`,
                      width: `max(${widthPercent}%, 2px)`,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </div>

              {/* Duration */}
              <span className="text-[10px] text-muted-foreground w-14 text-right shrink-0 tabular-nums">
                {formatDuration(span.durationMs)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 px-3 py-1.5 border-t bg-muted/20">
        {Object.entries(SPAN_TYPE_LABELS)
          .filter(([type]) => data.spans.some((s) => s.spanType === type))
          .map(([type, label]) => (
            <div key={type} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: SPAN_TYPE_COLORS[type] }} />
              <span className="text-[9px] text-muted-foreground">{label}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
