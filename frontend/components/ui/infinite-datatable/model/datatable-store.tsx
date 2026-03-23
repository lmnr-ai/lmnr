"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { uniqBy } from "lodash";
import { createContext, type ReactNode, useContext, useState } from "react";
import { createStore, type StoreApi, useStore } from "zustand";
import { persist } from "zustand/middleware";

export interface CustomColumn {
  name: string;
  sql: string;
  dataType: "string" | "number";
}

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

export interface ColumnState {
  selectedRows: Set<string>;
  lockedColumns: string[];
  columnLabelMap: Record<string, string>;
  columnVisibility: Record<string, boolean>;
  columnOrder: string[];
  columnSizing: Record<string, number>;
  draggingColumnId: string | null;
  customColumns: CustomColumn[];
  staticColumnDefs: ColumnDef<any>[];
  buildCustomColumnDef: ((cc: CustomColumn) => ColumnDef<any>) | null;
}

export interface ColumnActions {
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
  addCustomColumn: (column: CustomColumn) => void;
  updateCustomColumn: (oldName: string, column: CustomColumn) => void;
  removeCustomColumn: (name: string) => void;
}

type DataTableStore<TData> = InfiniteScrollState<TData> & InfiniteScrollActions<TData> & ColumnState & ColumnActions;

/**
 * Derive the combined column defs from static + custom.
 * Exported so consumers can use it as a selector on the store.
 */
export function selectAllColumnDefs<TData>(state: DataTableStore<TData>): ColumnDef<TData>[] {
  const { staticColumnDefs, customColumns, buildCustomColumnDef } = state;
  if (!buildCustomColumnDef || customColumns.length === 0) {
    return staticColumnDefs as ColumnDef<TData>[];
  }
  const customDefs = customColumns.map(buildCustomColumnDef);
  return [...staticColumnDefs, ...customDefs] as ColumnDef<TData>[];
}

function buildColumnLabelMap(defs: ColumnDef<any>[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const c of defs) {
    const id = (c as ColumnDef<any> & { id?: string }).id;
    if (!id) continue;
    map[id] = typeof c.header === "string" ? c.header : id;
  }
  return map;
}

function buildColumnIds(defs: ColumnDef<any>[], enableRowSelection: boolean): string[] {
  const ids = defs.map((c) => (c as ColumnDef<any> & { id?: string }).id).filter(Boolean) as string[];
  return enableRowSelection ? ["__row_selection", ...ids] : ids;
}

/**
 * Reconcile persisted columnOrder with the current set of column IDs.
 * Returns the new columnOrder preserving user reordering where possible.
 */
function reconcileColumnOrder(currentOrder: string[], columnIds: string[]): string[] {
  if (currentOrder.length === 0) return columnIds;

  const idSet = new Set(columnIds);
  const pruned = currentOrder.filter((id) => idSet.has(id));
  const existingSet = new Set(pruned);
  const added = columnIds.filter((id) => !existingSet.has(id));
  return [...pruned, ...added];
}

