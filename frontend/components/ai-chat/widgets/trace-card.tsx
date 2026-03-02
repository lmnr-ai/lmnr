"use client";

import { AlertCircle, CheckCircle2, CircleDollarSign, Clock3, Coins, ExternalLink } from "lucide-react";
import { useParams } from "next/navigation";

import { cn } from "@/lib/utils";

export interface TraceCardSpan {
  name: string;
  spanType: string;
  startOffsetPercent: number;
  widthPercent: number;
  status?: string;
}

export interface TraceCardData {
  traceId: string;
  topSpanName: string;
  status: string;
  durationMs: number;
  totalTokens?: number;
  totalCost?: number;
  startTime: string;
  spans: TraceCardSpan[];
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

const numberFormatter = new Intl.NumberFormat("en-US", { notation: "compact" });

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function TraceCard({ data }: { data: TraceCardData }) {
  const { projectId } = useParams();
  const isError = data.status === "error";
  const traceUrl = `/project/${projectId}/traces/${data.traceId}`;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          {isError ? (
            <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          )}
          <span className="text-sm font-medium truncate">{data.topSpanName}</span>
        </div>
        <a
          href={traceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-2"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 px-3 py-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock3 size={12} />
          <span>{formatDuration(data.durationMs)}</span>
        </div>
        {!!data.totalTokens && (
          <div className="flex items-center gap-1">
            <Coins size={12} />
            <span>{numberFormatter.format(data.totalTokens)}</span>
          </div>
        )}
        {!!data.totalCost && (
          <div className="flex items-center gap-1">
            <CircleDollarSign size={12} />
            <span>${data.totalCost.toFixed(4)}</span>
          </div>
        )}
        <span className="text-[10px] ml-auto opacity-60">
          {new Date(data.startTime).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          })}
        </span>
      </div>

      {/* Condensed Timeline */}
      {data.spans.length > 0 && (
        <div className="px-3 pb-2.5 pt-0.5">
          <div className="relative h-5 bg-muted/40 rounded overflow-hidden">
            {data.spans.map((span, i) => (
              <div
                key={i}
                className={cn("absolute top-1 h-3 rounded-sm", span.status === "error" && "brightness-125")}
                style={{
                  left: `${span.startOffsetPercent}%`,
                  width: `max(${span.widthPercent}%, 3px)`,
                  backgroundColor:
                    span.status === "error"
                      ? "rgba(204, 51, 51, 1)"
                      : SPAN_TYPE_COLORS[span.spanType] || SPAN_TYPE_COLORS.DEFAULT,
                }}
                title={span.name}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
