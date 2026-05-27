"use client";

import { intersection, isEqual, pick } from "lodash";
import { createContext, type ReactNode, useContext, useState } from "react";
import { createStore, type StoreApi } from "zustand";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { type CustomColumn } from "@/components/ui/columns-menu";
import { type Filter } from "@/lib/actions/common/filters";

import { EMPTY_VIEW_PARAMS, type ViewParams } from "../views/params";
import { type View } from "../views/types";

export interface TableConfig {
  customColumns: CustomColumn[];
  columnOrder: string[];
  columnVisibility: Record<string, boolean>;
  columnSizing: Record<string, number>;
}

const EMPTY_CONFIG: TableConfig = {
  customColumns: [],
  columnOrder: [],
  columnVisibility: {},
  columnSizing: {},
};

const NOOP = () => {};

// Pure helper: derive the effective render-time column order from persisted state.
// Pinned ids (intersected with available) come first, then persisted order,
// then any newly-available ids appended in their input order.
export function computeEffectiveOrder(persistedOrder: string[], availableIds: string[], pinned: string[]): string[] {
  const availableSet = new Set(availableIds);
  const pinnedSet = new Set(pinned);
  const placed = new Set<string>();

  const result: string[] = [];
  for (const id of pinned) {
    if (availableSet.has(id) && !placed.has(id)) {
      result.push(id);
      placed.add(id);
    }
  }
  for (const id of persistedOrder) {
    if (availableSet.has(id) && !pinnedSet.has(id) && !placed.has(id)) {
      result.push(id);
      placed.add(id);
    }
  }
  for (const id of availableIds) {
    if (!placed.has(id)) {
      result.push(id);
      placed.add(id);
    }
  }
  return result;
}

// Pure helper: merge a loaded config blob with defaults. Filters columnOrder /
// visibility / sizing down to ids known by the union of defaults + custom
// columns, and appends any new defaults at the end. `purged` is true when the
// loaded blob carried ids unknown to the current schema (drift) — appending
// new defaults at the end is NOT a purge.
//
// System column ids (`__`-prefixed, e.g. `__row_selection`) are stripped from
// persisted view configs by `normalizeViewConfig`, so they always show up as
// "new defaults" on load. Restore them at their default-order position
// instead of appending — the caller's `defaults.columnOrder` is authoritative
// for where they belong (typically the front).
export function reconcileConfig(
  loaded: Partial<TableConfig>,
  defaults: Partial<TableConfig>
): { config: TableConfig; purged: boolean } {
  const customColumns = loaded.customColumns ?? defaults.customColumns ?? [];
  const customColumnIds = customColumns.map((cc) => `custom:${cc.name}`);
  const fullDefaultOrder = [...(defaults.columnOrder ?? []), ...customColumnIds];
  const knownSet = new Set(fullDefaultOrder);

  const loadedOrder = loaded.columnOrder ?? [];
  const validColumns = intersection(loadedOrder, fullDefaultOrder);
  const newSystem = fullDefaultOrder.filter((id) => id.startsWith("__") && !validColumns.includes(id));
  const newRegular = fullDefaultOrder.filter((id) => !id.startsWith("__") && !validColumns.includes(id));
  const columnOrder = [...newSystem, ...validColumns, ...newRegular];

  const loadedVisibility = loaded.columnVisibility ?? defaults.columnVisibility ?? {};
  const loadedSizing = loaded.columnSizing ?? defaults.columnSizing ?? {};
  const columnVisibility = pick(loadedVisibility, fullDefaultOrder);
  const columnSizing = pick(loadedSizing, fullDefaultOrder);

  const purged =
    loadedOrder.some((id) => !knownSet.has(id)) ||
    Object.keys(loadedVisibility).some((id) => !knownSet.has(id)) ||
    Object.keys(loadedSizing).some((id) => !knownSet.has(id));

  return {
    config: { customColumns, columnOrder, columnVisibility, columnSizing },
    purged,
  };
}

export interface TableConfigStoreState {
  config: TableConfig;
  baseline: TableConfig;
  lockedColumns: string[];
  disableHideColumn: boolean;
  view: View | null;
  views: View[] | undefined;
  viewBaseline: ViewParams;
  effective: ViewParams;
  isViewLoading: boolean;
  isFormDirty: boolean;
}

