import { type ColumnDef } from "@tanstack/react-table";
import { create } from "zustand";

import { type CustomColumn } from "@/components/ui/infinite-datatable/model/datatable-store";
import { type TraceRow } from "@/lib/traces/types";

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

export function buildCustomColumnDef(cc: CustomColumn): ColumnDef<TraceRow> {
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

interface TracesTableStoreState {
  buildFetchParams: (
    raw: RawUrlParams & { pageNumber: number; pageSize: number },
    allColumnDefs: ColumnDef<TraceRow>[]
  ) => URLSearchParams;
}

export const useTracesTableStore = create<TracesTableStoreState>()(() => ({
  buildFetchParams: (raw, allColumnDefs) => {
    const urlParams = new URLSearchParams();
    urlParams.set("pageNumber", raw.pageNumber.toString());
    urlParams.set("pageSize", raw.pageSize.toString());
    raw.filter.forEach((f) => urlParams.append("filter", f));

    const customCols = toColumnsPayload(allColumnDefs.filter((c) => c.meta?.isCustom));
    if (customCols.length > 0) {
      urlParams.set("customColumns", JSON.stringify(customCols));
    }

    if (raw.sortBy) {
      urlParams.set("sortBy", raw.sortBy);
      const col = allColumnDefs.find((c) => c.id === raw.sortBy);
      if (col?.meta?.sql) urlParams.set("sortSql", col.meta.sql);
    }
    if (raw.sortDirection) urlParams.set("sortDirection", raw.sortDirection);

    return urlParams;
  },
}));
