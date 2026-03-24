import { type ColumnDef } from "@tanstack/react-table";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { type ScoreRanges } from "@/components/evaluation/utils";
import { type CustomColumn } from "@/components/ui/columns-menu";
import { type EvalQueryColumn } from "@/lib/actions/evaluation/query-builder";
import { type EvalRow } from "@/lib/evaluation/types";

import { DataCell } from "./columns/data-cell";
import { createScoreColumnDef, STATIC_COLUMNS } from "./columns/index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Build a custom column def for evaluation from a CustomColumn descriptor. */
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

/** Build column defs from static + score + custom columns. */
export function buildEvalColumnDefs(
  scoreNames: string[],
  customColumns: CustomColumn[],
  isShared: boolean
): ColumnDef<EvalRow>[] {
  const scoreCols = scoreNames.map((name) => createScoreColumnDef(name));
  // Don't include custom columns in shared evaluations to prevent
  // browser-persisted custom SQL from being executed
  const customCols = isShared ? [] : customColumns.map(buildEvalCustomColumnDef);
  return [...STATIC_COLUMNS, ...scoreCols, ...customCols];
}

// ---------------------------------------------------------------------------
// URL param builders (pure functions that take columnDefs)
// ---------------------------------------------------------------------------

interface RawUrlParams {
  search: string | null;
  searchIn: string[];
  filter: string[];
  sortBy: string | null;
  sortDirection: string | null;
  targetId?: string | null;
}

export function buildEvalStatsParams(columnDefs: ColumnDef<EvalRow>[], raw: RawUrlParams): URLSearchParams {
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
}

export function buildEvalFetchParams(
  columnDefs: ColumnDef<EvalRow>[],
  raw: RawUrlParams & { pageNumber: number; pageSize: number }
): URLSearchParams {
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
}

// ---------------------------------------------------------------------------
// Selector: visible columns (excluding hidden & output-in-comparison)
// ---------------------------------------------------------------------------

export interface EvalStoreState {
  scoreRanges: ScoreRanges;
  heatmapEnabled: boolean;
  isComparison: boolean;
  isShared: boolean;
  /** Custom columns synced from the inner datatable store for outer fetch access. */
  customColumns: CustomColumn[];

  setScoreRanges: (ranges: ScoreRanges) => void;
  setHeatmapEnabled: (enabled: boolean) => void;
  setIsComparison: (value: boolean) => void;
  setIsShared: (value: boolean) => void;
  setCustomColumns: (columns: CustomColumn[]) => void;
}

/** Selector: visible columns, excluding output in comparison mode. Takes columnDefs + isComparison. */
export function selectVisibleEvalColumns(
  columnDefs: ColumnDef<EvalRow>[],
  isComparison: boolean
): ColumnDef<EvalRow>[] {
  return columnDefs.filter((c) => !c.meta?.hidden && !(isComparison && c.id === "output"));
}

export const useEvalStore = create<EvalStoreState>()(
  persist(
    (set) => ({
      scoreRanges: {},
      heatmapEnabled: false,
      isComparison: false,
      isShared: false,
      customColumns: [],

      setScoreRanges: (ranges) => set({ scoreRanges: ranges }),
      setHeatmapEnabled: (enabled) => set({ heatmapEnabled: enabled }),
      setIsComparison: (value) => set({ isComparison: value }),
      setIsShared: (value) => set({ isShared: value }),
      setCustomColumns: (columns) => set({ customColumns: columns }),
    }),
    {
      name: "evaluation-heatmap-enabled",
      partialize: (state) => ({ heatmapEnabled: state.heatmapEnabled }),
    }
  )
);
