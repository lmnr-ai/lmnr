import { type ColumnDef } from "@tanstack/react-table";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { type ScoreRanges } from "@/components/evaluation/utils";
import { type EvalQueryColumn } from "@/lib/actions/evaluation/query-builder";
import { type EvalRow } from "@/lib/evaluation/types";

import { createScoreColumnDef, STATIC_COLUMNS } from "./columns/index";

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

/** Filter to only visible (non-hidden) columns */
export function getVisibleColumns(columns: ColumnDef<EvalRow>[]): ColumnDef<EvalRow>[] {
  return columns.filter((c) => !c.meta?.hidden);
}

interface EvalStoreState {
  // Data
  scoreRanges: ScoreRanges;
  heatmapEnabled: boolean;
  isComparison: boolean;
  columnDefs: ColumnDef<EvalRow>[];

  // Actions
  setScoreRanges: (ranges: ScoreRanges) => void;
  setHeatmapEnabled: (enabled: boolean) => void;
  setIsComparison: (value: boolean) => void;
  rebuildColumns: (scoreNames: string[]) => void;
  buildStatsParams: (raw: RawUrlParams) => URLSearchParams;
  buildFetchParams: (raw: RawUrlParams & { pageNumber: number; pageSize: number }) => URLSearchParams;
}

export const useEvalStore = create<EvalStoreState>()(
  persist(
    (set, get) => ({
      scoreRanges: {},
      heatmapEnabled: false,
      isComparison: false,
      columnDefs: [],

      setScoreRanges: (ranges) => set({ scoreRanges: ranges }),

      setHeatmapEnabled: (enabled) => set({ heatmapEnabled: enabled }),

      setIsComparison: (value) => set({ isComparison: value }),

      rebuildColumns: (scoreNames) => {
        const scoreCols = scoreNames.map((name) => createScoreColumnDef(name));
        set({ columnDefs: [...STATIC_COLUMNS, ...scoreCols] });
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
      partialize: (state) => ({ heatmapEnabled: state.heatmapEnabled }),
    }
  )
);
