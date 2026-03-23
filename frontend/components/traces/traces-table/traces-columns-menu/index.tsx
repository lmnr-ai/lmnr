"use client";

import { useCallback, useMemo } from "react";

import { ColumnsMenu, type CustomColumnPanelConfig } from "@/components/ui/columns-menu";
import { selectAllColumnDefs, useDataTableStore } from "@/components/ui/infinite-datatable/model/datatable-store";

export default function TracesColumnsMenu() {
  const store = useDataTableStore();

  const panelConfig = useMemo<CustomColumnPanelConfig>(
    () => ({
      schema: { tables: ["traces"] },
      generationMode: "trace-expression",
      buildTestQuery: (sql) => `SELECT ${sql} as \`test\` FROM traces LIMIT 1`,
      getColumnDefs: () => selectAllColumnDefs(store.getState()),
      namePlaceholder: "e.g. LLM span count",
      sqlPlaceholder: "e.g. total_tokens * total_cost",
      aiInputPlaceholder: "e.g. Calculate cost per token",
      sqlHint: "Expression is added as a column: SELECT <expr> FROM traces",
    }),
    [store]
  );

  const getColumnDefs = useCallback(() => selectAllColumnDefs(store.getState()), [store]);

  return <ColumnsMenu panelConfig={panelConfig} getColumnDefs={getColumnDefs} />;
}
