import React from "react";

import { cn } from "@/lib/utils";

interface TableChartProps {
  data: Record<string, any>[];
  onTraceClick?: (traceId: string, spanId?: string) => void;
}

const CLICKABLE_ID_COLUMNS = new Set(["trace_id", "id"]);
const SPAN_ID_COLUMN = "span_id";

const TableChart = ({ data, onTraceClick }: TableChartProps) => {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full w-full text-muted-foreground">
        <span className="text-sm">No data</span>
      </div>
    );
  }

  const columns = Object.keys(data[0]).filter((col) => col !== "__hidden_trace_id" && col !== "__hidden_span_id");

  const isClickableCell = (column: string): boolean => {
    if (!onTraceClick) return false;
    return CLICKABLE_ID_COLUMNS.has(column);
  };

  const handleCellClick = (column: string, row: Record<string, any>) => {
    if (!onTraceClick) return;

    if (column === "trace_id" || column === "id") {
      const traceId = String(row[column]);
      const spanId = row[SPAN_ID_COLUMN] ? String(row[SPAN_ID_COLUMN]) : undefined;
      onTraceClick(traceId, spanId);
    }
  };

  return (
    <div className="w-full h-full overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            {columns.map((col) => (
              <th key={col} className="text-left p-2 font-medium text-secondary-foreground/80 whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b last:border-b-0 hover:bg-muted/50">
              {columns.map((col) => {
                const clickable = isClickableCell(col);
                const value = row[col];
                const displayValue = value === null || value === undefined ? "NULL" : String(value);
                return (
                  <td key={col} className="p-2 whitespace-nowrap">
                    {clickable ? (
                      <button
                        className={cn(
                          "text-left text-blue-500 hover:text-blue-400 hover:underline cursor-pointer",
                          "font-mono text-xs"
                        )}
                        onClick={() => handleCellClick(col, row)}
                      >
                        {displayValue}
                      </button>
                    ) : (
                      <span className="font-mono text-xs">{displayValue}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TableChart;
