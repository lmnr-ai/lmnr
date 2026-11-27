"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { shallow } from "zustand/shallow";

import { type ColumnActions, ColumnsMenu, type CustomColumnPanelConfig } from "@/components/ui/columns-menu";
import { useTableConfigStore } from "@/components/ui/infinite-datatable/model/table-config-store";
import { type SessionRow } from "@/lib/traces/types";

interface SessionsColumnsMenuProps {
  columnLabels: { id: string; label: string; onDelete?: () => void }[];
  columnDefs: ColumnDef<SessionRow>[];
}

export default function SessionsColumnsMenu({ columnLabels, columnDefs }: SessionsColumnsMenuProps) {
  const { addCustomColumn, updateCustomColumn } = useTableConfigStore(
    (s) => ({ addCustomColumn: s.addCustomColumn, updateCustomColumn: s.updateCustomColumn }),
    shallow
  );

  const panelConfig = useMemo<CustomColumnPanelConfig>(
    () => ({
      schema: { tables: ["traces"] },
      generationMode: "trace-expression",
      buildTestQuery: (sql) => `SELECT ${sql} as \`test\` FROM traces LIMIT 1`,
      getColumnDefs: () => columnDefs,
      namePlaceholder: "e.g. Environment",
      sqlPlaceholder: "e.g. simpleJSONExtractString(metadata, 'env')",
      aiInputPlaceholder: "e.g. The env field from trace metadata",
      sqlHint:
        "Per-trace expression over traces. Each session shows the first non-empty value, taking its traces in start-time order.",
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
