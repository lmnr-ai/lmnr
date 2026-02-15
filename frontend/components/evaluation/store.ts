import { type ColumnDef } from "@tanstack/react-table";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { type ScoreRanges } from "@/components/evaluation/utils";
import { type EvalQueryColumn } from "@/lib/actions/evaluation/query-builder";
import { type EvalRow } from "@/lib/evaluation/types";

import { DataCell } from "./columns/data-cell";
import { createScoreColumnDef, STATIC_COLUMNS } from "./columns/index";

export type CustomColumn = { name: string; sql: string; dataType: "string" | "number" };

interface RawUrlParams {
  search: string | null;
  searchIn: string[];
  filter: string[];
  sortBy: string | null;
  sortDirection: string | null;
  targetId?: string | null;
}

function toColumnsPayload(columnDefs: ColumnDef<EvalRow>[]): EvalQueryColumn[] {
  return columnDefs
    .filter((c) => c.meta?.sql)
    .map((c) => ({
      id: c.id!,
      sql: c.meta!.sql!,
      comparable: c.meta!.comparable ?? false,
      ...(c.meta!.filterSql && { filterSql: c.meta!.filterSql }),
      ...(c.meta!.dbType && { dbType: c.meta!.dbType }),
    }));
}

interface EvalStoreState {
  // Data
  scoreRanges: ScoreRanges;
  heatmapEnabled: boolean;
  isComparison: boolean;
  isShared: boolean;
  columnDefs: ColumnDef<EvalRow>[];
  customColumns: CustomColumn[];
  lastScoreNames: string[];

  // Actions
  setScoreRanges: (ranges: ScoreRanges) => void;
  setHeatmapEnabled: (enabled: boolean) => void;
  setIsComparison: (value: boolean) => void;
  setIsShared: (value: boolean) => void;
  rebuildColumns: (scoreNames: string[]) => void;
  addCustomColumn: (column: CustomColumn) => void;
  updateCustomColumn: (oldName: string, column: CustomColumn) => void;
  removeCustomColumn: (name: string) => void;
  buildStatsParams: (raw: RawUrlParams) => URLSearchParams;
  buildFetchParams: (raw: RawUrlParams & { pageNumber: number; pageSize: number }) => URLSearchParams;
}

/** Selector: visible columns, excluding output in comparison mode */
export const selectVisibleColumns = (s: EvalStoreState): ColumnDef<EvalRow>[] =>
  s.columnDefs.filter((c) => !c.meta?.hidden && !(s.isComparison && c.id === "output"));

export const useEvalStore = create<EvalStoreState>()(
  persist(
    (set, get) => ({
      scoreRanges: {},
      heatmapEnabled: false,
      isComparison: false,
      isShared: false,
      columnDefs: [],
      customColumns: [],
      lastScoreNames: [],

      setScoreRanges: (ranges) => set({ scoreRanges: ranges }),

      setHeatmapEnabled: (enabled) => set({ heatmapEnabled: enabled }),

      setIsComparison: (value) => set({ isComparison: value }),

      setIsShared: (value) => set({ isShared: value }),

      rebuildColumns: (scoreNames) => {
        const { customColumns, isShared } = get();
        const scoreCols = scoreNames.map((name) => createScoreColumnDef(name));

        // Don't include custom columns in shared evaluations to prevent
        // browser-persisted custom SQL from being executed
        const customCols: ColumnDef<EvalRow>[] = isShared ? [] : customColumns.map((cc) => ({
          id: `custom:${cc.name}`,
          accessorFn: (row) => row[`custom:${cc.name}`],
          cell: DataCell,
          header: cc.name,
          enableSorting: true,
          meta: {
            sql: cc.sql,
            dataType: cc.dataType,
            filterable: true,
            comparable: false,
            isCustom: true,
          },
        }));
        set({ columnDefs: [...STATIC_COLUMNS, ...scoreCols, ...customCols], lastScoreNames: scoreNames });
      },

      addCustomColumn: (column) => {
        const { customColumns } = get();
        if (customColumns.some((cc) => cc.name === column.name)) return;
        set({ customColumns: [...customColumns, column] });
        get().rebuildColumns(get().lastScoreNames);
      },

      updateCustomColumn: (oldName, column) => {
        const { customColumns } = get();
        set({ customColumns: customColumns.map((cc) => (cc.name === oldName ? column : cc)) });
        get().rebuildColumns(get().lastScoreNames);
      },

      removeCustomColumn: (name) => {
        const { customColumns } = get();
        set({ customColumns: customColumns.filter((cc) => cc.name !== name) });
        get().rebuildColumns(get().lastScoreNames);
      },

      buildStatsParams: (raw) => {
        const { columnDefs } = get();
        const urlParams = new URLSearchParams();
        if (raw.search) urlParams.set("search", raw.search);
        raw.searchIn.forEach((v) => urlParams.append("searchIn", v));
        raw.filter.forEach((f) => urlParams.append("filter", f));

        // Only send columns referenced by active filters (optimization for URL length)
        const parsedFilters = raw.filter
          .map((f) => {
            try {
              return JSON.parse(f);
            } catch {
              return null;
            }
          })
          .filter(Boolean) as { column: string }[];
        if (parsedFilters.length > 0) {
          const filterIds = new Set(parsedFilters.map((f) => f.column));
          const filterCols = columnDefs.filter((c) => filterIds.has(c.id!));
          urlParams.set("columns", JSON.stringify(toColumnsPayload(filterCols)));
        }

        return urlParams;
      },

      buildFetchParams: (raw) => {
        const { columnDefs } = get();
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", raw.pageNumber.toString());
        urlParams.set("pageSize", raw.pageSize.toString());
        if (raw.search) urlParams.set("search", raw.search);
        raw.searchIn.forEach((v) => urlParams.append("searchIn", v));
        raw.filter.forEach((f) => urlParams.append("filter", f));

        // Full columns payload derived directly from column defs
        urlParams.set("columns", JSON.stringify(toColumnsPayload(columnDefs)));

        // Sort — resolve SQL from column meta
        if (raw.sortBy) {
          urlParams.set("sortBy", raw.sortBy);
          const col = columnDefs.find((c) => c.id === raw.sortBy);
          if (col?.meta?.sql) urlParams.set("sortSql", col.meta.sql);
        }
        if (raw.sortDirection) urlParams.set("sortDirection", raw.sortDirection);
        if (raw.targetId) urlParams.set("targetId", raw.targetId);

        return urlParams;
      },
    }),
    {
      name: "evaluation-heatmap-enabled",
      partialize: (state) => ({ heatmapEnabled: state.heatmapEnabled, customColumns: state.customColumns }),
    }
  )
);
