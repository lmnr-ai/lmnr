"use client";

import { uniqBy } from "lodash";
import { createContext, type ReactNode, useContext, useRef } from "react";
import { createStore } from "zustand";
import { persist } from "zustand/middleware";

import { defaultDatasetColumnOrder } from "@/components/dataset/dataset";
import { defaultDatasetsColumnOrder } from "@/components/datasets/datasets";
import { defaultEvaluationsColumnOrder } from "@/components/evaluations/evaluations";
import { defaultEvaluationsGroupsBarColumnOrder } from "@/components/evaluations/evaluations-groups-bar";
import { defaultEvaluatorsColumnOrder } from "@/components/evaluators/lib/consts";
import { defaultEventDefinitionsColumnOrder } from "@/components/event-definitions/columns";
import { defaultEventsColumnOrder } from "@/components/events/columns";
import { defaultPlaygroundHistoryColumnOrder } from "@/components/playground/playground-history-table";
import { defaultPlaygroundsColumnOrder } from "@/components/playgrounds/playgrounds";
import { defaultQueuesColumnOrder } from "@/components/queues/queues";
import { defaultSessionsColumnOrder } from "@/components/traces/sessions-table/columns";
import { defaultSpansColumnOrder } from "@/components/traces/spans-table/columns";
import { defaultTracesColumnOrder } from "@/components/traces/traces-table/columns";

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
  appendData: (items: TData[], count: number) => void;
  replaceData: (items: TData[], count: number) => void;
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
}

type DataTableStore<TData> = InfiniteScrollState<TData> &
  InfiniteScrollActions<TData> &
  SelectionState &
  SelectionActions;

const storageDefaultColumnOrder = {
  "traces-table": defaultTracesColumnOrder,
  "spans-table": defaultSpansColumnOrder,
  "sessions-table": defaultSessionsColumnOrder,
  "playgrounds-table": defaultPlaygroundsColumnOrder,
  "queues-table": defaultQueuesColumnOrder,
  "playground-history-table": defaultPlaygroundHistoryColumnOrder,
  "events-table": defaultEventsColumnOrder,
  "event-definitions-table": defaultEventDefinitionsColumnOrder,
  "evaluations-table": defaultEvaluationsColumnOrder,
  "datasets-table": defaultDatasetsColumnOrder,
  "dataset-table": defaultDatasetColumnOrder,
  "evaluators-table": defaultEvaluatorsColumnOrder,
  "evaluations-groups-bar": defaultEvaluationsGroupsBarColumnOrder,
};

const createDataTableStore = <TData,>(uniqueKey: string = "id", storageKey: string, pageSize: number = 50) =>
  createStore<DataTableStore<TData>>()(
    persist(
      (set, get) => ({
        data: [],
        currentPage: 0,
        isFetching: false,
        isLoading: false,
        error: null,
        uniqueKey,
        hasMore: true,
        pageSize,
        columnVisibility: {},
        columnOrder: storageDefaultColumnOrder[storageKey as keyof typeof storageDefaultColumnOrder] || [],
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
            columnOrder: storageDefaultColumnOrder[storageKey as keyof typeof storageDefaultColumnOrder] || [],
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
      }),
      {
        name: storageKey,
        partialize: (state) => ({
          columnVisibility: state.columnVisibility,
          columnOrder: state.columnOrder,
        }),
      }
    )
  );
type DataTableStoreApi<TData> = ReturnType<typeof createDataTableStore<TData>>;

const DataTableContext = createContext<DataTableStoreApi<any> | undefined>(undefined);

export interface DataTableStateProviderProps {
  children: ReactNode;
  uniqueKey?: string;
  pageSize?: number;
  storageKey: string;
}

export function DataTableStateProvider<TData>({
  children,
  storageKey,
  uniqueKey = "id",
  pageSize = 50,
}: DataTableStateProviderProps) {
  const storeRef = useRef<DataTableStoreApi<TData> | undefined>(undefined);
  if (!storeRef.current) {
    storeRef.current = createDataTableStore<TData>(uniqueKey, storageKey, pageSize);
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
