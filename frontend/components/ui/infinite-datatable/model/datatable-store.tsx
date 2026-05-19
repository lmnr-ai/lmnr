"use client";

import { intersection, pick, uniqBy } from "lodash";
import { createContext, type ReactNode, useContext, useState } from "react";
import { createStore, type StoreApi } from "zustand";
import { persist } from "zustand/middleware";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { type CustomColumn } from "@/components/ui/columns-menu";

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
  // Static per-table config — set once at create time, never mutated.
  lockedColumns: string[];
  disableHideColumn: boolean;
}

export interface CustomColumnsState {
  customColumns: CustomColumn[];
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

export interface CustomColumnsActions {
  addCustomColumn: (column: CustomColumn) => void;
  updateCustomColumn: (oldName: string, column: CustomColumn) => void;
  removeCustomColumn: (name: string) => void;
}

type DataTableStore<TData> = InfiniteScrollState<TData> &
  InfiniteScrollActions<TData> &
  SelectionState &
  SelectionActions &
  CustomColumnsState &
  CustomColumnsActions;

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

interface CreateDataTableStoreOptions {
  uniqueKey?: string;
  storageKey?: string;
  defaultColumnOrder?: string[];
  pageSize?: number;
  initialColumnConfig?: ColumnConfig;
  lockedColumns?: string[];
  disableHideColumn?: boolean;
}

function createDataTableStore<TData>({
  uniqueKey = "id",
  storageKey,
  defaultColumnOrder = [],
  pageSize = 50,
  initialColumnConfig,
  lockedColumns = [],
  disableHideColumn = false,
}: CreateDataTableStoreOptions = {}): StoreApi<DataTableStore<TData>> {
  const storeConfig = (
    set: StoreApi<DataTableStore<TData>>["setState"],
    get: StoreApi<DataTableStore<TData>>["getState"]
  ): DataTableStore<TData> => ({
    data: [],
    currentPage: 0,
    isFetching: false,
    isLoading: false,
    error: null,
    uniqueKey,
    hasMore: true,
    pageSize,
    columnVisibility: initialColumnConfig?.columnVisibility ?? {},
    columnOrder: initialColumnConfig?.columnOrder ?? defaultColumnOrder,
    columnSizing: initialColumnConfig?.columnSizing ?? {},
    draggingColumnId: null,
    lockedColumns,
    disableHideColumn,
    customColumns: initialColumnConfig?.customColumns ?? [],

    setData: (updater) => set((state) => ({ data: updater(state.data) })),
    setCurrentPage: (currentPage) => set({ currentPage }),
    setIsFetching: (isFetching) => set({ isFetching }),
    setIsLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),
    setHasMore: (hasMore) => set({ hasMore }),
    setColumnVisibility: (visibility) => set({ columnVisibility: visibility }),
    setColumnOrder: (order) => set({ columnOrder: order }),
    setColumnSizing: (sizing) => set({ columnSizing: sizing }),
    setDraggingColumnId: (columnId) => set({ draggingColumnId: columnId }),
    resetColumns: () =>
      set({
        columnVisibility: {},
        columnOrder: defaultColumnOrder,
        columnSizing: {},
      }),

    addCustomColumn: (column) => {
      const { customColumns, columnOrder } = get();
      if (customColumns.some((cc) => cc.name === column.name)) return;
      const id = `custom:${column.name}`;
      set({
        customColumns: [...customColumns, column],
        columnOrder: [...columnOrder, id],
      });
    },

    updateCustomColumn: (oldName, column) => {
      const { customColumns, columnOrder, columnSizing, columnVisibility } = get();
      const oldId = `custom:${oldName}`;
      const newId = `custom:${column.name}`;
      const renamed = oldName !== column.name;
      set({
        customColumns: customColumns.map((cc) => (cc.name === oldName ? column : cc)),
        ...(renamed && {
          columnOrder: columnOrder.map((id) => (id === oldId ? newId : id)),
          columnSizing: Object.fromEntries(Object.entries(columnSizing).map(([k, v]) => [k === oldId ? newId : k, v])),
          columnVisibility: Object.fromEntries(
            Object.entries(columnVisibility).map(([k, v]) => [k === oldId ? newId : k, v])
          ),
        }),
      });
    },

    removeCustomColumn: (name) => {
      const { customColumns, columnOrder, columnSizing, columnVisibility } = get();
      const id = `custom:${name}`;
      const { [id]: _vis, ...restVisibility } = columnVisibility;
      const { [id]: _size, ...restSizing } = columnSizing;
      set({
        customColumns: customColumns.filter((cc) => cc.name !== name),
        columnOrder: columnOrder.filter((colId) => colId !== id),
        columnVisibility: restVisibility,
        columnSizing: restSizing,
      });
    },

    appendData: (items, count) =>
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

    replaceData: (items, count) =>
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

    selectedRows: new Set(),
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
    selectAll: (ids) =>
      set({
        selectedRows: new Set(ids),
      }),
    clearSelection: () => set({ selectedRows: new Set() }),
    getStorageKey: () => storageKey || "datatable",
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
            Pick<SelectionState, "columnVisibility" | "columnOrder" | "columnSizing"> &
              Pick<CustomColumnsState, "customColumns">
          >;

          // Persisted state wins; fall through to seeded state (initialColumnConfig)
          // when the persisted blob is missing a key — required for one-shot
          // migrations that seed customColumns from a different storage key.
          const customColumns = persisted?.customColumns ?? currentState.customColumns;
          const customColumnIds = customColumns.map((cc) => `custom:${cc.name}`);
          const fullDefaultOrder = [...defaultColumnOrder, ...customColumnIds];

          const validColumns = intersection(persisted?.columnOrder ?? [], fullDefaultOrder);
          const newColumns = fullDefaultOrder.filter((col) => !validColumns.includes(col));
          const mergedColumnOrder = [...validColumns, ...newColumns];
          const filteredColumnVisibility = pick(persisted?.columnVisibility ?? {}, fullDefaultOrder);
          const filteredColumnSizing = pick(persisted?.columnSizing ?? {}, fullDefaultOrder);

          return {
            ...currentState,
            customColumns,
            columnVisibility: filteredColumnVisibility,
            columnOrder: mergedColumnOrder,
            columnSizing: filteredColumnSizing,
          };
        },
      })
    );
  }

  return createStore<DataTableStore<TData>>()(storeConfig);
}

