"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

import { useTracesTableStore } from "@/components/traces/traces-table/traces-table-store";
import { type ColumnActions, ColumnsMenu, type CustomColumnPanelConfig } from "@/components/ui/columns-menu";
import { type TraceRow } from "@/lib/traces/types";

interface TracesColumnsMenuProps {
  lockedColumns?: string[];
  columnLabels?: { id: string; label: string; onDelete?: () => void }[];
  columnDefs: ColumnDef<TraceRow>[];
}

export default function TracesColumnsMenu({
  lockedColumns = [],
  columnLabels = [],
  columnDefs,
}: TracesColumnsMenuProps) {
  const addCustomColumn = useTracesTableStore((s) => s.addCustomColumn);
  const updateCustomColumn = useTracesTableStore((s) => s.updateCustomColumn);

  const panelConfig = useMemo<CustomColumnPanelConfig>(
    () => ({
      schema: { tables: ["traces"] },
      generationMode: "trace-expression",
      buildTestQuery: (sql) => `SELECT ${sql} as \`test\` FROM traces LIMIT 1`,
      getColumnDefs: () => columnDefs,
      namePlaceholder: "e.g. LLM span count",
      sqlPlaceholder: "e.g. total_tokens * total_cost",
      aiInputPlaceholder: "e.g. Calculate cost per token",
      sqlHint: "Expression is added as a column: SELECT <expr> FROM traces",
    }),
    [columnDefs]
  );

  const columnActions = useMemo<ColumnActions>(
    () => ({
      addCustomColumn,
      updateCustomColumn,
      getColumnDef: (columnId) => columnDefs.find((c) => c.id === columnId),
    }),
    [addCustomColumn, updateCustomColumn, columnDefs]
  );

  return (
    <ColumnsMenu
      lockedColumns={lockedColumns}
      columnLabels={columnLabels}
      panelConfig={panelConfig}
      columnActions={columnActions}
    />
  );
}
