"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { useStore } from "zustand";

import { type ColumnActions, ColumnsMenu, type CustomColumnPanelConfig } from "@/components/ui/columns-menu";
import { useTableConfigStore } from "@/components/ui/infinite-datatable/model/table-config-store";
import { type TraceRow } from "@/lib/traces/types";

interface TracesColumnsMenuProps {
  columnLabels?: { id: string; label: string; onDelete?: () => void }[];
  columnDefs: ColumnDef<TraceRow>[];
}

export default function TracesColumnsMenu({ columnLabels = [], columnDefs }: TracesColumnsMenuProps) {
  const configStore = useTableConfigStore();
  const { addCustomColumn, updateCustomColumn } = useStore(configStore, (s) => ({
    addCustomColumn: s.addCustomColumn,
    updateCustomColumn: s.updateCustomColumn,
  }));

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

  return <ColumnsMenu columnLabels={columnLabels} panelConfig={panelConfig} columnActions={columnActions} />;
}