function createDataTableStore<TData>(
  uniqueKey: string = "id",
  storageKey?: string,
  pageSize: number = 50,
  lockedColumns: string[] = [],
  initialStaticColumnDefs: ColumnDef<any>[] = [],
  initialBuildCustomColumnDef: ((cc: CustomColumn) => ColumnDef<any>) | null = null,
  enableRowSelection: boolean = false
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
    lockedColumns,
    columnLabelMap: {},
    columnVisibility: {},
    columnOrder: [],
    columnSizing: {},
    draggingColumnId: null,
    customColumns: [],
    staticColumnDefs: initialStaticColumnDefs,
    buildCustomColumnDef: initialBuildCustomColumnDef,
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
    resetColumns: () => {
      const state = get();
      const allDefs = selectAllColumnDefs(state);
      set({
        columnVisibility: {},
        columnOrder: buildColumnIds(allDefs, enableRowSelection),
        columnSizing: {},
      });
    },
    addCustomColumn: (column) => {
      const { customColumns, columnOrder, buildCustomColumnDef: builder } = get();
      if (customColumns.some((cc) => cc.name === column.name)) return;
      const newCustomColumns = [...customColumns, column];
      const columnId = `custom:${column.name}`;
      const newState: Partial<DataTableStore<TData>> = {
        customColumns: newCustomColumns,
        columnOrder: [...columnOrder, columnId],
      };
      // Rebuild label map to include new column
      if (builder) {
        const allDefs = [...get().staticColumnDefs, ...newCustomColumns.map(builder)];
        newState.columnLabelMap = buildColumnLabelMap(allDefs);
      }
      set(newState);
    },
    updateCustomColumn: (oldName, column) => {
      const { customColumns, columnOrder, columnVisibility, buildCustomColumnDef: builder } = get();
      const newCustomColumns = customColumns.map((cc) => (cc.name === oldName ? column : cc));
      const oldId = `custom:${oldName}`;
      const newId = `custom:${column.name}`;
      const newState: Partial<DataTableStore<TData>> = { customColumns: newCustomColumns };
      if (oldName !== column.name) {
        newState.columnOrder = columnOrder.map((id) => (id === oldId ? newId : id));
        const newVisibility = { ...columnVisibility };
        if (oldId in newVisibility) {
          newVisibility[newId] = newVisibility[oldId];
          delete newVisibility[oldId];
        }
        newState.columnVisibility = newVisibility;
      }
      if (builder) {
        const allDefs = [...get().staticColumnDefs, ...newCustomColumns.map(builder)];
        newState.columnLabelMap = buildColumnLabelMap(allDefs);
      }
      set(newState);
    },
    removeCustomColumn: (name) => {
      const { customColumns, columnVisibility, columnOrder, buildCustomColumnDef: builder } = get();
      const columnId = `custom:${name}`;
      const newVisibility = { ...columnVisibility };
      delete newVisibility[columnId];
      const newCustomColumns = customColumns.filter((cc) => cc.name !== name);
      const newState: Partial<DataTableStore<TData>> = {
        customColumns: newCustomColumns,
        columnVisibility: newVisibility,
        columnOrder: columnOrder.filter((id) => id !== columnId),
      };
      if (builder) {
        const allDefs = [...get().staticColumnDefs, ...newCustomColumns.map(builder)];
        newState.columnLabelMap = buildColumnLabelMap(allDefs);
      }
      set(newState);
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
            Pick<ColumnState, "columnVisibility" | "columnOrder" | "columnSizing" | "customColumns">
          >;
          return {
            ...currentState,
            columnVisibility: persisted?.columnVisibility ?? {},
            columnOrder: persisted?.columnOrder ?? [],
            columnSizing: persisted?.columnSizing ?? {},
            customColumns: persisted?.customColumns ?? [],
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
  columnDefs?: ColumnDef<any>[];
  enableRowSelection?: boolean;
  lockedColumns?: string[];
  buildCustomColumnDef?: (cc: CustomColumn) => ColumnDef<any>;
}

export function DataTableStateProvider<TData>({
  children,
  storageKey,
  uniqueKey = "id",
  pageSize = 50,
  columnDefs = [],
  enableRowSelection = false,
  lockedColumns = [],
  buildCustomColumnDef,
}: DataTableStateProviderProps) {
  const [store] = useState(() => {
    const s = createDataTableStore<TData>(
      uniqueKey,
      storageKey,
      pageSize,
      lockedColumns,
      columnDefs,
      buildCustomColumnDef ?? null,
      enableRowSelection
    );

    // Synchronously reconcile persisted columnOrder with the column IDs
    // from the initial defs + any persisted custom columns.
    const state = s.getState();
    const customDefs =
      buildCustomColumnDef && state.customColumns.length > 0 ? state.customColumns.map(buildCustomColumnDef) : [];
    const allDefs = [...columnDefs, ...customDefs];
    const columnIds = buildColumnIds(allDefs, enableRowSelection);
    const reconciledOrder = reconcileColumnOrder(state.columnOrder, columnIds);

    s.setState({
      columnLabelMap: buildColumnLabelMap(allDefs),
      columnOrder: reconciledOrder,
    });

    return s;
  });

  return <DataTableContext.Provider value={store}>{children}</DataTableContext.Provider>;
}

function useDataTableContext() {
  const store = useContext(DataTableContext);
  if (!store) {
    throw new Error("useDataTableStore / useDataTableStoreSelector must be used within DataTableStateProvider");
  }
  return store;
}

export function useDataTableStore<TData>() {
  return useDataTableContext() as DataTableStoreApi<TData>;
}

export function useDataTableStoreSelector<U>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selector: (state: DataTableStore<any>) => U
): U {
  return useStore(useDataTableContext(), selector);
}
