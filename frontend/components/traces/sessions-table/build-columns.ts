import { type ColumnDef } from "@tanstack/react-table";

import type { CustomColumn } from "@/components/ui/columns-menu/types";
import { type SessionRow } from "@/lib/traces/types";

import { columns } from "./columns";

interface SessionsCustomColumnPayload {
  id: string;
  sql: string;
  dbType: "String" | "Float64";
}

/** Static columns plus the view's custom columns (per-trace SQL, first non-empty value per session). */
export function buildSessionColumnDefs(customColumns: CustomColumn[]): ColumnDef<SessionRow>[] {
  const custom: ColumnDef<SessionRow>[] = customColumns.map((cc) => ({
    id: `custom:${cc.name}`,
    accessorFn: (row) => (row as Record<string, unknown>)[`custom:${cc.name}`],
    header: cc.name,
    enableSorting: true,
    meta: { sql: cc.sql, dataType: cc.dataType, isCustom: true },
  }));
  return [...columns, ...custom];
}

/** JSON for the sessions API's `customColumns` param. */
export function customColumnsParam(customColumns: CustomColumn[]): string | undefined {
  if (customColumns.length === 0) return undefined;
  const payload: SessionsCustomColumnPayload[] = customColumns.map((cc) => ({
    id: `custom:${cc.name}`,
    sql: cc.sql,
    dbType: cc.dataType === "number" ? "Float64" : "String",
  }));
  return JSON.stringify(payload);
}
