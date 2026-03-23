"use client";

import { useMemo } from "react";

import { useTracesTableStore } from "@/components/traces/traces-table/traces-table-store";
import { type ColumnActions, ColumnsMenu, type CustomColumnPanelConfig } from "@/components/ui/columns-menu";

export default function TracesColumnsMenu() {
  const addCustomColumn = useTracesTableStore((s) => s.addCustomColumn);
  const updateCustomColumn = useTracesTableStore((s) => s.updateCustomColumn);
  const removeCustomColumn = useTracesTableStore((s) => s.removeCustomColumn);

  const panelConfig = useMemo<CustomColumnPanelConfig>(
    () => ({
      schema: { tables: ["traces"] },
      generationMode: "trace-expression",
      buildTestQuery: (sql) => `SELECT ${sql} as \`test\` FROM traces LIMIT 1`,
      getColumnDefs: () => useTracesTableStore.getState().columnDefs,
      namePlaceholder: "e.g. LLM span count",
      sqlPlaceholder: "e.g. total_tokens * total_cost",
      aiInputPlaceholder: "e.g. Calculate cost per token",
      sqlHint: "Expression is added as a column: SELECT <expr> FROM traces",
    }),
    []
  );

  const columnActions = useMemo<ColumnActions>(
    () => ({
      addCustomColumn,
      updateCustomColumn,
      removeCustomColumn,
      getColumnDef: (columnId) => useTracesTableStore.getState().columnDefs.find((c) => c.id === columnId),
    }),
    [addCustomColumn, updateCustomColumn, removeCustomColumn]
  );

  return <ColumnsMenu panelConfig={panelConfig} columnActions={columnActions} />;
}
