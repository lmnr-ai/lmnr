import { type ColumnDef } from "@tanstack/react-table";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { type ScoreRanges } from "@/components/evaluation/utils";
import { type CustomColumn } from "@/components/ui/infinite-datatable/model/datatable-store";
import { type EvalQueryColumn } from "@/lib/actions/evaluation/query-builder";
import { type EvalRow } from "@/lib/evaluation/types";

import { DataCell } from "./columns/data-cell";
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

export function buildEvalCustomColumnDef(cc: CustomColumn): ColumnDef<EvalRow> {
  return {
    id: `custom:${cc.name}`,
    accessorFn: (row) => row[`custom:${cc.name}`],
    cell: DataCell,
    header: cc.name,
    enableSorting: true,
    meta: {
      sql: cc.sql,
      dataType: cc.dataType,
      filterable: true,
      comparable: true,
      isCustom: true,
    },
  };
}

/** Build the full static + score column defs for a given set of score names. */
export function buildEvalColumnDefs(scoreNames: string[]): ColumnDef<EvalRow>[] {
  const scoreCols = scoreNames.map((name) => createScoreColumnDef(name));
  return [...STATIC_COLUMNS, ...scoreCols];
}

interface EvalStoreState {
  scoreRanges: ScoreRanges;
  heatmapEnabled: boolean;
  isComparison: boolean;
  isShared: boolean;

  setScoreRanges: (ranges: ScoreRanges) => void;
  setHeatmapEnabled: (enabled: boolean) => void;
  setIsComparison: (value: boolean) => void;
  setIsShared: (value: boolean) => void;
  buildStatsParams: (raw: RawUrlParams, allColumnDefs: ColumnDef<EvalRow>[]) => URLSearchParams;
  buildFetchParams: (
    raw: RawUrlParams & { pageNumber: number; pageSize: number },
    allColumnDefs: ColumnDef<EvalRow>[]
  ) => URLSearchParams;
}

export const useEvalStore = create<EvalStoreState>()(
  persist(
    (set) => ({
      scoreRanges: {},
      heatmapEnabled: false,
      isComparison: false,
      isShared: false,

      setScoreRanges: (ranges) => set({ scoreRanges: ranges }),

      setHeatmapEnabled: (enabled) => set({ heatmapEnabled: enabled }),

      setIsComparison: (value) => set({ isComparison: value }),

      setIsShared: (value) => set({ isShared: value }),

      buildStatsParams: (raw, allColumnDefs) => {
        const urlParams = new URLSearchParams();
        if (raw.search) urlParams.set("search", raw.search);
        raw.searchIn.forEach((v) => urlParams.append("searchIn", v));
        raw.filter.forEach((f) => urlParams.append("filter", f));

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
          const filterCols = allColumnDefs.filter((c) => filterIds.has(c.id!));
          urlParams.set("columns", JSON.stringify(toColumnsPayload(filterCols)));
        }

        return urlParams;
      },

      buildFetchParams: (raw, allColumnDefs) => {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", raw.pageNumber.toString());
        urlParams.set("pageSize", raw.pageSize.toString());
        if (raw.search) urlParams.set("search", raw.search);
        raw.searchIn.forEach((v) => urlParams.append("searchIn", v));
        raw.filter.forEach((f) => urlParams.append("filter", f));

        urlParams.set("columns", JSON.stringify(toColumnsPayload(allColumnDefs)));

        if (raw.sortBy) {
          urlParams.set("sortBy", raw.sortBy);
          const col = allColumnDefs.find((c) => c.id === raw.sortBy);
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
