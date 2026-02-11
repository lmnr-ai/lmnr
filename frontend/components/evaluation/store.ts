import { type ColumnDef } from "@tanstack/react-table";
import { create } from "zustand";

import { type ScoreRanges } from "@/components/evaluation/utils";
import { type EvalRow } from "@/lib/evaluation/types";

import {
  buildColumnsPayload,
  buildFilterColumns,
  COMPARED_COST_COLUMN,
  COMPARED_DURATION_COLUMN,
  createComparisonScoreColumnDef,
  createScoreColumnDef,
  getSortSql,
  getVisibleStaticColumns,
} from "./columns/index";

interface RawUrlParams {
  search: string | null;
  searchIn: string[];
  filter: string[];
  sortBy: string | null;
  sortDirection: string | null;
  targetId?: string | null;
}

interface EvalStoreState {
  // Data
  scoreRanges: ScoreRanges;
  heatmapEnabled: boolean;
  columnDefs: ColumnDef<EvalRow>[];
  scoreNames: string[];

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
  columnDefs: getVisibleStaticColumns(),
  scoreNames: [],

  setScoreRanges: (ranges) => set({ scoreRanges: ranges }),

  setHeatmapEnabled: (enabled) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("evaluation-heatmap-enabled", JSON.stringify(enabled));
    }
    set({ heatmapEnabled: enabled });

    // Rebuild columns with new heatmap state
    const { scoreNames, columnDefs } = get();
    if (scoreNames.length > 0) {
      const isComparison = columnDefs.some((c) => c.id?.startsWith("comparedScore:"));
      get().rebuildColumns({ scoreNames, isComparison });
    }
  },

  rebuildColumns: ({ scoreNames, isComparison }) => {
    const { heatmapEnabled, scoreRanges } = get();
    const staticCols = getVisibleStaticColumns();

    // In comparison mode, override duration/cost with comparison renderers
    const baseCols = isComparison
      ? staticCols.map((c) => {
          if (c.id === "duration") return COMPARED_DURATION_COLUMN;
          if (c.id === "cost") return COMPARED_COST_COLUMN;
          return c;
        })
      : staticCols;

    // Add score columns
    const scoreCols = isComparison
      ? scoreNames.map((name) => createComparisonScoreColumnDef(name, heatmapEnabled, scoreRanges))
      : scoreNames.map((name) => createScoreColumnDef(name, heatmapEnabled, scoreRanges));

    set({
      columnDefs: [...baseCols, ...scoreCols],
      scoreNames,
    });
  },

  buildStatsParams: (raw) => {
    const urlParams = new URLSearchParams();
    if (raw.search) urlParams.set("search", raw.search);
    raw.searchIn.forEach((v) => urlParams.append("searchIn", v));
    raw.filter.forEach((f) => urlParams.append("filter", f));

    // Build filter-relevant columns for filter resolution
    const parsedFilters = raw.filter
      .map((f) => { try { return JSON.parse(f); } catch { return null; } })
      .filter(Boolean);
    if (parsedFilters.length > 0) {
      urlParams.set("columns", JSON.stringify(buildFilterColumns(parsedFilters)));
    }

    return urlParams;
  },

  buildFetchParams: (raw) => {
    const { scoreNames } = get();
    const urlParams = new URLSearchParams();
    urlParams.set("pageNumber", raw.pageNumber.toString());
    urlParams.set("pageSize", raw.pageSize.toString());
    if (raw.search) urlParams.set("search", raw.search);
    raw.searchIn.forEach((v) => urlParams.append("searchIn", v));
    raw.filter.forEach((f) => urlParams.append("filter", f));

    // Full columns payload (for SELECT + filter resolution)
    urlParams.set("columns", JSON.stringify(buildColumnsPayload(scoreNames)));

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
