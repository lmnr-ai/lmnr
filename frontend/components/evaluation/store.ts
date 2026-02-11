import { type ColumnDef } from "@tanstack/react-table";
import { create } from "zustand";

import { type ScoreRanges } from "@/components/evaluation/utils";
import { type EvalRow } from "@/lib/evaluation/types";

import {
  COMPARED_COST_COLUMN,
  COMPARED_DURATION_COLUMN,
  createComparisonScoreColumnDef,
  createScoreColumnDef,
  getVisibleStaticColumns,
} from "./columns/index";

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
}));
