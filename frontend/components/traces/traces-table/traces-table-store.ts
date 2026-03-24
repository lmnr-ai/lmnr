import { type ColumnDef } from "@tanstack/react-table";

import { type CustomColumn } from "@/components/ui/columns-menu";
import { type TraceRow } from "@/lib/traces/types";

import { STATIC_COLUMNS } from "./columns";

export interface TracesQueryColumn {
  id: string;
  sql: string;
  filterSql?: string;
  dbType?: string;
}

interface RawUrlParams {
  filter: string[];
  sortBy: string | null;
  sortDirection: string | null;
}

function toColumnsPayload(columnDefs: ColumnDef<TraceRow>[]): TracesQueryColumn[] {
  return columnDefs
    .filter((c) => c.meta?.sql)
    .map((c) => ({
      id: c.id!,
      sql: c.meta!.sql!,
      ...(c.meta!.filterSql && { filterSql: c.meta!.filterSql }),
      ...(c.meta!.dbType && { dbType: c.meta!.dbType }),
    }));
}

/** Build a trace custom column def from a CustomColumn descriptor. */
export function buildTracesCustomColumnDef(cc: CustomColumn): ColumnDef<TraceRow> {
  return {
    id: `custom:${cc.name}`,
    accessorFn: (row) => (row as Record<string, unknown>)[`custom:${cc.name}`],
    header: cc.name,
    enableSorting: true,
    meta: {
      sql: cc.sql,
      dataType: cc.dataType,
      isCustom: true,
    },
  };
}

/** Build the initial column defs from static columns + any persisted custom columns. */
export function buildTracesColumnDefs(customColumns: CustomColumn[]): ColumnDef<TraceRow>[] {
  const customCols = customColumns.map(buildTracesCustomColumnDef);
  return [...STATIC_COLUMNS, ...customCols];
}

/** Build URL params for fetching traces, given column defs from the datatable store. */
export function buildTracesFetchParams(
  columnDefs: ColumnDef<TraceRow>[],
  raw: RawUrlParams & { pageNumber: number; pageSize: number }
): URLSearchParams {
  const urlParams = new URLSearchParams();
  urlParams.set("pageNumber", raw.pageNumber.toString());
  urlParams.set("pageSize", raw.pageSize.toString());
  raw.filter.forEach((f) => urlParams.append("filter", f));

  // Send custom columns payload
  const customCols = toColumnsPayload(columnDefs.filter((c) => c.meta?.isCustom));
  if (customCols.length > 0) {
    urlParams.set("customColumns", JSON.stringify(customCols));
  }

  // Sort — resolve SQL from column meta
  if (raw.sortBy) {
    urlParams.set("sortBy", raw.sortBy);
    const col = columnDefs.find((c) => c.id === raw.sortBy);
    if (col?.meta?.sql) urlParams.set("sortSql", col.meta.sql);
  }
  if (raw.sortDirection) urlParams.set("sortDirection", raw.sortDirection);

  return urlParams;
}
