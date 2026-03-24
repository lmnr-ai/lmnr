"use client";

import { type ColumnDef, type RowData } from "@tanstack/react-table";
import { intersection, pick, uniqBy } from "lodash";
import { createContext, type ReactNode, useContext, useState } from "react";
import { createStore, type StoreApi } from "zustand";
import { persist } from "zustand/middleware";

import { type CustomColumn } from "@/components/ui/columns-menu";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InfiniteScrollState<TData> {
  data: TData[];
  currentPage: number;
  isFetching: boolean;
  isLoading: boolean;
  error: Error | null;
  uniqueKey: string;
  hasMore: boolean;
  pageSize: number;
}

export interface InfiniteScrollActions<TData> {
  setData: (updater: (prev: TData[]) => TData[]) => void;
  setCurrentPage: (page: number) => void;
  setIsFetching: (fetching: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: Error | null) => void;
  setHasMore: (hasMore: boolean) => void;
  appendData: (items: TData[], count?: number) => void;
  replaceData: (items: TData[], count?: number) => void;
  resetInfiniteScroll: () => void;
}

export interface SelectionState {
  selectedRows: Set<string>;
  columnVisibility: Record<string, boolean>;
  columnOrder: string[];
  columnSizing: Record<string, number>;
  draggingColumnId: string | null;
}

export interface SelectionActions {
  selectRow: (id: string) => void;
  deselectRow: (id: string) => void;
  toggleRow: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  setColumnVisibility: (visibility: Record<string, boolean>) => void;
  setColumnOrder: (order: string[]) => void;
  setColumnSizing: (sizing: Record<string, number>) => void;
  setDraggingColumnId: (columnId: string | null) => void;
  resetColumns: () => void;
  getStorageKey: () => string;
}

export interface ColumnState<TData> {
  columnDefs: ColumnDef<TData>[];
  customColumns: CustomColumn[];
  lockedColumns: string[];
  /** Labels for all columns: visible (including dynamic) columns. */
  columnLabels: { id: string; label: string; onDelete?: () => void }[];
}

export interface ColumnActions<TData> {
  /** Replace the full column def list. Syncs columnOrder automatically. */
  setColumnDefs: (defs: ColumnDef<TData>[]) => void;
  addCustomColumn: (column: CustomColumn) => void;
  updateCustomColumn: (oldName: string, column: CustomColumn) => void;
  removeCustomColumn: (name: string) => void;
}

type DataTableStore<TData> = InfiniteScrollState<TData> &
  InfiniteScrollActions<TData> &
  SelectionState &
  SelectionActions &
  ColumnState<TData> &
  ColumnActions<TData>;

// ---------------------------------------------------------------------------
// Config passed to createStore via provider
// ---------------------------------------------------------------------------

