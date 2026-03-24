import type { ColumnDef } from "@tanstack/react-table";

import type { SQLSchemaConfig } from "@/components/sql/utils";
import type { GenerationMode } from "@/lib/actions/sql";

/** @deprecated Import CustomColumn from @/components/ui/infinite-datatable/model/datatable-store instead. */
export type { CustomColumn } from "@/components/ui/infinite-datatable/model/datatable-store";

/** Configuration for the custom column panel to make it context-agnostic. */
export interface CustomColumnPanelConfig {
  /** ClickHouse table schema for the SQL editor autocomplete. */
  schema: SQLSchemaConfig;
  /** AI SQL generation mode passed to the SQL editor. */
  generationMode?: GenerationMode;
  /** Build a test query to validate the SQL expression. */
  buildTestQuery: (sql: string) => string;
  /** Optional parameters to send alongside the test query. */
  testQueryParameters?: Record<string, string>;
  /** Return existing column defs to check for duplicate names. */
  getColumnDefs: () => ColumnDef<any>[];
  /** Placeholder text for the SQL editor. */
  sqlPlaceholder?: string;
  /** Placeholder text for the AI generation input. */
  aiInputPlaceholder?: string;
  /** Placeholder text for the column name input. */
  namePlaceholder?: string;
  /** Hint text shown below the SQL editor. */
  sqlHint?: string;
}
