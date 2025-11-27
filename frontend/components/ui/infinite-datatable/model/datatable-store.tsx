"use client";

import { intersection, pick, uniqBy } from "lodash";
import { createContext, type ReactNode, useContext, useRef } from "react";
import { createStore, StoreApi } from "zustand";
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
  columnVisibility: Record<string, boolean>;
  columnOrder: string[];
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
  setDraggingColumnId: (columnId: string | null) => void;
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
  defaultColumnOrder: string[] = [],
  pageSize: number = 50
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
    columnVisibility: {},
    columnOrder: defaultColumnOrder,
    draggingColumnId: null,
    setData: (updater) => set((state) => ({ data: updater(state.data) })),
    setCurrentPage: (currentPage) => set({ currentPage }),
    setIsFetching: (isFetching) => set({ isFetching }),
    setIsLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),
    setHasMore: (hasMore) => set({ hasMore }),
    setColumnVisibility: (visibility) => set({ columnVisibility: visibility }),
    setColumnOrder: (order) => set({ columnOrder: order }),
    setDraggingColumnId: (columnId) => set({ draggingColumnId: columnId }),
    resetColumns: () =>
      set({
        columnVisibility: {},
        columnOrder: defaultColumnOrder,
      }),
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
        }),
        merge: (persistedState, currentState) => {
          const persisted = persistedState as Partial<Pick<SelectionState, "columnVisibility" | "columnOrder">>;
          const validColumns = intersection(persisted?.columnOrder ?? [], defaultColumnOrder);
          const newColumns = defaultColumnOrder.filter((col) => !validColumns.includes(col));
          const mergedColumnOrder = [...validColumns, ...newColumns];
          const filteredColumnVisibility = pick(persisted?.columnVisibility ?? {}, defaultColumnOrder);

          return {
            ...currentState,
            columnVisibility: filteredColumnVisibility,
            columnOrder: mergedColumnOrder,
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
  defaultColumnOrder?: string[];
}

export function DataTableStateProvider<TData>({
  children,
  storageKey,
  uniqueKey = "id",
  pageSize = 50,
  defaultColumnOrder = [],
}: DataTableStateProviderProps) {
  const storeRef = useRef<DataTableStoreApi<TData> | undefined>(undefined);
  if (!storeRef.current) {
    storeRef.current = createDataTableStore<TData>(uniqueKey, storageKey, defaultColumnOrder, pageSize);
  }

  return <DataTableContext.Provider value={storeRef.current}>{children}</DataTableContext.Provider>;
}

export function useDataTableStore<TData>() {
  const store = useContext(DataTableContext);
  if (!store) {
    throw new Error("useDataTableStore must be used within DataTableStateProvider");
  }
  return store as DataTableStoreApi<TData>;
}
