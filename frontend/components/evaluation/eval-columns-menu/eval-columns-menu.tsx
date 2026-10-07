"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { shallow } from "zustand/shallow";

import { useEvalStore } from "@/components/evaluation/store";
import { type ColumnActions, ColumnsMenu, type CustomColumnPanelConfig } from "@/components/ui/columns-menu";
import { useTableConfigStore } from "@/components/ui/infinite-datatable/model/table-config-store";
import { type EvalRow } from "@/lib/evaluation/types";

interface EvalColumnsMenuProps {
  /** Derived column defs from the parent — see EvaluationDatapointsTableProps. */
  columnDefs: ColumnDef<EvalRow>[];
  columnLabels?: { id: string; label: string; onDelete?: () => void }[];
}

export default function EvalColumnsMenu({ columnDefs, columnLabels = [] }: EvalColumnsMenuProps) {
  const { evaluationId } = useParams();
  const isShared = useEvalStore((s) => s.isShared);
  const { addCustomColumn, updateCustomColumn } = useTableConfigStore(
    (s) => ({ addCustomColumn: s.addCustomColumn, updateCustomColumn: s.updateCustomColumn }),
    shallow
  );

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
      columnLabels={columnLabels}
      panelConfig={isShared ? undefined : panelConfig}
      columnActions={isShared ? undefined : columnActions}
    />
  );
}
