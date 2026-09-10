"use client";

import { useCallback } from "react";

import { useTableConfigStoreApi } from "@/components/ui/infinite-datatable/model/table-config-store";
import JsonTooltip from "@/components/ui/json-tooltip";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

interface MetadataCellProps {
  value: unknown;
  columnSize?: number;
}

/** ClickHouse single-quoted string literal. */
const escapeSqlString = (value: string): string => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/**
 * Metadata cell with a per-key shortcut that promotes the key to a custom
 * column, so users don't have to hand-write the extraction SQL.
 */
const MetadataCell = ({ value, columnSize }: MetadataCellProps) => {
  const store = useTableConfigStoreApi();
  const { toast } = useToast();

  const isKeyColumn = useCallback(
    (key: string) => store.getState().config.customColumns.some((column) => column.name === key),
    [store]
  );

  const handleAddKeyColumn = useCallback(
    (key: string) => {
      const { config, addCustomColumn } = store.getState();
      if (config.customColumns.some((column) => column.name === key)) {
        toast({ title: `Column "${key}" already exists` });
        return;
      }

      addCustomColumn({
        name: key,
        sql: `simpleJSONExtractString(metadata, '${escapeSqlString(key)}')`,
        dataType: "string",
      });
      track("traces", "custom_column_saved", { mode: "trace-expression", source: "metadata_key" });
      toast({ title: `Added "${key}" column` });
    },
    [store, toast]
  );

  return (
    <JsonTooltip data={value} columnSize={columnSize} onAddKeyColumn={handleAddKeyColumn} isKeyColumn={isKeyColumn} />
  );
};

export default MetadataCell;
