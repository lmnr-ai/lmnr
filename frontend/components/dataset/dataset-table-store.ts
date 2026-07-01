import { type ColumnDef } from "@tanstack/react-table";

import { type CustomColumn } from "@/components/ui/columns-menu";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
// Reuse the server-side wire contract (mirrors evaluation's EvalQueryColumn) so the
// payload shape lives in one place.
import { type CustomColumn as DatapointQueryColumn } from "@/lib/actions/datapoints/utils";
import { type Datapoint } from "@/lib/dataset/types";

interface RawUrlParams {
  filter: string[];
  searchQuery?: string | null;
}

export const datasetFilters: ColumnFilter[] = [
  { name: "ID", key: "id", dataType: "string" },
  { name: "Metadata", key: "metadata", dataType: "json" },
  { name: "Data", key: "data", dataType: "json" },
  { name: "Target", key: "target", dataType: "json" },
];

export function toColumnsPayload(columnDefs: ColumnDef<Datapoint>[]): DatapointQueryColumn[] {
  return columnDefs
    .filter((c) => c.meta?.sql)
    .map((c) => ({
      id: c.id!,
      sql: c.meta!.sql!,
      ...(c.meta!.filterSql && { filterSql: c.meta!.filterSql }),
      ...(c.meta!.dbType && { dbType: c.meta!.dbType }),
    }));
}

export function buildColumnDefs(
  columns: ColumnDef<Datapoint>[],
  customColumns: CustomColumn[]
): ColumnDef<Datapoint>[] {
  const customCols: ColumnDef<Datapoint>[] = customColumns.map((cc) => ({
    id: `custom:${cc.name}`,
    accessorFn: (row) => (row as unknown as Record<string, unknown>)[`custom:${cc.name}`],
    header: cc.name,
    size: 200,
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
  columnDefs: ColumnDef<Datapoint>[]
): URLSearchParams {
  const urlParams = new URLSearchParams();
  urlParams.set("pageNumber", raw.pageNumber.toString());
  urlParams.set("pageSize", raw.pageSize.toString());
  raw.filter.forEach((f) => urlParams.append("filter", f));

  if (raw.searchQuery) urlParams.set("searchQuery", raw.searchQuery);

  const customCols = toColumnsPayload(columnDefs.filter((c) => c.meta?.isCustom));
  if (customCols.length > 0) {
    urlParams.set("customColumns", JSON.stringify(customCols));
  }

  return urlParams;
}
