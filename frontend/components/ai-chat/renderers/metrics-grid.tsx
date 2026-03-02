"use client";

import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";

export interface MetricItem {
  label: string;
  value: string;
  previousValue?: string;
  change?: number;
  changeLabel?: string;
  format?: "number" | "currency" | "percent" | "duration" | "tokens";
}

export interface MetricsGridData {
  title?: string;
  metrics: MetricItem[];
}

function TrendIndicator({ change }: { change: number }) {
  if (change === 0) {
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
        <ArrowRight className="w-2.5 h-2.5" />
        0%
      </span>
    );
  }

  const isPositive = change > 0;
  return (
    <span
      className={cn(
        "flex items-center gap-0.5 text-[10px] font-medium",
        isPositive ? "text-green-600" : "text-destructive"
      )}
    >
      {isPositive ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
      {Math.abs(change).toFixed(1)}%
    </span>
  );
}

export function MetricsGrid({ data }: { data: MetricsGridData }) {
  const cols = data.metrics.length <= 2 ? 2 : data.metrics.length <= 3 ? 3 : 2;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {data.title && (
        <div className="px-3 py-1.5 border-b bg-muted/30">
          <span className="text-[11px] font-medium text-muted-foreground">{data.title}</span>
        </div>
      )}
      <div className={cn("grid gap-0", cols === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {data.metrics.map((metric, i) => (
          <div
            key={i}
            className={cn(
              "flex flex-col px-3 py-2.5",
              i < data.metrics.length - cols && "border-b",
              (i + 1) % cols !== 0 && "border-r"
            )}
          >
            <span className="text-[10px] text-muted-foreground mb-1">{metric.label}</span>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold font-mono">{metric.value}</span>
              {metric.change != null && <TrendIndicator change={metric.change} />}
            </div>
            {metric.changeLabel && (
              <span className="text-[9px] text-muted-foreground mt-0.5">{metric.changeLabel}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
