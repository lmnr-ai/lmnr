import { isNil, isObject } from "lodash";
import React, { useMemo } from "react";

import { type ColumnInfo } from "@/components/chart-builder/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface TableChartProps {
  data: Record<string, any>[];
  columns: ColumnInfo[];
}

const formatCell = (value: unknown): string => {
  if (isNil(value)) return "NULL";
  if (isObject(value)) {
    try {
      const serialized = JSON.stringify(value);
      return serialized.length > 200 ? `${serialized.slice(0, 200)}…` : serialized;
    } catch {
      return "[Object]";
    }
  }
  return String(value);
};

const TableChart = ({ data, columns }: TableChartProps) => {
  // Prefer the columns prop (preserves SQL SELECT order); fall back to keys of first row.
  const headers = useMemo(() => {
    if (columns.length > 0) return columns.map((c) => c.name);
    return data[0] ? Object.keys(data[0]) : [];
  }, [columns, data]);

  if (data.length === 0) {
    return (
      <div className="flex flex-1 h-full justify-center items-center bg-muted/30 rounded-lg">
        <span className="text-muted-foreground">No data</span>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 w-full h-full flex flex-col border rounded-md overflow-hidden">
      <ScrollArea className="flex-1 min-h-0">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10 border-b">
            <TableRow>
              {headers.map((h) => (
                <TableHead key={h} className="px-2 font-medium whitespace-nowrap">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, idx) => (
              <TableRow key={idx}>
                {headers.map((h) => {
                  const formatted = formatCell(row[h]);
                  return (
                    <TableCell key={h} className="font-mono text-xs whitespace-nowrap max-w-xs truncate" title={formatted}>
                      {formatted}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
};

export default TableChart;