export interface TableConfigStoreActions {
  setColumnOrder: (order: string[]) => void;
  setColumnVisibility: (visibility: Record<string, boolean>) => void;
  setColumnSizing: (sizing: Record<string, number>) => void;
  addCustomColumn: (column: CustomColumn) => void;
  updateCustomColumn: (oldName: string, column: CustomColumn) => void;
  removeCustomColumn: (name: string) => void;
  resetColumns: () => void;
  discard: () => void;
  isDirty: () => boolean;
  applyColumnsFromConfig: (config: Partial<TableConfig>) => void;
  markColumnsSaved: () => void;
  setFilters: (filters: Filter[]) => void;
  setSearch: (search: string) => void;
  setSearchAndFilters: (next: { filters: Filter[]; search: string }) => void;
  setSort: (sortBy: string | null, sortDirection: "asc" | "desc" | null) => void;
  selectView: (view: View | null) => void;
  markSavedAs: (viewId: string) => void;
  discardForm: () => void;
}

export type TableConfigStore = TableConfigStoreState & TableConfigStoreActions;

// Must be passed to createTableConfigStore (not applied via post-creation setState):
// Zustand's `useStore` reads `getInitialState` as the server snapshot during hydration,
// so a post-creation mutation would be invisible to the first render and produce a
// double fetch.
export interface InitialViewSeed {
  view: View | null;
  views: View[] | undefined;
  viewBaseline: ViewParams;
  effective: ViewParams;
  isViewLoading: boolean;
  isFormDirty: boolean;
  setFilters: (filters: Filter[]) => void;
  setSearch: (search: string) => void;
  setSearchAndFilters: (next: { filters: Filter[]; search: string }) => void;
  setSort: (sortBy: string | null, sortDirection: "asc" | "desc" | null) => void;
  selectView: (view: View | null) => void;
  markSavedAs: (viewId: string) => void;
  discardForm: () => void;
}

interface CreateOptions {
  defaults: Partial<TableConfig>;
  lockedColumns: string[];
  disableHideColumn: boolean;
  initialViewSeed?: InitialViewSeed;
}

export function createTableConfigStore({
  defaults,
  lockedColumns,
  disableHideColumn,
  initialViewSeed,
}: CreateOptions): StoreApi<TableConfigStore> {
  return createStore<TableConfigStore>()((set, get) => {
    const seedColumnConfig = initialViewSeed?.view?.config ?? defaults;
    const initial = reconcileConfig(seedColumnConfig, defaults).config;
    return {
      config: initial,
      baseline: initial,
      lockedColumns,
      disableHideColumn,
      view: initialViewSeed?.view ?? null,
      views: initialViewSeed?.views,
      viewBaseline: initialViewSeed?.viewBaseline ?? EMPTY_VIEW_PARAMS,
      effective: initialViewSeed?.effective ?? EMPTY_VIEW_PARAMS,
      isViewLoading: initialViewSeed?.isViewLoading ?? false,
      isFormDirty: initialViewSeed?.isFormDirty ?? false,
      setFilters: initialViewSeed?.setFilters ?? NOOP,
      setSearch: initialViewSeed?.setSearch ?? NOOP,
      setSearchAndFilters: initialViewSeed?.setSearchAndFilters ?? NOOP,
      setSort: initialViewSeed?.setSort ?? NOOP,
      selectView: initialViewSeed?.selectView ?? NOOP,
      markSavedAs: initialViewSeed?.markSavedAs ?? NOOP,
      discardForm: initialViewSeed?.discardForm ?? NOOP,

      setColumnOrder: (order) => set({ config: { ...get().config, columnOrder: order } }),
      setColumnVisibility: (visibility) => set({ config: { ...get().config, columnVisibility: visibility } }),
      setColumnSizing: (sizing) => set({ config: { ...get().config, columnSizing: sizing } }),

      addCustomColumn: (column) => {
        const { config } = get();
        if (config.customColumns.some((cc) => cc.name === column.name)) return;
        set({
          config: {
            ...config,
            customColumns: [...config.customColumns, column],
            columnOrder: [...config.columnOrder, `custom:${column.name}`],
          },
        });
      },

      updateCustomColumn: (oldName, column) => {
        const { config } = get();
        const oldId = `custom:${oldName}`;
        const newId = `custom:${column.name}`;
        const renamed = oldName !== column.name;
        const next: TableConfig = {
          ...config,
          customColumns: config.customColumns.map((cc) => (cc.name === oldName ? column : cc)),
        };
        if (renamed) {
          next.columnOrder = config.columnOrder.map((id) => (id === oldId ? newId : id));
          next.columnSizing = Object.fromEntries(
            Object.entries(config.columnSizing).map(([k, v]) => [k === oldId ? newId : k, v])
          );
          next.columnVisibility = Object.fromEntries(
            Object.entries(config.columnVisibility).map(([k, v]) => [k === oldId ? newId : k, v])
          );
        }
        set({ config: next });
      },

      removeCustomColumn: (name) => {
        const { config } = get();
        const id = `custom:${name}`;
        const { [id]: _vis, ...restVisibility } = config.columnVisibility;
        const { [id]: _size, ...restSizing } = config.columnSizing;
        set({
          config: {
            customColumns: config.customColumns.filter((cc) => cc.name !== name),
            columnOrder: config.columnOrder.filter((colId) => colId !== id),
            columnVisibility: restVisibility,
            columnSizing: restSizing,
          },
        });
      },

      resetColumns: () => {
        set({
          config: {
            ...get().config,
            columnOrder: defaults.columnOrder ?? [],
            columnVisibility: {},
            columnSizing: {},
          },
        });
      },

      discard: () => set({ config: get().baseline }),
      isDirty: () => !isEqual(get().config, get().baseline),

      applyColumnsFromConfig: (loaded) => {
        const { config: next } = reconcileConfig(loaded, defaults);
        set({ config: next, baseline: next });
      },

      markColumnsSaved: () => set({ baseline: get().config }),
    };
  });
}

