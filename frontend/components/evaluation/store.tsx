"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { createContext, type ReactNode, useContext, useState } from "react";
import { createStore, type StoreApi } from "zustand";
import { persist } from "zustand/middleware";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { type ScoreRanges } from "@/components/evaluation/utils";
import { type CustomColumn } from "@/components/ui/columns-menu";
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

export interface EvalStoreState {
  // Data
  scoreRanges: ScoreRanges;
  heatmapEnabled: boolean;
  isComparison: boolean;
  isShared: boolean;
  columnDefs: ColumnDef<EvalRow>[];
  customColumns: CustomColumn[];
  /**
   * Single source of truth for the list of score names belonging to the
   * current evaluation. Seeded by the page (server-side
   * `getEvaluationScoreNames`) at provider creation, and grown by realtime
   * events. Drives the score columns in the table, the score selector in
   * the score card, and any consumer that needs to enumerate scores.
   */
  scoreNames: string[];

  // Actions
  setScoreRanges: (ranges: ScoreRanges) => void;
  setHeatmapEnabled: (enabled: boolean) => void;
  setIsComparison: (value: boolean) => void;
  /** Append a single score name if not present. Triggers a column rebuild. */
  addScoreName: (name: string) => void;
  addCustomColumn: (column: CustomColumn) => void;
  updateCustomColumn: (oldName: string, column: CustomColumn) => void;
  removeCustomColumn: (name: string) => void;
  buildStatsParams: (raw: RawUrlParams) => URLSearchParams;
  buildFetchParams: (raw: RawUrlParams & { pageNumber: number; pageSize: number }) => URLSearchParams;
}

export const selectVisibleColumns = (s: EvalStoreState): ColumnDef<EvalRow>[] =>
  s.columnDefs.filter((c) => !c.meta?.hidden && !(s.isComparison && c.id === "output"));

function buildColumnDefs({
  scoreNames,
  customColumns,
  isShared,
}: Pick<EvalStoreState, "scoreNames" | "customColumns" | "isShared">): ColumnDef<EvalRow>[] {
  const scoreCols = scoreNames.map((name) => createScoreColumnDef(name));

  // Don't include custom columns in shared evaluations to prevent
  // browser-persisted custom SQL from being executed.
  const customCols: ColumnDef<EvalRow>[] = isShared
    ? []
    : customColumns.map((cc) => ({
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
      }));
  return [...STATIC_COLUMNS, ...scoreCols, ...customCols];
}

export interface EvalStoreInit {
  initialScoreNames: string[];
  /** True for shared (public) evaluations. */
  isShared?: boolean;
}

type EvalStoreApi = StoreApi<EvalStoreState>;

function createEvalStore({ initialScoreNames, isShared = false }: EvalStoreInit): EvalStoreApi {
  return createStore<EvalStoreState>()(
    persist(
      (set, get) => {
        const customColumns: CustomColumn[] = [];
        return {
          scoreRanges: {},
          heatmapEnabled: false,
          isComparison: false,
          isShared,
          customColumns,
          scoreNames: initialScoreNames,
          columnDefs: buildColumnDefs({
            scoreNames: initialScoreNames,
            customColumns,
            isShared,
          }),

          setScoreRanges: (ranges) => set({ scoreRanges: ranges }),
          setHeatmapEnabled: (enabled) => set({ heatmapEnabled: enabled }),
          setIsComparison: (value) => set({ isComparison: value }),

          addScoreName: (name) => {
            const { scoreNames } = get();
            if (scoreNames.includes(name)) return;
            const next = [...scoreNames, name];
            set({
              scoreNames: next,
              columnDefs: buildColumnDefs({ ...get(), scoreNames: next }),
            });
          },

          addCustomColumn: (column) => {
            const { customColumns } = get();
            if (customColumns.some((cc) => cc.name === column.name)) return;
            const next = [...customColumns, column];
            set({
              customColumns: next,
              columnDefs: buildColumnDefs({ ...get(), customColumns: next }),
            });
          },

          updateCustomColumn: (oldName, column) => {
            const next = get().customColumns.map((cc) => (cc.name === oldName ? column : cc));
            set({
              customColumns: next,
              columnDefs: buildColumnDefs({ ...get(), customColumns: next }),
            });
          },

          removeCustomColumn: (name) => {
            const next = get().customColumns.filter((cc) => cc.name !== name);
            set({
              customColumns: next,
              columnDefs: buildColumnDefs({ ...get(), customColumns: next }),
            });
          },

          buildStatsParams: (raw) => {
            const { columnDefs, scoreNames } = get();
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
              const filterColPayload: EvalQueryColumn[] = [];
              filterIds.forEach((id) => {
                if (id.startsWith("score:")) {
                  const name = id.slice("score:".length);
                  if (!scoreNames.includes(name)) return;
                  filterColPayload.push({
                    id,
                    sql: `simpleJSONExtractFloat(scores, '${name.replace(/[\\']/g, "\\$&")}')`,
                    comparable: true,
                    dbType: "Float64",
                  });
                  return;
                }
                const col = columnDefs.find((c) => c.id === id);
                if (col?.meta?.sql) {
                  filterColPayload.push({
                    id: col.id!,
                    sql: col.meta.sql,
                    comparable: col.meta.comparable ?? false,
                    ...(col.meta.filterSql && { filterSql: col.meta.filterSql }),
                    ...(col.meta.dbType && { dbType: col.meta.dbType }),
                  });
                }
              });
              urlParams.set("columns", JSON.stringify(filterColPayload));
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
        };
      },
      {
        name: "evaluation-store",
        partialize: (state) => ({
          heatmapEnabled: state.heatmapEnabled,
          customColumns: state.customColumns,
        }),
        merge: (persisted, current) => {
          const merged = { ...current, ...(persisted as Partial<EvalStoreState>) };
          return {
            ...merged,
            columnDefs: buildColumnDefs(merged),
          };
        },
      }
    )
  );
}

const EvalStoreContext = createContext<EvalStoreApi | null>(null);

interface EvalStoreProviderProps extends EvalStoreInit {
  children: ReactNode;
}

export function EvalStoreProvider({ children, initialScoreNames, isShared }: EvalStoreProviderProps) {
  const [store] = useState(() => createEvalStore({ initialScoreNames, isShared }));
  return <EvalStoreContext.Provider value={store}>{children}</EvalStoreContext.Provider>;
}

export function useEvalStore<T>(selector: (state: EvalStoreState) => T): T {
  const store = useContext(EvalStoreContext);
  if (!store) {
    throw new Error("useEvalStore must be used within EvalStoreProvider");
  }
  return useStoreWithEqualityFn(store, selector);
}

export function useEvalStoreApi(): EvalStoreApi {
  const store = useContext(EvalStoreContext);
  if (!store) {
    throw new Error("useEvalStoreApi must be used within EvalStoreProvider");
  }
  return store;
}
