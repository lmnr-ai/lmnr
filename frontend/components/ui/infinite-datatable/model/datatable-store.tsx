"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { isEqual, uniqBy } from "lodash";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { createStore, type StoreApi } from "zustand";
import { persist } from "zustand/middleware";

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
  defaultColumnOrder: string[];
  lockedColumns: string[];
  columnLabelMap: Record<string, string>;
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
  reconcileColumns: (columnIds: string[]) => void;
  resetColumns: () => void;
  getStorageKey: () => string;
}

type DataTableStore<TData> = InfiniteScrollState<TData> &
  InfiniteScrollActions<TData> &
  SelectionState &
  SelectionActions;

function createDataTableStore<TData>(
  uniqueKey: string = "id",
  storageKey?: string,
  pageSize: number = 50,
  lockedColumns: string[] = []
): StoreApi<DataTableStore<TData>> {
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
    defaultColumnOrder: [],
    lockedColumns,
    columnLabelMap: {},
    columnVisibility: {},
    columnOrder: [],
    columnSizing: {},
    draggingColumnId: null,
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
    reconcileColumns: (columnIds) => {
      const state = get();
      if (isEqual(state.defaultColumnOrder, columnIds)) return;

      if (state.columnOrder.length === 0) {
        set({ defaultColumnOrder: columnIds, columnOrder: columnIds });
        return;
      }

      const idSet = new Set(columnIds);
      const pruned = state.columnOrder.filter((id) => idSet.has(id));
      const existingSet = new Set(pruned);
      const added = columnIds.filter((id) => !existingSet.has(id));

      set({ defaultColumnOrder: columnIds, columnOrder: [...pruned, ...added] });
    },
    resetColumns: () => {
      const state = get();
      set({
        columnVisibility: {},
        columnOrder: state.defaultColumnOrder,
        columnSizing: {},
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
        }),
        // Restore persisted state as-is; reconcileColumns (called by the provider) corrects it against the actual columns prop.
        merge: (persistedState, currentState) => {
          const persisted = persistedState as Partial<
            Pick<SelectionState, "columnVisibility" | "columnOrder" | "columnSizing">
          >;
          return {
            ...currentState,
            columnVisibility: persisted?.columnVisibility ?? {},
            columnOrder: persisted?.columnOrder ?? [],
            columnSizing: persisted?.columnSizing ?? {},
          };
        },
      })
    );
  }

  return createStore<DataTableStore<TData>>()(storeConfig);
}

type DataTableStoreApi<TData> = ReturnType<typeof createDataTableStore<TData>>;

const DataTableContext = createContext<DataTableStoreApi<any> | undefined>(undefined);

export interface DataTableStateProviderProps {
  children: ReactNode;
  uniqueKey?: string;
  pageSize?: number;
  storageKey?: string;
  columns?: ColumnDef<any>[];
  enableRowSelection?: boolean;
  lockedColumns?: string[];
}

export function DataTableStateProvider<TData>({
  children,
  storageKey,
  uniqueKey = "id",
  pageSize = 50,
  columns = [],
  enableRowSelection = false,
  lockedColumns = [],
}: DataTableStateProviderProps) {
  const [store] = useState(() => createDataTableStore<TData>(uniqueKey, storageKey, pageSize, lockedColumns));

  const columnIds = useMemo(() => {
    const ids = columns.map((c) => (c as ColumnDef<any> & { id?: string }).id).filter(Boolean) as string[];
    return enableRowSelection ? ["__row_selection", ...ids] : ids;
  }, [columns, enableRowSelection]);

  const columnLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of columns) {
      const id = (c as ColumnDef<any> & { id?: string }).id;
      if (!id) continue;
      map[id] = typeof c.header === "string" ? c.header : id;
    }
    return map;
  }, [columns]);

  useEffect(() => {
    if (columnIds.length > 0) {
      store.getState().reconcileColumns(columnIds);
      store.setState({ columnLabelMap });
    }
  }, [columnIds, columnLabelMap, store]);

  return <DataTableContext.Provider value={store}>{children}</DataTableContext.Provider>;
}

export function useDataTableStore<TData>() {
  const store = useContext(DataTableContext);
  if (!store) {
    throw new Error("useDataTableStore must be used within DataTableStateProvider");
  }
  return store as DataTableStoreApi<TData>;
}
