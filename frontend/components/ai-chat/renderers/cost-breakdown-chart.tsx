"use client";

import { cn } from "@/lib/utils";

export interface CostBreakdownData {
  title?: string;
  items: {
    label: string;
    value: number;
    color?: string;
    detail?: string;
  }[];
  total: number;
  format: "currency" | "tokens" | "count" | "duration";
}

function formatValue(value: number, format: CostBreakdownData["format"]): string {
  switch (format) {
    case "currency":
      if (value === 0) return "$0.00";
      if (value < 0.001) return `$${value.toFixed(6)}`;
      if (value < 0.01) return `$${value.toFixed(4)}`;
      return `$${value.toFixed(3)}`;
    case "tokens":
      if (value < 1000) return `${Math.round(value)}`;
      if (value < 1000000) return `${(value / 1000).toFixed(1)}k`;
      return `${(value / 1000000).toFixed(1)}M`;
    case "count":
      return value.toLocaleString();
    case "duration":
      if (value < 1000) return `${Math.round(value)}ms`;
      if (value < 60000) return `${(value / 1000).toFixed(1)}s`;
      return `${(value / 60000).toFixed(1)}m`;
  }
}

const DEFAULT_COLORS = [
  "bg-blue-500",
  "bg-orange-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-yellow-500",
  "bg-red-500",
];

export function CostBreakdownChart({ data }: { data: CostBreakdownData }) {
  const maxValue = Math.max(...data.items.map((d) => d.value), 1);
  const sortedItems = [...data.items].sort((a, b) => b.value - a.value);

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
        <span className="text-[11px] font-medium text-muted-foreground">{data.title || "Breakdown"}</span>
        <span className="text-xs font-semibold font-mono">{formatValue(data.total, data.format)}</span>
      </div>

      {/* Stacked bar */}
      <div className="px-3 pt-2 pb-1">
        <div className="h-4 bg-muted/30 rounded-full overflow-hidden flex">
          {sortedItems.map((item, i) => {
            const pct = data.total > 0 ? (item.value / data.total) * 100 : 0;
            if (pct < 0.5) return null;
            return (
              <div
                key={i}
                className={cn(
                  "h-full first:rounded-l-full last:rounded-r-full",
                  item.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]
                )}
                style={{ width: `${pct}%` }}
                title={`${item.label}: ${formatValue(item.value, data.format)}`}
              />
            );
          })}
        </div>
      </div>

      {/* Items */}
      <div className="px-3 py-2 space-y-1.5">
        {sortedItems.map((item, i) => {
          const pct = data.total > 0 ? (item.value / data.total) * 100 : 0;
          return (
            <div key={i} className="flex items-center gap-2">
              <div
                className={cn("w-2 h-2 rounded-sm flex-none", item.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length])}
              />
              <span className="text-[11px] flex-1 min-w-0 truncate">{item.label}</span>
              {item.detail && <span className="text-[9px] text-muted-foreground flex-none">{item.detail}</span>}
              <span className="text-[10px] font-mono text-muted-foreground flex-none">{pct.toFixed(1)}%</span>
              <span className="text-[11px] font-mono font-medium flex-none w-16 text-right">
                {formatValue(item.value, data.format)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
