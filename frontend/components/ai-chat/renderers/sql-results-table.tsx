"use client";

import { Database } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

export interface SQLResultsData {
  query: string;
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows?: number;
  executionTimeMs?: number;
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value.toLocaleString();
    return value.toFixed(4);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  const str = String(value);
  if (str.length > 60) return str.slice(0, 57) + "...";
  return str;
}

export function SQLResultsTable({ data }: { data: SQLResultsData }) {
  const [showQuery, setShowQuery] = useState(false);
  const displayRows = data.rows.slice(0, 20);
  const hasMore = data.rows.length > 20;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
        <div className="flex items-center gap-1.5">
          <Database className="w-3 h-3 text-muted-foreground" />
          <span className="text-[11px] font-medium text-muted-foreground">Query Results</span>
          <span className="text-[10px] text-muted-foreground/60">
            · {data.rows.length} {data.rows.length === 1 ? "row" : "rows"}
            {data.totalRows != null && data.totalRows > data.rows.length && <> of {data.totalRows.toLocaleString()}</>}
          </span>
        </div>
        <button onClick={() => setShowQuery(!showQuery)} className="text-[10px] text-primary hover:underline">
          {showQuery ? "Hide" : "Show"} SQL
        </button>
      </div>

      {/* SQL Query */}
      {showQuery && (
        <div className="px-3 py-2 border-b bg-muted/20">
          <pre className="text-[10px] font-mono text-foreground/80 whitespace-pre-wrap break-all">{data.query}</pre>
        </div>
      )}

      {/* Table */}
      {data.rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b bg-muted/20">
                {data.columns.map((col) => (
                  <th key={col} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) => (
                <tr key={i} className={cn("border-b last:border-0", i % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                  {data.columns.map((col) => (
                    <td key={col} className="px-2 py-1 font-mono whitespace-nowrap max-w-48 truncate">
                      {formatCellValue(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {hasMore && (
            <div className="px-3 py-1.5 text-center text-[10px] text-muted-foreground border-t bg-muted/20">
              Showing first 20 of {data.rows.length} rows
            </div>
          )}
        </div>
      ) : (
        <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">No results returned</div>
      )}

      {/* Execution time */}
      {data.executionTimeMs != null && (
        <div className="px-3 py-1 border-t text-[9px] text-muted-foreground/60 text-right">
          Executed in {data.executionTimeMs}ms
        </div>
      )}
    </div>
  );
}
