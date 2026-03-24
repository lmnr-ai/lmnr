"use client";

import { useParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { useEvalStore } from "@/components/evaluation/store";
import { ColumnsMenu, type CustomColumnPanelConfig } from "@/components/ui/columns-menu";
import { selectAllColumnDefs, useDataTableStore } from "@/components/ui/infinite-datatable/model/datatable-store";

export default function EvalColumnsMenu() {
  const { evaluationId } = useParams();
  const isShared = useEvalStore((s) => s.isShared);
  const store = useDataTableStore();

  const panelConfig = useMemo<CustomColumnPanelConfig>(
    () => ({
      schema: { tables: ["evaluation_datapoints"] },
      generationMode: "eval-expression",
      buildTestQuery: (sql) =>
        `SELECT ${sql} as \`test\` FROM evaluation_datapoints WHERE evaluation_id = {evaluationId:UUID} LIMIT 1`,
      testQueryParameters: { evaluationId: evaluationId as string },
      getColumnDefs: () => selectAllColumnDefs(store.getState()),
      namePlaceholder: "e.g. Span Count",
      sqlPlaceholder: "e.g. arrayCount(x -> 1, trace_spans)",
      aiInputPlaceholder: "e.g. Count the number of spans in trace_spans",
      sqlHint: "Expression is added as a column: SELECT <expr> FROM evaluation_datapoints",
    }),
    [evaluationId, store]
  );

  const getColumnDefs = useCallback(() => selectAllColumnDefs(store.getState()), [store]);

  return <ColumnsMenu panelConfig={panelConfig} getColumnDefs={getColumnDefs} showCreateButton={!isShared} />;
}
