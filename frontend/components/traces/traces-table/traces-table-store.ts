import { type ColumnDef } from "@tanstack/react-table";

import { type CustomColumn } from "@/components/ui/columns-menu";
import { type TraceRow } from "@/lib/traces/types";

import { columns } from "./columns";

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

export function toColumnsPayload(columnDefs: ColumnDef<TraceRow>[]): TracesQueryColumn[] {
  return columnDefs
    .filter((c) => c.meta?.sql)
    .map((c) => ({
      id: c.id!,
      sql: c.meta!.sql!,
      ...(c.meta!.filterSql && { filterSql: c.meta!.filterSql }),
      ...(c.meta!.dbType && { dbType: c.meta!.dbType }),
    }));
}

export function buildColumnDefs(customColumns: CustomColumn[]): ColumnDef<TraceRow>[] {
  const customCols: ColumnDef<TraceRow>[] = customColumns.map((cc) => ({
    id: `custom:${cc.name}`,
    accessorFn: (row) => (row as Record<string, unknown>)[`custom:${cc.name}`],
    header: cc.name,
    enableSorting: true,
    meta: {
      sql: cc.sql,
      dataType: cc.dataType,
      dbType: cc.dataType === "number" ? "Float64" : "String",
      isCustom: true,
    },
  }));
  return [...columns, ...customCols];
}

export function buildFetchParams(
  raw: RawUrlParams & { pageNumber: number; pageSize: number },
  columnDefs: ColumnDef<TraceRow>[]
): URLSearchParams {
  const urlParams = new URLSearchParams();
  urlParams.set("pageNumber", raw.pageNumber.toString());
  urlParams.set("pageSize", raw.pageSize.toString());
  raw.filter.forEach((f) => urlParams.append("filter", f));

  const customCols = toColumnsPayload(columnDefs.filter((c) => c.meta?.isCustom));
  if (customCols.length > 0) {
    urlParams.set("customColumns", JSON.stringify(customCols));
  }

  if (raw.sortBy) {
    urlParams.set("sortBy", raw.sortBy);
    const col = columnDefs.find((c) => c.id === raw.sortBy);
    if (col?.meta?.sql) urlParams.set("sortSql", col.meta.sql);
  }
  if (raw.sortDirection) urlParams.set("sortDirection", raw.sortDirection);

  return urlParams;
}
