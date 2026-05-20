"use client";

import { uniqBy } from "lodash";
import { createContext, type ReactNode, useContext, useState } from "react";
import { createStore, type StoreApi } from "zustand";

import { type TableConfig, TableConfigProvider, type TableConfigProviderProps } from "./table-config-store.tsx";

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

export interface RuntimeSelectionState {
  selectedRows: Set<string>;
  draggingColumnId: string | null;
}

export interface RuntimeSelectionActions {
  selectRow: (id: string) => void;
  deselectRow: (id: string) => void;
  toggleRow: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  setDraggingColumnId: (columnId: string | null) => void;
}

export type TableStore<TData> = InfiniteScrollState<TData> &
  InfiniteScrollActions<TData> &
  RuntimeSelectionState &
  RuntimeSelectionActions;

interface CreateTableStoreOptions {
  uniqueKey?: string;
  pageSize?: number;
}

function createTableStore<TData>({ uniqueKey = "id", pageSize = 50 }: CreateTableStoreOptions = {}): StoreApi<
  TableStore<TData>
> {
  return createStore<TableStore<TData>>()((set) => ({
    data: [],
    currentPage: 0,
    isFetching: false,
    isLoading: false,
    error: null,
    uniqueKey,
    hasMore: true,
    pageSize,
    selectedRows: new Set(),
    draggingColumnId: null,

    setData: (updater) => set((state) => ({ data: updater(state.data) })),
    setCurrentPage: (currentPage) => set({ currentPage }),
    setIsFetching: (isFetching) => set({ isFetching }),
    setIsLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),
    setHasMore: (hasMore) => set({ hasMore }),

    appendData: (items) =>
      set((state) => ({
        data: uniqBy([...state.data, ...items], state.uniqueKey),
        isFetching: false,
        isLoading: false,
        error: null,
        hasMore: items.length >= state.pageSize,
      })),

    replaceData: (items) =>
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

    selectRow: (id) =>
      set((state) => {
        const next = new Set(state.selectedRows);
        next.add(id);
        return { selectedRows: next };
      }),
    deselectRow: (id) =>
      set((state) => {
        const next = new Set(state.selectedRows);
        next.delete(id);
        return { selectedRows: next };
      }),
    toggleRow: (id) =>
      set((state) => {
        const next = new Set(state.selectedRows);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { selectedRows: next };
      }),
    selectAll: (ids) => set({ selectedRows: new Set(ids) }),
    clearSelection: () => set({ selectedRows: new Set() }),
    setDraggingColumnId: (columnId) => set({ draggingColumnId: columnId }),
  }));
}

type TableStoreApi<TData> = ReturnType<typeof createTableStore<TData>>;

const TableContext = createContext<TableStoreApi<unknown> | undefined>(undefined);

export interface TableProviderProps {
  children: ReactNode;
  uniqueKey?: string;
  pageSize?: number;
}

export function TableProvider<TData>({ children, uniqueKey, pageSize }: TableProviderProps) {
  const [store] = useState(() => createTableStore<TData>({ uniqueKey, pageSize }));
  return <TableContext.Provider value={store as TableStoreApi<unknown>}>{children}</TableContext.Provider>;
}

export function useTableStore<TData>(): TableStoreApi<TData> {
  const store = useContext(TableContext);
  if (!store) {
    throw new Error("useTableStore must be used within TableProvider");
  }
  return store as TableStoreApi<TData>;
}

export interface InfiniteDataTableProviderProps extends TableConfigProviderProps {
  uniqueKey?: string;
  pageSize?: number;
}

export function InfiniteDataTableProvider({
  children,
  defaults,
  lockedColumns,
  disableHideColumn,
  loadConfig,
  enableDirtyTracking,
  fallback,
  uniqueKey,
  pageSize,
}: InfiniteDataTableProviderProps) {
  return (
    <TableConfigProvider
      defaults={defaults}
      lockedColumns={lockedColumns}
      disableHideColumn={disableHideColumn}
      loadConfig={loadConfig}
      enableDirtyTracking={enableDirtyTracking}
      fallback={fallback}
    >
      <TableProvider uniqueKey={uniqueKey} pageSize={pageSize}>
        {children}
      </TableProvider>
    </TableConfigProvider>
  );
}

// Re-export for callers that grab them via the same import path.
export type { TableConfig };