export interface DataTableStoreConfig<TData> {
  uniqueKey?: string;
  pageSize?: number;
  storageKey?: string;
  defaultColumnOrder?: string[];
  lockedColumns?: string[];
  /** Initial column definitions (static). Can be updated later via setColumnDefs. */
  initialColumnDefs?: ColumnDef<TData>[];
  /** Derive a label for a column from its id. Falls back to column.header or column.id. */
  columnLabelFn?: (column: ColumnDef<TData>) => string;
  /** Build a custom ColumnDef from a CustomColumn. Consumer provides domain-specific accessors/cells. */
  buildCustomColumnDef?: (cc: CustomColumn) => ColumnDef<TData>;
  /** Initial custom columns (e.g. from persisted state). */
  initialCustomColumns?: CustomColumn[];
  /** Whether custom columns are enabled. Defaults to true. */
  enableCustomColumns?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultColumnLabel<TData>(col: ColumnDef<TData>): string {
  if (typeof col.header === "string") return col.header;
  return col.id ?? "";
}

function deriveColumnLabels<TData>(
  columnDefs: ColumnDef<TData>[],
  labelFn: (col: ColumnDef<TData>) => string,
  removeCustomColumn: (name: string) => void
): { id: string; label: string; onDelete?: () => void }[] {
  return columnDefs
    .filter((c) => !c.meta?.hidden)
    .map((c) => ({
      id: c.id!,
      label: labelFn(c),
      ...(c.id!.startsWith("custom:") && {
        onDelete: () => removeCustomColumn(c.id!.replace("custom:", "")),
      }),
    }));
}

/** Sync columnOrder when columnDefs change: keep existing order, append new, remove deleted. */
function syncColumnOrder(currentOrder: string[], visibleIds: string[]): string[] {
  const defSet = new Set(visibleIds);
  const currentSet = new Set(currentOrder);

  const toAdd = visibleIds.filter((id) => !currentSet.has(id));
  const toRemove = currentOrder.filter((id) => !defSet.has(id));

  if (toAdd.length === 0 && toRemove.length === 0) return currentOrder;

  const filtered = currentOrder.filter((id) => defSet.has(id));
  return [...filtered, ...toAdd];
}

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

function createDataTableStore<TData extends RowData>(
  config: DataTableStoreConfig<TData>
): StoreApi<DataTableStore<TData>> {
  const {
    uniqueKey = "id",
    pageSize = 50,
    storageKey,
    defaultColumnOrder = [],
    lockedColumns = [],
    initialColumnDefs = [],
    columnLabelFn = defaultColumnLabel,
    buildCustomColumnDef,
    initialCustomColumns = [],
    enableCustomColumns = true,
  } = config;

  const storeConfig = (
    set: StoreApi<DataTableStore<TData>>["setState"],
    get: StoreApi<DataTableStore<TData>>["getState"]
  ): DataTableStore<TData> => ({
    // -- Infinite scroll state --
    data: [],
    currentPage: 0,
    isFetching: false,
    isLoading: false,
    error: null,
    uniqueKey,
    hasMore: true,
    pageSize,

    // -- Selection / column UI state --
    columnVisibility: {},
    columnOrder: defaultColumnOrder,
    columnSizing: {},
    draggingColumnId: null,
    selectedRows: new Set(),

    // -- Column defs & custom columns --
    columnDefs: initialColumnDefs,
    customColumns: initialCustomColumns,
    lockedColumns,
    columnLabels: deriveColumnLabels(initialColumnDefs, columnLabelFn, (name) => get().removeCustomColumn(name)),

    // -- Infinite scroll actions --
    setData: (updater) => set((state) => ({ data: updater(state.data) })),
    setCurrentPage: (currentPage) => set({ currentPage }),
    setIsFetching: (isFetching) => set({ isFetching }),
    setIsLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),
    setHasMore: (hasMore) => set({ hasMore }),

    appendData: (items, _count) =>
      set((state) => {
        const combined = [...state.data, ...items];
        const uniqueData = uniqBy(combined, state.uniqueKey);
        return {
          data: uniqueData,
          isFetching: false,
          isLoading: false,
          error: null,
          hasMore: items.length >= state.pageSize,
        };
      }),

    replaceData: (items, _count) =>
      set((state) => ({
        data: uniqBy(items, state.uniqueKey),
        isFetching: false,
        isLoading: false,
        error: null,
        hasMore: items.length >= state.pageSize,
      })),

    resetInfiniteScroll: () =>
      set((state) => ({
        data: [],
        currentPage: 0,
        isFetching: false,
        isLoading: false,
        error: null,
        uniqueKey: state.uniqueKey,
        hasMore: true,
        pageSize: state.pageSize,
      })),

    // -- Selection actions --
    selectRow: (id) =>
      set((state) => {
        const newSelected = new Set(state.selectedRows);
        newSelected.add(id);
        return { selectedRows: newSelected };
      }),
    deselectRow: (id) =>
      set((state) => {
        const newSelected = new Set(state.selectedRows);
        newSelected.delete(id);
        return { selectedRows: newSelected };
      }),
    toggleRow: (id) =>
      set((state) => {
        const newSelected = new Set(state.selectedRows);
        if (newSelected.has(id)) {
          newSelected.delete(id);
        } else {
          newSelected.add(id);
        }
        return { selectedRows: newSelected };
      }),
    selectAll: (ids) => set({ selectedRows: new Set(ids) }),
    clearSelection: () => set({ selectedRows: new Set() }),

    // -- Column UI actions --
    setColumnVisibility: (visibility) => set({ columnVisibility: visibility }),
    setColumnOrder: (order) => set({ columnOrder: order }),
    setColumnSizing: (sizing) => set({ columnSizing: sizing }),
    setDraggingColumnId: (columnId) => set({ draggingColumnId: columnId }),
    resetColumns: () =>
      set((state) => {
        const visibleIds = state.columnDefs.filter((c) => !c.meta?.hidden).map((c) => c.id!);
        return {
          columnVisibility: {},
          columnOrder: visibleIds.length > 0 ? visibleIds : defaultColumnOrder,
          columnSizing: {},
        };
      }),
    getStorageKey: () => storageKey || "datatable",

    // -- Column def actions --
    setColumnDefs: (defs) =>
      set((state) => {
        const visibleIds = defs.filter((c) => !c.meta?.hidden).map((c) => c.id!);
        const newOrder = syncColumnOrder(state.columnOrder, visibleIds);
        return {
          columnDefs: defs,
          columnOrder: newOrder,
          columnLabels: deriveColumnLabels(defs, columnLabelFn, (name) => get().removeCustomColumn(name)),
        };
      }),

    addCustomColumn: (column) => {
      if (!enableCustomColumns) return;
      const { customColumns, columnDefs } = get();
      if (customColumns.some((cc) => cc.name === column.name)) return;
      const newCustomColumns = [...customColumns, column];
      set({ customColumns: newCustomColumns });
      if (buildCustomColumnDef) {
        const newDef = buildCustomColumnDef(column);
        get().setColumnDefs([...columnDefs, newDef]);
      }
    },

    updateCustomColumn: (oldName, column) => {
      if (!enableCustomColumns) return;
      const { customColumns, columnDefs } = get();
      const newCustomColumns = customColumns.map((cc) => (cc.name === oldName ? column : cc));
      set({ customColumns: newCustomColumns });
      if (buildCustomColumnDef) {
        const oldId = `custom:${oldName}`;
        const newDef = buildCustomColumnDef(column);
        const updatedDefs = columnDefs.map((c) => (c.id === oldId ? newDef : c));
        get().setColumnDefs(updatedDefs);
      }
    },

    removeCustomColumn: (name) => {
      if (!enableCustomColumns) return;
      const { customColumns, columnDefs, columnOrder, columnVisibility } = get();
      const columnId = `custom:${name}`;
      const newCustomColumns = customColumns.filter((cc) => cc.name !== name);
      const newDefs = columnDefs.filter((c) => c.id !== columnId);
      // Purge from columnOrder on delete
      const newOrder = columnOrder.filter((id) => id !== columnId);
      // Clean up visibility entry
      const { [columnId]: _, ...newVisibility } = columnVisibility;
      set({ customColumns: newCustomColumns, columnOrder: newOrder, columnVisibility: newVisibility });
      // Re-derive labels with new defs
      set({
        columnDefs: newDefs,
        columnLabels: deriveColumnLabels(newDefs, columnLabelFn, (n) => get().removeCustomColumn(n)),
      });
    },
  });

