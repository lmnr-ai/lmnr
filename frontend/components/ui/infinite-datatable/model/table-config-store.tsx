"use client";

import { intersection, isEqual, pick } from "lodash";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { createStore, type StoreApi } from "zustand";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { type CustomColumn } from "@/components/ui/columns-menu";

export interface TableConfig {
  customColumns: CustomColumn[];
  columnOrder: string[];
  columnVisibility: Record<string, boolean>;
  columnSizing: Record<string, number>;
}

export type TableConfigStatus = "idle" | "loading" | "ready" | "error";

const EMPTY_CONFIG: TableConfig = {
  customColumns: [],
  columnOrder: [],
  columnVisibility: {},
  columnSizing: {},
};

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
  const newColumns = fullDefaultOrder.filter((col) => !validColumns.includes(col));
  const columnOrder = [...validColumns, ...newColumns];

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
  status: TableConfigStatus;
  error: Error | null;
  // Static — set at provider mount, never mutates.
  lockedColumns: string[];
  disableHideColumn: boolean;
  // Currently selected view id. `null` = no view (defaults).
  currentViewId: string | null;
}

export interface TableConfigStoreActions {
  setColumnOrder: (order: string[]) => void;
  setColumnVisibility: (visibility: Record<string, boolean>) => void;
  setColumnSizing: (sizing: Record<string, number>) => void;
  addCustomColumn: (column: CustomColumn) => void;
  updateCustomColumn: (oldName: string, column: CustomColumn) => void;
  removeCustomColumn: (name: string) => void;
  resetColumns: () => void;
  load: () => Promise<void>;
  discard: () => void;
  isDirty: () => boolean;
  selectView: (viewId: string | null, config: Partial<TableConfig>) => void;
  markSavedAs: (viewId: string | null) => void;
}

export type TableConfigStore = TableConfigStoreState & TableConfigStoreActions;

interface CreateOptions {
  defaults: Partial<TableConfig>;
  lockedColumns: string[];
  disableHideColumn: boolean;
  loadConfig?: () => Promise<Partial<TableConfig>>;
  enableDirtyTracking?: boolean;
}

function createTableConfigStore({
  defaults,
  lockedColumns,
  disableHideColumn,
  loadConfig,
  enableDirtyTracking = false,
}: CreateOptions): StoreApi<TableConfigStore> {
  // Without dirty tracking, every mutation is auto-promoted to baseline so
  // isDirty() stays false and no Save/Discard UI ever surfaces.
  const promoteBaseline = !enableDirtyTracking;

  return createStore<TableConfigStore>()((set, get) => {
    const initial = reconcileConfig(defaults, defaults).config;

    const writeConfig = (next: TableConfig) => {
      if (promoteBaseline) {
        set({ config: next, baseline: next });
      } else {
        set({ config: next });
      }
    };

    return {
      config: initial,
      baseline: initial,
      status: loadConfig ? "loading" : "ready",
      error: null,
      lockedColumns,
      disableHideColumn,
      currentViewId: null,

      setColumnOrder: (order) => writeConfig({ ...get().config, columnOrder: order }),
      setColumnVisibility: (visibility) => writeConfig({ ...get().config, columnVisibility: visibility }),
      setColumnSizing: (sizing) => writeConfig({ ...get().config, columnSizing: sizing }),

      addCustomColumn: (column) => {
        const { config } = get();
        if (config.customColumns.some((cc) => cc.name === column.name)) return;
        writeConfig({
          ...config,
          customColumns: [...config.customColumns, column],
          columnOrder: [...config.columnOrder, `custom:${column.name}`],
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
        writeConfig(next);
      },

      removeCustomColumn: (name) => {
        const { config } = get();
        const id = `custom:${name}`;
        const { [id]: _vis, ...restVisibility } = config.columnVisibility;
        const { [id]: _size, ...restSizing } = config.columnSizing;
        writeConfig({
          customColumns: config.customColumns.filter((cc) => cc.name !== name),
          columnOrder: config.columnOrder.filter((colId) => colId !== id),
          columnVisibility: restVisibility,
          columnSizing: restSizing,
        });
      },

      resetColumns: () => {
        writeConfig({
          ...get().config,
          columnOrder: defaults.columnOrder ?? [],
          columnVisibility: {},
          columnSizing: {},
        });
      },

      load: async () => {
        if (!loadConfig) return;
        set({ status: "loading", error: null });
        try {
          const loaded = await loadConfig();
          const { config: next } = reconcileConfig(loaded, defaults);
          set({ config: next, baseline: next, status: "ready" });
        } catch (err) {
          set({ status: "error", error: err instanceof Error ? err : new Error(String(err)) });
        }
      },

      discard: () => set({ config: get().baseline, status: "ready", error: null }),

      isDirty: () => !isEqual(get().config, get().baseline),

      selectView: (viewId, loaded) => {
        const { config: next } = reconcileConfig(loaded, defaults);
        set({ currentViewId: viewId, config: next, baseline: next, status: "ready", error: null });
      },

      markSavedAs: (viewId) => {
        set({ currentViewId: viewId, baseline: get().config, status: "ready", error: null });
      },
    };
  });
}

type TableConfigStoreApi = ReturnType<typeof createTableConfigStore>;

const TableConfigContext = createContext<TableConfigStoreApi | undefined>(undefined);

export interface TableConfigProviderProps {
  children: ReactNode;
  defaults?: Partial<TableConfig>;
  lockedColumns?: string[];
  disableHideColumn?: boolean;
  loadConfig?: () => Promise<Partial<TableConfig>>;
  enableDirtyTracking?: boolean;
  fallback?: ReactNode;
}

export function TableConfigProvider({
  children,
  defaults = EMPTY_CONFIG,
  lockedColumns = [],
  disableHideColumn = false,
  loadConfig,
  enableDirtyTracking,
  fallback,
}: TableConfigProviderProps) {
  const [store] = useState(() =>
    createTableConfigStore({ defaults, lockedColumns, disableHideColumn, loadConfig, enableDirtyTracking })
  );
  // Track whether the first load has completed so subsequent reloads keep
  // children mounted (only the very first load gates rendering).
  const [hasLoadedOnce, setHasLoadedOnce] = useState(!loadConfig);

  // Side-effect: kick off the initial load on mount. Subsequent reloads (from
  // consumer code calling `store.load()` directly) keep children mounted —
  // only the very first load gates rendering, via `hasLoadedOnce`.
  useEffect(() => {
    if (!loadConfig) return;
    void store
      .getState()
      .load()
      .finally(() => setHasLoadedOnce(true));
    // store and loadConfig are captured at mount; we deliberately fire once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = useStoreWithEqualityFn(store, (s) => s.status);

  if (!hasLoadedOnce && status === "loading") {
    return <>{fallback ?? null}</>;
  }

  return <TableConfigContext.Provider value={store}>{children}</TableConfigContext.Provider>;
}

export function useTableConfigStore(): TableConfigStoreApi {
  const store = useContext(TableConfigContext);
  if (!store) {
    throw new Error("useTableConfigStore must be used within TableConfigProvider");
  }
  return store;
}

/** Memoized selector for the persisted column config. */
export function useColumnConfig(): TableConfig {
  const store = useTableConfigStore();
  return useStoreWithEqualityFn(store, (s) => s.config, shallow);
}
