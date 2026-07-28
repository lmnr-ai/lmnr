"use client";

import { type ColumnDef } from "@tanstack/react-table";

import { ColumnsMenu } from "@/components/ui/columns-menu";
import { type Trace } from "@/lib/traces/types";

interface PlaygroundHistoryTableControlsProps {
  columns: ColumnDef<Trace>[];
}

export function PlaygroundHistoryTableControls({ columns }: PlaygroundHistoryTableControlsProps) {
  return (
    <ColumnsMenu
      columnLabels={columns.map((column) => ({
        id: column.id!,
        label: typeof column.header === "string" ? column.header : column.id!,
      }))}
    />
  );
}
