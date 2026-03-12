"use client";

import { ChevronDown, ChevronUp, Database, Table2 } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

import type { DataTableData } from "./types";

function formatCellValue(value: string | number | boolean | null, format?: string): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";

  switch (format) {
    case "currency":
      return typeof value === "number" ? `$${value.toFixed(4)}` : String(value);
    case "duration":
      if (typeof value === "number") {
        if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
        return `${value.toFixed(0)}ms`;
      }
      return String(value);
    case "number":
      return typeof value === "number" ? value.toLocaleString() : String(value);
    case "date":
      try {
        return new Date(String(value)).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
      } catch {
        return String(value);
      }
    case "badge":
      return String(value);
    default:
      return String(value);
  }
}

function BadgeCell({ value }: { value: string }) {
  const colorMap: Record<string, string> = {
    success: "bg-green-500/10 text-green-500 border-green-500/20",
    error: "bg-red-500/10 text-red-500 border-red-500/20",
    pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    running: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    default: "bg-muted text-muted-foreground border-border",
  };

  const lower = value.toLowerCase();
  const color =
    colorMap[lower] ??
    (lower.includes("error") || lower.includes("fail")
      ? colorMap.error
      : lower.includes("success") || lower.includes("ok")
        ? colorMap.success
        : colorMap.default);

  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border", color)}>
      {value}
    </span>
  );
}

export function DataTableComponent({ data }: { data: DataTableData }) {
  const [expanded, setExpanded] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const displayRows = expanded ? data.rows : data.rows.slice(0, 8);

  const sortedRows = useMemo(() => {
    if (!sortKey) return displayRows;
    return [...displayRows].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [displayRows, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Table2 className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">{data.title}</span>
        </div>
        <span className="text-[10px] text-muted-foreground">{data.totalRows ?? data.rows.length} rows</span>
      </div>

      {/* SQL query preview */}
      {data.query && (
        <div className="px-3 py-1.5 border-b bg-muted/10 flex items-center gap-2">
          <Database className="w-3 h-3 text-muted-foreground flex-none" />
          <code className="text-[10px] text-muted-foreground font-mono truncate">{data.query}</code>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/20">
              {data.columns.map((col) => (
                <th
                  key={col.key}
                  className="px-2 py-1.5 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium cursor-pointer hover:text-foreground"
                  onClick={() => handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key &&
                      (sortDir === "asc" ? (
                        <ChevronUp className="w-2.5 h-2.5" />
                      ) : (
                        <ChevronDown className="w-2.5 h-2.5" />
                      ))}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {sortedRows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-muted/20 transition-colors">
                {data.columns.map((col) => (
                  <td key={col.key} className="px-2 py-1.5 font-mono text-[11px] max-w-[140px] truncate">
                    {col.format === "badge" ? (
                      <BadgeCell value={String(row[col.key] ?? "")} />
                    ) : (
                      formatCellValue(row[col.key], col.format)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Show more / footer */}
      {data.rows.length > 8 && (
        <div className="px-3 py-1.5 border-t bg-muted/10 flex justify-center">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-primary hover:underline flex items-center gap-1"
          >
            {expanded ? (
              <>
                Show less <ChevronUp className="w-3 h-3" />
              </>
            ) : (
              <>
                Show all {data.rows.length} rows <ChevronDown className="w-3 h-3" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
