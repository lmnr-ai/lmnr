"use client";

import { AlertTriangle, CheckCircle2, ChevronRight, Clock, Coins, ExternalLink, Layers, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { cn } from "@/lib/utils";

import type { TraceSummaryData } from "./types";

const statusConfig = {
  success: {
    icon: CheckCircle2,
    color: "text-green-500",
    bg: "bg-green-500/10",
    label: "Success",
  },
  error: {
    icon: XCircle,
    color: "text-red-500",
    bg: "bg-red-500/10",
    label: "Error",
  },
  partial: {
    icon: AlertTriangle,
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
    label: "Partial",
  },
};

export function TraceSummaryCard({ data }: { data: TraceSummaryData }) {
  const { projectId } = useParams();
  const config = statusConfig[data.status];
  const StatusIcon = config.icon;
  const durationMs = new Date(data.endTime).getTime() - new Date(data.startTime).getTime();

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <div className={cn("rounded-full p-1", config.bg)}>
            <StatusIcon className={cn("w-3 h-3", config.color)} />
          </div>
          <span className="text-xs font-medium">Trace Summary</span>
          <span className="text-xs text-muted-foreground font-mono">{data.traceId.slice(0, 8)}...</span>
        </div>
        <Link
          href={`/project/${projectId}/traces/${data.traceId}`}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Open <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-0 border-b">
        <div className="px-3 py-2 border-r">
          <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
            <Clock className="w-3 h-3" />
            <span className="text-[10px] uppercase tracking-wider">Duration</span>
          </div>
          <span className="text-xs font-mono font-medium">
            {durationMs >= 1000 ? `${(durationMs / 1000).toFixed(2)}s` : `${durationMs}ms`}
          </span>
        </div>
        <div className="px-3 py-2 border-r">
          <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
            <Layers className="w-3 h-3" />
            <span className="text-[10px] uppercase tracking-wider">Spans</span>
          </div>
          <span className="text-xs font-mono font-medium">
            {data.totalSpans}
            {data.errorCount > 0 && <span className="text-red-500 ml-1">({data.errorCount} err)</span>}
          </span>
        </div>
        <div className="px-3 py-2">
          <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
            <Coins className="w-3 h-3" />
            <span className="text-[10px] uppercase tracking-wider">Cost</span>
          </div>
          <span className="text-xs font-mono font-medium">
            {data.totalCost != null ? `$${data.totalCost.toFixed(4)}` : "—"}
          </span>
        </div>
      </div>

      {/* Mini span timeline */}
      {data.topLevelSpans.length > 0 && (
        <div className="px-3 py-2 border-b">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Top-level spans</div>
          <div className="space-y-1">
            {data.topLevelSpans.slice(0, 5).map((span) => (
              <div key={span.spanId} className="flex items-center gap-2 group">
                <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono truncate">{span.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono flex-none">
                      {span.durationMs >= 1000 ? `${(span.durationMs / 1000).toFixed(1)}s` : `${span.durationMs}ms`}
                    </span>
                  </div>
                  {/* Mini duration bar */}
                  <div className="h-1 bg-muted rounded-full mt-0.5 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", span.status === "error" ? "bg-red-500/60" : "bg-primary/40")}
                      style={{
                        width: `${Math.max(5, Math.min(100, (span.durationMs / durationMs) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
            {data.topLevelSpans.length > 5 && (
              <span className="text-[10px] text-muted-foreground">+{data.topLevelSpans.length - 5} more spans</span>
            )}
          </div>
        </div>
      )}

      {/* Summary text */}
      <div className="px-3 py-2">
        <p className="text-xs text-muted-foreground leading-relaxed">{data.summary}</p>
      </div>
    </div>
  );
}