export type TableConfigStoreApi = ReturnType<typeof createTableConfigStore>;

export const TableConfigContext = createContext<TableConfigStoreApi | undefined>(undefined);

export interface TableConfigProviderProps {
  children: ReactNode;
  defaults?: Partial<TableConfig>;
  lockedColumns?: string[];
  disableHideColumn?: boolean;
}

export function TableConfigProvider({
  children,
  defaults = EMPTY_CONFIG,
  lockedColumns = [],
  disableHideColumn = false,
}: TableConfigProviderProps) {
  const [store] = useState(() => createTableConfigStore({ defaults, lockedColumns, disableHideColumn }));
  return <TableConfigContext.Provider value={store}>{children}</TableConfigContext.Provider>;
}

export function useTableConfigStore<T>(
  selector: (state: TableConfigStore) => T,
  equalityFn?: (a: T, b: T) => boolean
): T {
  const store = useContext(TableConfigContext);
  if (!store) {
    throw new Error("useTableConfigStore must be used within TableConfigProvider");
  }
  return useStoreWithEqualityFn(store, selector, equalityFn);
}

export function useTableConfigStoreApi(): TableConfigStoreApi {
  const store = useContext(TableConfigContext);
  if (!store) {
    throw new Error("useTableConfigStoreApi must be used within TableConfigProvider");
  }
  return store;
}

/** Memoized selector for the persisted column config. */
export function useColumnConfig(): TableConfig {
  return useTableConfigStore((s) => s.config, shallow);
}

export interface TableViewSelection {
  view: View | null;
  views: View[] | undefined;
  baseline: ViewParams;
  effective: ViewParams;
  isLoading: boolean;
  isFormDirty: boolean;
  setFilters: (filters: Filter[]) => void;
  setSearch: (search: string) => void;
  setSearchAndFilters: (next: { filters: Filter[]; search: string }) => void;
  setSort: (sortBy: string | null, sortDirection: "asc" | "desc" | null) => void;
  selectView: (view: View | null) => void;
  markSavedAs: (viewId: string) => void;
  discardForm: () => void;
}

/** Memoized selector for the view-related slice. */
export function useTableView(): TableViewSelection {
  return useTableConfigStore(
    (s) => ({
      view: s.view,
      views: s.views,
      baseline: s.viewBaseline,
      effective: s.effective,
      isLoading: s.isViewLoading,
      isFormDirty: s.isFormDirty,
      setFilters: s.setFilters,
      setSearch: s.setSearch,
      setSearchAndFilters: s.setSearchAndFilters,
      setSort: s.setSort,
      selectView: s.selectView,
      markSavedAs: s.markSavedAs,
      discardForm: s.discardForm,
    }),
    shallow
  );
}
