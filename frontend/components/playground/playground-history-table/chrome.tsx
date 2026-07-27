"use client";

import { type ColumnDef } from "@tanstack/react-table";

import { ColumnsMenu } from "@/components/ui/columns-menu";
import { type Trace } from "@/lib/traces/types";

interface PlaygroundHistoryChromeProps {
  columns: ColumnDef<Trace>[];
}

export function PlaygroundHistoryChrome({ columns }: PlaygroundHistoryChromeProps) {
  return (
    <ColumnsMenu
      columnLabels={columns.map((column) => ({
        id: column.id!,
        label: typeof column.header === "string" ? column.header : column.id!,
      }))}
    />
  );
}