  if (storageKey) {
    return createStore<DataTableStore<TData>>()(
      persist(storeConfig, {
        name: storageKey,
        partialize: (state) => ({
          columnVisibility: state.columnVisibility,
          columnOrder: state.columnOrder,
          columnSizing: state.columnSizing,
          customColumns: state.customColumns,
        }),
        merge: (persistedState, currentState) => {
          const persisted = persistedState as Partial<
            Pick<SelectionState, "columnVisibility" | "columnOrder" | "columnSizing"> & {
              customColumns: CustomColumn[];
            }
          >;

          // Restore persisted custom columns first so their IDs remain valid during hydration.
          const restoredCustomColumns = persisted?.customColumns ?? currentState.customColumns;
          const restoredCustomIds = restoredCustomColumns.map((c) => `custom:${c.name}`);

          // Derive valid column IDs from current defs plus restored custom columns.
          const visibleIds = currentState.columnDefs.filter((c: any) => !c.meta?.hidden).map((c: any) => c.id!);
          const allValidIds = [
            ...new Set([
              ...((visibleIds.length > 0 ? visibleIds : defaultColumnOrder) as string[]),
              ...restoredCustomIds,
            ]),
          ];

          const validColumns = intersection(persisted?.columnOrder ?? [], allValidIds);
          const newColumns = allValidIds.filter((col: string) => !validColumns.includes(col));
          const mergedColumnOrder = [...validColumns, ...newColumns];
          const filteredColumnVisibility = pick(persisted?.columnVisibility ?? {}, allValidIds);
          const filteredColumnSizing = pick(persisted?.columnSizing ?? {}, allValidIds);

          return {
            ...currentState,
            columnVisibility: filteredColumnVisibility,
            columnOrder: mergedColumnOrder,
            columnSizing: filteredColumnSizing,
            customColumns: restoredCustomColumns,
          };
        },
      })
    );
  }

  return createStore<DataTableStore<TData>>()(storeConfig);
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Select only columns with SQL metadata (for building query params). */
export function selectColumnSqls<TData>(state: DataTableStore<TData>): (string | undefined)[] {
  return state.columnDefs.map((c) => c.meta?.sql).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Context + Provider
// ---------------------------------------------------------------------------

type DataTableStoreApi<TData> = ReturnType<typeof createDataTableStore<TData>>;

const DataTableContext = createContext<DataTableStoreApi<any> | undefined>(undefined);

export type DataTableStateProviderProps<TData extends RowData> = {
  children: ReactNode;
} & DataTableStoreConfig<TData>;

export function DataTableStateProvider<TData extends RowData>({
  children,
  ...config
}: DataTableStateProviderProps<TData>) {
  const [store] = useState(() => createDataTableStore<TData>(config));
  return <DataTableContext.Provider value={store as DataTableStoreApi<any>}>{children}</DataTableContext.Provider>;
}

export function useDataTableStore<TData>() {
  const store = useContext(DataTableContext);
  if (!store) {
    throw new Error("useDataTableStore must be used within DataTableStateProvider");
  }
  return store as DataTableStoreApi<TData>;
}