type DataTableStoreApi<TData> = ReturnType<typeof createDataTableStore<TData>>;

const DataTableContext = createContext<DataTableStoreApi<any> | undefined>(undefined);

export interface ColumnConfig {
  columnOrder?: string[];
  columnSizing?: Record<string, number>;
  columnVisibility?: Record<string, boolean>;
  customColumns?: CustomColumn[];
}

export interface DataTableStateProviderProps {
  children: ReactNode;
  uniqueKey?: string;
  pageSize?: number;
  storageKey?: string;
  defaultColumnOrder?: string[];
  initialColumnConfig?: ColumnConfig;
  lockedColumns?: string[];
  disableHideColumn?: boolean;
}

export function DataTableStateProvider<TData>({
  children,
  storageKey,
  uniqueKey = "id",
  pageSize = 50,
  defaultColumnOrder = [],
  initialColumnConfig,
  lockedColumns,
  disableHideColumn,
}: DataTableStateProviderProps) {
  const [store] = useState(() =>
    createDataTableStore<TData>({
      uniqueKey,
      storageKey,
      defaultColumnOrder,
      pageSize,
      initialColumnConfig,
      lockedColumns,
      disableHideColumn,
    })
  );

  return <DataTableContext.Provider value={store}>{children}</DataTableContext.Provider>;
}

export function useDataTableStore<TData>() {
  const store = useContext(DataTableContext);
  if (!store) {
    throw new Error("useDataTableStore must be used within DataTableStateProvider");
  }
  return store as DataTableStoreApi<TData>;
}

/** Memoized selector for the persisted column config. Use shallow equality so
 * the returned object is stable when none of the four fields change. */
export function useColumnConfig(): Required<ColumnConfig> {
  const store = useDataTableStore();
  return useStoreWithEqualityFn(
    store,
    (s) => ({
      columnOrder: s.columnOrder,
      columnSizing: s.columnSizing,
      columnVisibility: s.columnVisibility,
      customColumns: s.customColumns,
    }),
    shallow
  );
}
