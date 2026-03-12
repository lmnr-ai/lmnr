"use client";

import { ArrowDown, ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";

import type { MetricsCardData } from "./types";

function formatMetricValue(value: number | string, format?: string): string {
  if (typeof value === "string") return value;

  switch (format) {
    case "currency":
      return `$${value.toFixed(4)}`;
    case "percent":
      return `${(value * 100).toFixed(1)}%`;
    case "duration":
      if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
      return `${value.toFixed(0)}ms`;
    case "tokens":
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
      if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
      return value.toFixed(0);
    case "number":
    default:
      if (typeof value === "number" && value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
      if (typeof value === "number" && value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
      return typeof value === "number" ? value.toLocaleString() : String(value);
  }
}

function ChangeIndicator({ change }: { change?: number }) {
  if (change == null || change === 0) return null;

  const isPositive = change > 0;
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 text-[10px] font-medium",
        isPositive ? "text-green-500" : "text-red-500"
      )}
    >
      {isPositive ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
      {Math.abs(change).toFixed(1)}%
    </div>
  );
}

export function MetricsCardComponent({ data }: { data: MetricsCardData }) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b bg-muted/30">
        <span className="text-xs font-medium">{data.title}</span>
      </div>

      {/* Metrics grid */}
      <div
        className={cn(
          "grid gap-0",
          data.metrics.length <= 2 ? "grid-cols-2" : data.metrics.length === 3 ? "grid-cols-3" : "grid-cols-2"
        )}
      >
        {data.metrics.map((metric, index) => (
          <div
            key={index}
            className={cn(
              "px-3 py-2.5",
              // Add right border except for last in row
              data.metrics.length <= 3 ? index < data.metrics.length - 1 && "border-r" : index % 2 === 0 && "border-r",
              // Add bottom border for multi-row layouts
              data.metrics.length > 3 && index < data.metrics.length - 2 && "border-b"
            )}
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{metric.label}</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-semibold font-mono">{formatMetricValue(metric.value, metric.format)}</span>
              <ChangeIndicator change={metric.change} />
            </div>
            {metric.description && <div className="text-[10px] text-muted-foreground mt-0.5">{metric.description}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
