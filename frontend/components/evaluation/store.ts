import { type ColumnDef } from "@tanstack/react-table";
import { create } from "zustand";

import { type ScoreRanges } from "@/components/evaluation/utils";
import { type EvalQueryColumn } from "@/lib/actions/evaluation/query-builder";
import { type EvalRow } from "@/lib/evaluation/types";

import {
  COMPARED_COST_COLUMN,
  COMPARED_DURATION_COLUMN,
  createComparisonScoreColumnDef,
  createScoreColumnDef,
  getSortSql,
  STATIC_COLUMNS,
} from "./columns/index";

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
  columnDefs: ColumnDef<EvalRow>[];

  // Actions
  setScoreRanges: (ranges: ScoreRanges) => void;
  setHeatmapEnabled: (enabled: boolean) => void;
  rebuildColumns: (opts: { scoreNames: string[]; isComparison: boolean }) => void;
  buildStatsParams: (raw: RawUrlParams) => URLSearchParams;
  buildFetchParams: (raw: RawUrlParams & { pageNumber: number; pageSize: number }) => URLSearchParams;
}

export const useEvalStore = create<EvalStoreState>((set, get) => ({
  scoreRanges: {},
  heatmapEnabled:
    typeof window !== "undefined"
      ? (() => {
          try {
            return JSON.parse(localStorage.getItem("evaluation-heatmap-enabled") ?? "false");
          } catch {
            return false;
          }
        })()
      : false,
  columnDefs: [...STATIC_COLUMNS],

  setScoreRanges: (ranges) => set({ scoreRanges: ranges }),

  setHeatmapEnabled: (enabled) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("evaluation-heatmap-enabled", JSON.stringify(enabled));
    }
    set({ heatmapEnabled: enabled });
  },

  rebuildColumns: ({ scoreNames, isComparison }) => {
    // In comparison mode, override duration/cost with comparison renderers
    const baseCols = isComparison
      ? STATIC_COLUMNS.map((c) => {
          if (c.id === "duration") return COMPARED_DURATION_COLUMN;
          if (c.id === "cost") return COMPARED_COST_COLUMN;
          return c;
        })
      : [...STATIC_COLUMNS];

    // Add score columns
    const scoreCols = isComparison
      ? scoreNames.map((name) => createComparisonScoreColumnDef(name))
      : scoreNames.map((name) => createScoreColumnDef(name));

    set({ columnDefs: [...baseCols, ...scoreCols] });
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

    // Sort
    if (raw.sortBy) {
      urlParams.set("sortBy", raw.sortBy);
      const sql = getSortSql(raw.sortBy);
      if (sql) urlParams.set("sortSql", sql);
    }
    if (raw.sortDirection) urlParams.set("sortDirection", raw.sortDirection);
    if (raw.targetId) urlParams.set("targetId", raw.targetId);

    return urlParams;
  },
}));
