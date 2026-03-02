"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

export interface MetricsTableRow {
  label: string;
  value: string | number;
  previousValue?: string | number;
  changePercent?: number;
  unit?: string;
}

export interface MetricsTableData {
  title: string;
  rows: MetricsTableRow[];
}

function formatValue(value: string | number, unit?: string): string {
  if (typeof value === "number") {
    if (unit === "$") return `$${value.toFixed(4)}`;
    if (unit === "ms") return `${value.toFixed(0)}ms`;
    if (unit === "s") return `${(value / 1000).toFixed(2)}s`;
    if (unit === "%") return `${value.toFixed(1)}%`;
    if (Number.isInteger(value)) return new Intl.NumberFormat("en-US").format(value);
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value);
  }
  return String(value);
}

export function MetricsTable({ data }: { data: MetricsTableData }) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-3 py-1.5 border-b bg-muted/30">
        <span className="text-sm font-medium">{data.title}</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border/40">
        {data.rows.map((row, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-1.5 hover:bg-muted/20">
            <span className="text-xs text-muted-foreground">{row.label}</span>
            <div className="flex items-center gap-2">
              {row.previousValue !== undefined && (
                <span className="text-[10px] text-muted-foreground/60 line-through">
                  {formatValue(row.previousValue, row.unit)}
                </span>
              )}
              <span className="text-xs font-mono font-medium">{formatValue(row.value, row.unit)}</span>
              {row.changePercent !== undefined && (
                <span
                  className={cn(
                    "flex items-center gap-0.5 text-[10px] font-medium",
                    row.changePercent > 0 && "text-emerald-500",
                    row.changePercent < 0 && "text-destructive",
                    row.changePercent === 0 && "text-muted-foreground"
                  )}
                >
                  {row.changePercent > 0 ? (
                    <ArrowUp size={10} />
                  ) : row.changePercent < 0 ? (
                    <ArrowDown size={10} />
                  ) : (
                    <Minus size={10} />
                  )}
                  {Math.abs(row.changePercent).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
