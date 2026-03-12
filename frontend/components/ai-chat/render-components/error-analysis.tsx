"use client";

import { AlertOctagon, AlertTriangle, Clock, Info } from "lucide-react";

import { cn } from "@/lib/utils";

import type { ErrorAnalysisData } from "./types";

const severityConfig = {
  critical: {
    icon: AlertOctagon,
    color: "text-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    barColor: "bg-red-500",
  },
  error: {
    icon: AlertTriangle,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    barColor: "bg-orange-500",
  },
  warning: {
    icon: Info,
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
    barColor: "bg-yellow-500",
  },
};

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function ErrorAnalysisCard({ data }: { data: ErrorAnalysisData }) {
  const maxCount = Math.max(...data.errors.map((e) => e.count), 1);

  const criticalCount = data.errors.filter((e) => e.severity === "critical").length;
  const errorCount = data.errors.filter((e) => e.severity === "error").length;
  const warningCount = data.errors.filter((e) => e.severity === "warning").length;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
          <span className="text-xs font-medium">Error Analysis</span>
        </div>
        <span className="text-[10px] text-muted-foreground">{data.timeRange}</span>
      </div>

      {/* Severity summary bar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b bg-muted/10">
        <div className="flex items-center gap-4 text-[10px]">
          {criticalCount > 0 && (
            <span className="flex items-center gap-1 text-red-500 font-medium">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              {criticalCount} critical
            </span>
          )}
          {errorCount > 0 && (
            <span className="flex items-center gap-1 text-orange-500 font-medium">
              <div className="w-2 h-2 rounded-full bg-orange-500" />
              {errorCount} error
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex items-center gap-1 text-yellow-500 font-medium">
              <div className="w-2 h-2 rounded-full bg-yellow-500" />
              {warningCount} warning
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground ml-auto font-mono">{data.totalErrors} total</span>
      </div>

      {/* Error list */}
      <div className="divide-y">
        {data.errors.slice(0, 6).map((error, index) => {
          const config = severityConfig[error.severity];
          const SeverityIcon = config.icon;
          const barWidth = (error.count / maxCount) * 100;

          return (
            <div key={index} className="px-3 py-2 group">
              <div className="flex items-start gap-2">
                <SeverityIcon className={cn("w-3 h-3 mt-0.5 flex-none", config.color)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono truncate">{error.message}</span>
                    <span className="text-[10px] font-mono text-muted-foreground flex-none font-medium">
                      ×{error.count}
                    </span>
                  </div>

                  {/* Count bar */}
                  <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", config.barColor)}
                      style={{ width: `${barWidth}%`, opacity: 0.5 }}
                    />
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    {error.spanName && (
                      <span className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">{error.spanName}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      Last: {formatTimeAgo(error.lastSeen)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {data.errors.length > 6 && (
          <div className="px-3 py-1.5 text-center">
            <span className="text-[10px] text-muted-foreground">+{data.errors.length - 6} more errors</span>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="px-3 py-2 border-t bg-muted/10">
        <p className="text-[11px] text-muted-foreground leading-relaxed">{data.summary}</p>
      </div>
    </div>
  );
}
