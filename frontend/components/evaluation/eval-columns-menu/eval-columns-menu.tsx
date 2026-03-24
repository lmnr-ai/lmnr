"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";
import { useStore } from "zustand";

import { useEvalStore } from "@/components/evaluation/store";
import { type ColumnActions, ColumnsMenu, type CustomColumnPanelConfig } from "@/components/ui/columns-menu";
import { useDataTableStore } from "@/components/ui/infinite-datatable/model/datatable-store";
import { type EvalRow } from "@/lib/evaluation/types";

export default function EvalColumnsMenu() {
  const { evaluationId } = useParams();
  const isShared = useEvalStore((s) => s.isShared);

  const store = useDataTableStore<EvalRow>();
  const addCustomColumn = useStore(store, (s) => s.addCustomColumn);
  const updateCustomColumn = useStore(store, (s) => s.updateCustomColumn);
  const columnLabels = useStore(store, (s) => s.columnLabels);
  const lockedColumns = useStore(store, (s) => s.lockedColumns);

  const panelConfig = useMemo<CustomColumnPanelConfig>(
    () => ({
      schema: { tables: ["evaluation_datapoints"] },
      generationMode: "eval-expression",
      buildTestQuery: (sql) =>
        `SELECT ${sql} as \`test\` FROM evaluation_datapoints WHERE evaluation_id = {evaluationId:UUID} LIMIT 1`,
      testQueryParameters: { evaluationId: evaluationId as string },
      getColumnDefs: () => store.getState().columnDefs,
      namePlaceholder: "e.g. Span Count",
      sqlPlaceholder: "e.g. arrayCount(x -> 1, trace_spans)",
      aiInputPlaceholder: "e.g. Count the number of spans in trace_spans",
      sqlHint: "Expression is added as a column: SELECT <expr> FROM evaluation_datapoints",
    }),
    [evaluationId, store]
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
      showCreateButton={!isShared}
    />
  );
}
