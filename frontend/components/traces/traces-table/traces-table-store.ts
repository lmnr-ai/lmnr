import { type ColumnDef } from "@tanstack/react-table";
import { create } from "zustand";
import { persist } from "zustand/middleware";

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

interface TracesTableStoreState {
  columnDefs: ColumnDef<TraceRow>[];
  customColumns: CustomColumn[];

  rebuildColumns: () => void;
  addCustomColumn: (column: CustomColumn) => void;
  updateCustomColumn: (oldName: string, column: CustomColumn) => void;
  removeCustomColumn: (name: string) => void;
  buildFetchParams: (raw: RawUrlParams & { pageNumber: number; pageSize: number }) => URLSearchParams;
}

export const useTracesTableStore = create<TracesTableStoreState>()(
  persist(
    (set, get) => ({
      columnDefs: [],
      customColumns: [],

      rebuildColumns: () => {
        const { customColumns } = get();
        const customCols: ColumnDef<TraceRow>[] = customColumns.map((cc) => ({
          id: `custom:${cc.name}`,
          accessorFn: (row) => (row as Record<string, unknown>)[`custom:${cc.name}`],
          header: cc.name,
          enableSorting: true,
          meta: {
            sql: cc.sql,
            dataType: cc.dataType,
            isCustom: true,
          },
        }));
        set({ columnDefs: [...STATIC_COLUMNS, ...customCols] });
      },

      addCustomColumn: (column) => {
        const { customColumns } = get();
        if (customColumns.some((cc) => cc.name === column.name)) return;
        set({ customColumns: [...customColumns, column] });
        get().rebuildColumns();
      },

      updateCustomColumn: (oldName, column) => {
        const { customColumns } = get();
        set({ customColumns: customColumns.map((cc) => (cc.name === oldName ? column : cc)) });
        get().rebuildColumns();
      },

      removeCustomColumn: (name) => {
        const { customColumns } = get();
        set({ customColumns: customColumns.filter((cc) => cc.name !== name) });
        get().rebuildColumns();
      },

      buildFetchParams: (raw) => {
        const { columnDefs } = get();
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
      },
    }),
    {
      name: "traces-table-custom-columns",
      partialize: (state) => ({ customColumns: state.customColumns }),
    }
  )
);
