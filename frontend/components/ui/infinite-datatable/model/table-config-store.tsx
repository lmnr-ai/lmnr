"use client";

import { intersection, isEqual, pick } from "lodash";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { createStore, type StoreApi } from "zustand";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { Button } from "@/components/ui/button.tsx";
import { type CustomColumn } from "@/components/ui/columns-menu";

export interface TableConfig {
  customColumns: CustomColumn[];
  columnOrder: string[];
  columnVisibility: Record<string, boolean>;
  columnSizing: Record<string, number>;
}

export type TableConfigStatus = "idle" | "loading" | "ready" | "saving" | "error";

const EMPTY_CONFIG: TableConfig = {
  customColumns: [],
  columnOrder: [],
  columnVisibility: {},
  columnSizing: {},
};

// Pure helper: derive the effective render-time column order from persisted state.
// Pinned ids (intersected with available) come first, then persisted order,
// then any newly-available ids appended in their input order.
export function computeEffectiveOrder(
  persistedOrder: string[],
  availableIds: string[],
  pinned: string[]
): string[] {
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
// columns, and appends any new defaults at the end.
export function reconcileConfig(loaded: Partial<TableConfig>, defaults: Partial<TableConfig>): TableConfig {
  const customColumns = loaded.customColumns ?? defaults.customColumns ?? [];
  const customColumnIds = customColumns.map((cc) => `custom:${cc.name}`);
  const fullDefaultOrder = [...(defaults.columnOrder ?? []), ...customColumnIds];

  const validColumns = intersection(loaded.columnOrder ?? [], fullDefaultOrder);
  const newColumns = fullDefaultOrder.filter((col) => !validColumns.includes(col));
  const columnOrder = [...validColumns, ...newColumns];
  const columnVisibility = pick(loaded.columnVisibility ?? defaults.columnVisibility ?? {}, fullDefaultOrder);
  const columnSizing = pick(loaded.columnSizing ?? defaults.columnSizing ?? {}, fullDefaultOrder);

  return { customColumns, columnOrder, columnVisibility, columnSizing };
}

export interface TableConfigStoreState {
  config: TableConfig;
  baseline: TableConfig;
  status: TableConfigStatus;
  error: Error | null;
  // Static — set at provider mount, never mutates.
  lockedColumns: string[];
  disableHideColumn: boolean;
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
  save: () => Promise<void>;
  discard: () => void;
  isDirty: () => boolean;
}

export type TableConfigStore = TableConfigStoreState & TableConfigStoreActions;

interface CreateOptions {
  defaults: Partial<TableConfig>;
  lockedColumns: string[];
  disableHideColumn: boolean;
  loadConfig?: () => Promise<Partial<TableConfig>>;
  saveConfig?: (config: TableConfig) => Promise<void>;
}

function createTableConfigStore({
  defaults,
  lockedColumns,
  disableHideColumn,
  loadConfig,
  saveConfig,
}: CreateOptions): StoreApi<TableConfigStore> {
  // Closure-scoped controller — aborted by a subsequent save() call.
  let saveAbort: AbortController | null = null;

  // When saveConfig is omitted, every mutation is treated as immediately persisted
  // so isDirty() stays false and no Save/Discard UI ever surfaces.
  const promoteBaseline = !saveConfig;

  return createStore<TableConfigStore>()((set, get) => {
    const initial = reconcileConfig(defaults, defaults);

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
          const next = reconcileConfig(loaded, defaults);
          set({ config: next, baseline: next, status: "ready" });
        } catch (err) {
          set({ status: "error", error: err instanceof Error ? err : new Error(String(err)) });
        }
      },

      save: async () => {
        if (!saveConfig) return;

        // Replace any in-flight save — the new snapshot supersedes it.
        if (saveAbort) saveAbort.abort();
        const controller = new AbortController();
        saveAbort = controller;

        const snapshot = get().config;
        set({ status: "saving", error: null });
        try {
          await saveConfig(snapshot);
          if (controller.signal.aborted) return;
          // Don't promote `get().config` — user may have edited during the request.
          set({ baseline: snapshot, status: "ready" });
        } catch (err) {
          if (controller.signal.aborted) return;
          set({ status: "error", error: err instanceof Error ? err : new Error(String(err)) });
        } finally {
          if (saveAbort === controller) saveAbort = null;
        }
      },

      discard: () => set({ config: get().baseline, status: "ready", error: null }),

      isDirty: () => !isEqual(get().config, get().baseline),
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
  saveConfig?: (config: TableConfig) => Promise<void>;
  fallback?: ReactNode;
}

export function TableConfigProvider({
  children,
  defaults = EMPTY_CONFIG,
  lockedColumns = [],
  disableHideColumn = false,
  loadConfig,
  saveConfig,
  fallback,
}: TableConfigProviderProps) {
  const [store] = useState(() =>
    createTableConfigStore({ defaults, lockedColumns, disableHideColumn, loadConfig, saveConfig })
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

interface ConfigDirtyBarProps {
  className?: string;
}

/** Save / Discard pair that surfaces when config diverges from baseline.
 * Not mounted by any caller in this PR — wire up once a saveConfig backend exists. */
export function ConfigDirtyBar({ className }: ConfigDirtyBarProps) {
  const store = useTableConfigStore();
  const { status, dirty, save, discard } = useStoreWithEqualityFn(
    store,
    (s) => ({ status: s.status, dirty: s.isDirty(), save: s.save, discard: s.discard }),
    shallow
  );

  if (!dirty) return null;
  const isSaving = status === "saving";

  return (
    <div className={className} role="region" aria-label="Unsaved column changes">
      <span className="text-xs text-secondary-foreground mr-2">Unsaved changes</span>
      <Button size="sm" variant="ghost" disabled={isSaving} onClick={discard}>
        Discard
      </Button>
      <Button size="sm" disabled={isSaving} onClick={save}>
        {isSaving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
