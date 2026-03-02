"use client";

import { AlertCircle, CheckCircle2, Clock, Coins, DollarSign, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { cn } from "@/lib/utils";

export interface TraceSummaryData {
  traceId: string;
  name: string;
  status: string;
  startTime: string;
  endTime: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  spanCount: number;
  topLevelSpans: {
    name: string;
    spanType: string;
    durationMs: number;
    status?: string;
  }[];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatCost(cost: number): string {
  if (cost === 0) return "$0.00";
  if (cost < 0.001) return `$${cost.toFixed(6)}`;
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${(tokens / 1000000).toFixed(1)}M`;
}

export function TraceSummaryCard({ data }: { data: TraceSummaryData }) {
  const { projectId } = useParams();
  const totalDurationMs = new Date(data.endTime).getTime() - new Date(data.startTime).getTime();
  const isSuccess = data.status === "OK" || data.status === "success";
  const maxSpanDuration = Math.max(...data.topLevelSpans.map((s) => s.durationMs), 1);

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          {isSuccess ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-none" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 text-destructive flex-none" />
          )}
          <span className="text-xs font-medium truncate">{data.name}</span>
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded font-medium flex-none",
              isSuccess ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive"
            )}
          >
            {data.status}
          </span>
        </div>
        <Link
          href={`/project/${projectId}/traces/${data.traceId}`}
          className="flex items-center gap-1 text-[10px] text-primary hover:underline flex-none"
        >
          Open <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-0 border-b">
        <div className="flex flex-col items-center py-2 border-r">
          <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
            <Clock className="w-3 h-3" />
            <span className="text-[10px]">Duration</span>
          </div>
          <span className="text-xs font-semibold font-mono">{formatDuration(totalDurationMs)}</span>
        </div>
        <div className="flex flex-col items-center py-2 border-r">
          <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
            <Coins className="w-3 h-3" />
            <span className="text-[10px]">Tokens</span>
          </div>
          <span className="text-xs font-semibold font-mono">{formatTokens(data.totalTokens)}</span>
        </div>
        <div className="flex flex-col items-center py-2">
          <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
            <DollarSign className="w-3 h-3" />
            <span className="text-[10px]">Cost</span>
          </div>
          <span className="text-xs font-semibold font-mono">{formatCost(data.totalCost)}</span>
        </div>
      </div>

      {/* Condensed timeline */}
      <div className="px-3 py-2">
        <div className="text-[10px] text-muted-foreground mb-1.5 font-medium">Timeline · {data.spanCount} spans</div>
        <div className="space-y-1">
          {data.topLevelSpans.slice(0, 6).map((span, i) => {
            const widthPct = Math.max((span.durationMs / maxSpanDuration) * 100, 4);
            const spanSuccess = !span.status || span.status === "OK" || span.status === "success";
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-16 truncate flex-none font-mono">{span.name}</span>
                <div className="flex-1 h-3.5 bg-muted/50 rounded-sm overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-sm transition-all flex items-center px-1",
                      spanSuccess ? "bg-primary/20" : "bg-destructive/20"
                    )}
                    style={{ width: `${widthPct}%` }}
                  >
                    <span className="text-[9px] font-mono text-foreground/70 whitespace-nowrap">
                      {formatDuration(span.durationMs)}
                    </span>
                  </div>
                </div>
                <span
                  className={cn(
                    "text-[10px] px-1 rounded flex-none",
                    span.spanType === "LLM"
                      ? "bg-blue-500/10 text-blue-600"
                      : span.spanType === "TOOL"
                        ? "bg-orange-500/10 text-orange-600"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {span.spanType}
                </span>
              </div>
            );
          })}
          {data.topLevelSpans.length > 6 && (
            <div className="text-[10px] text-muted-foreground text-center">
              +{data.topLevelSpans.length - 6} more spans
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
