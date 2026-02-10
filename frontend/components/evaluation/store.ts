import { type ColumnDef } from "@tanstack/react-table";
import { create } from "zustand";

import { type ScoreRanges } from "@/components/evaluation/utils";
import { type EvalRow } from "@/lib/evaluation/types";

import {
  createComparisonScoreColumnDef,
  createScoreColumnDef,
  COMPARED_COST_COLUMN,
  COMPARED_DURATION_COLUMN,
  getVisibleStaticColumns,
} from "./columns/index";

interface EvalStoreState {
  // Data
  scoreRanges: ScoreRanges;
  heatmapEnabled: boolean;
  columnDefs: ColumnDef<EvalRow>[];
  isLoading: boolean;
  scoreNames: string[];

  // Actions
  setScoreRanges: (ranges: ScoreRanges) => void;
  setHeatmapEnabled: (enabled: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  /** Rebuild columns with current score names, heatmap, scoreRanges, and comparison mode */
  rebuildColumns: (opts: {
    scoreNames: string[];
    heatmapEnabled: boolean;
    scoreRanges: ScoreRanges;
    isComparison: boolean;
    disableLongTooltips?: boolean;
  }) => void;
}

export const useEvalStore = create<EvalStoreState>((set) => ({
  scoreRanges: {},
  heatmapEnabled: false,
  columnDefs: getVisibleStaticColumns(),
  isLoading: false,
  scoreNames: [],

  setScoreRanges: (ranges) => set({ scoreRanges: ranges }),
  setHeatmapEnabled: (enabled) => set({ heatmapEnabled: enabled }),
  setIsLoading: (loading) => set({ isLoading: loading }),

  rebuildColumns: ({ scoreNames, heatmapEnabled, scoreRanges, isComparison }) => {
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
