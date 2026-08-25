"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { shallow } from "zustand/shallow";

import { type ColumnActions, ColumnsMenu, type CustomColumnPanelConfig } from "@/components/ui/columns-menu";
import { useTableConfigStore } from "@/components/ui/infinite-datatable/model/table-config-store";
import { type Datapoint } from "@/lib/dataset/types";

interface DatasetColumnsMenuProps {
  columnLabels?: { id: string; label: string; onDelete?: () => void }[];
  columnDefs: ColumnDef<Datapoint>[];
}

export default function DatasetColumnsMenu({ columnLabels = [], columnDefs }: DatasetColumnsMenuProps) {
  const { datasetId } = useParams();
  const { addCustomColumn, updateCustomColumn } = useTableConfigStore(
    (s) => ({
      addCustomColumn: s.addCustomColumn,
      updateCustomColumn: s.updateCustomColumn,
    }),
    shallow
  );

  const panelConfig = useMemo<CustomColumnPanelConfig>(
    () => ({
      schema: { tables: ["dataset_datapoints"] },
      aiGeneration: {
        table: "dataset_datapoints",
        // Scope to THIS dataset — an unscoped "1 = 1" samples every dataset in
        // the project, so the agent could verify against another dataset's shape.
        whereSql: "dataset_id = {datasetId:UUID}",
        parameters: { datasetId: datasetId as string },
        sampleColumns: ["data", "target", "metadata"],
      },
      generationMode: "dataset-expression",
      buildTestQuery: (sql) =>
        `SELECT ${sql} as \`test\` FROM dataset_datapoints WHERE dataset_id = {datasetId:UUID} LIMIT 1`,
      testQueryParameters: { datasetId: datasetId as string },
      getColumnDefs: () => columnDefs,
      namePlaceholder: "e.g. Question length",
      sqlPlaceholder: "e.g. simpleJSONExtractString(data, 'question')",
      aiInputPlaceholder: "e.g. Extract the question field from data",
      sqlHint: "Expression is added as a column: SELECT <expr> FROM dataset_datapoints",
    }),
    [columnDefs, datasetId]
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
