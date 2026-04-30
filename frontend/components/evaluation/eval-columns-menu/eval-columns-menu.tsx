"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";

import { useEvalStore, useEvalStoreApi } from "@/components/evaluation/store";
import { type ColumnActions, ColumnsMenu, type CustomColumnPanelConfig } from "@/components/ui/columns-menu";

interface EvalColumnsMenuProps {
  lockedColumns?: string[];
  columnLabels?: { id: string; label: string; onDelete?: () => void }[];
}

export default function EvalColumnsMenu({ lockedColumns = [], columnLabels = [] }: EvalColumnsMenuProps) {
  const { evaluationId } = useParams();
  const isShared = useEvalStore((s) => s.isShared);
  const addCustomColumn = useEvalStore((s) => s.addCustomColumn);
  const updateCustomColumn = useEvalStore((s) => s.updateCustomColumn);
  const storeApi = useEvalStoreApi();

  const panelConfig = useMemo<CustomColumnPanelConfig>(
    () => ({
      schema: { tables: ["evaluation_datapoints"] },
      generationMode: "eval-expression",
      buildTestQuery: (sql) =>
        `SELECT ${sql} as \`test\` FROM evaluation_datapoints WHERE evaluation_id = {evaluationId:UUID} LIMIT 1`,
      testQueryParameters: { evaluationId: evaluationId as string },
      getColumnDefs: () => storeApi.getState().columnDefs,
      namePlaceholder: "e.g. Span Count",
      sqlPlaceholder: "e.g. arrayCount(x -> 1, trace_spans)",
      aiInputPlaceholder: "e.g. Count the number of spans in trace_spans",
      sqlHint: "Expression is added as a column: SELECT <expr> FROM evaluation_datapoints",
    }),
    [evaluationId, storeApi]
  );

  const columnActions = useMemo<ColumnActions>(
    () => ({
      addCustomColumn,
      updateCustomColumn,
      getColumnDef: (columnId) => storeApi.getState().columnDefs.find((c) => c.id === columnId),
    }),
    [addCustomColumn, updateCustomColumn, storeApi]
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
