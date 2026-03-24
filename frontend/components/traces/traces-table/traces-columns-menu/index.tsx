"use client";

import { useMemo } from "react";
import { useStore } from "zustand";

import { type ColumnActions, ColumnsMenu, type CustomColumnPanelConfig } from "@/components/ui/columns-menu";
import { useDataTableStore } from "@/components/ui/infinite-datatable/model/datatable-store";
import { type TraceRow } from "@/lib/traces/types";

export default function TracesColumnsMenu() {
  const store = useDataTableStore<TraceRow>();
  const addCustomColumn = useStore(store, (s) => s.addCustomColumn);
  const updateCustomColumn = useStore(store, (s) => s.updateCustomColumn);
  const columnLabels = useStore(store, (s) => s.columnLabels);
  const lockedColumns = useStore(store, (s) => s.lockedColumns);

  const panelConfig = useMemo<CustomColumnPanelConfig>(
    () => ({
      schema: { tables: ["traces"] },
      generationMode: "trace-expression",
      buildTestQuery: (sql) => `SELECT ${sql} as \`test\` FROM traces LIMIT 1`,
      getColumnDefs: () => store.getState().columnDefs,
      namePlaceholder: "e.g. LLM span count",
      sqlPlaceholder: "e.g. total_tokens * total_cost",
      aiInputPlaceholder: "e.g. Calculate cost per token",
      sqlHint: "Expression is added as a column: SELECT <expr> FROM traces",
    }),
    [store]
  );

  const columnActions = useMemo<ColumnActions>(
    () => ({
      addCustomColumn,
      updateCustomColumn,
      getColumnDef: (columnId) => store.getState().columnDefs.find((c) => c.id === columnId),
    }),
    [addCustomColumn, updateCustomColumn, store]
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
