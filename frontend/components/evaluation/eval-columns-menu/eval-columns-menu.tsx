"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { useParams } from "next/navigation";
import { useMemo } from "react";

import { useEvalStore } from "@/components/evaluation/store";
import { type ColumnActions, ColumnsMenu, type CustomColumnPanelConfig } from "@/components/ui/columns-menu";
import { type EvalRow } from "@/lib/evaluation/types";

interface EvalColumnsMenuProps {
  /** Derived column defs from the parent — see EvaluationDatapointsTableProps. */
  columnDefs: ColumnDef<EvalRow>[];
  lockedColumns?: string[];
  columnLabels?: { id: string; label: string; onDelete?: () => void }[];
}

export default function EvalColumnsMenu({ columnDefs, lockedColumns = [], columnLabels = [] }: EvalColumnsMenuProps) {
  const { evaluationId } = useParams();
  const isShared = useEvalStore((s) => s.isShared);
  const addCustomColumn = useEvalStore((s) => s.addCustomColumn);
  const updateCustomColumn = useEvalStore((s) => s.updateCustomColumn);

  const panelConfig = useMemo<CustomColumnPanelConfig>(
    () => ({
      schema: { tables: ["evaluation_datapoints"] },
      generationMode: "eval-expression",
      buildTestQuery: (sql) =>
        `SELECT ${sql} as \`test\` FROM evaluation_datapoints WHERE evaluation_id = {evaluationId:UUID} LIMIT 1`,
      testQueryParameters: { evaluationId: evaluationId as string },
      getColumnDefs: () => columnDefs,
      namePlaceholder: "e.g. Span Count",
      sqlPlaceholder: "e.g. arrayCount(x -> 1, trace_spans)",
      aiInputPlaceholder: "e.g. Count the number of spans in trace_spans",
      sqlHint: "Expression is added as a column: SELECT <expr> FROM evaluation_datapoints",
    }),
    [evaluationId, columnDefs]
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
      showCreateButton={!isShared}
    />
  );
}
