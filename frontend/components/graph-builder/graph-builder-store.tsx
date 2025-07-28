import { createContext, PropsWithChildren, useContext, useMemo, useRef } from "react";
import { createStore, useStore } from "zustand";

import { GraphType } from "@/components/graph-builder/types";
import {
  canSelectForYAxis as utilCanSelectForYAxis,
  ColumnInfo,
  DataRow,
  generateSampleTimeData,
  isValidGraphConfiguration as utilIsValidGraphConfiguration,
  transformDataToColumns,
} from "@/components/graph-builder/utils";

export type GraphBuilderState = {
  type: GraphType | string | undefined;
  columns: ColumnInfo[];
  data: DataRow[];
  enableTimeRange: boolean;
  originalData: DataRow[];
};

export type GraphBuilderActions = {
  setType: (type: GraphType) => void;
  setColumnXAxis: (columnName: string, isXAxis: boolean) => void;
  setColumnYAxis: (columnName: string, isYAxis: boolean) => void;
  setColumnBreakdown: (columnName: string, isBreakdown: boolean) => void;
  setEnableTimeRange: (enabled: boolean) => void;
  reset: () => void;
  getSelectedXColumn: () => ColumnInfo | undefined;
  getSelectedYColumns: () => ColumnInfo[];
  getSelectedBreakdownColumn: () => ColumnInfo | undefined;
  getAvailableBreakdownColumns: () => ColumnInfo[];
  canSelectForYAxis: (columnName: string) => boolean;
  isValidGraphConfiguration: () => boolean;
};

export type GraphBuilderStore = GraphBuilderState & GraphBuilderActions;
export type GraphBuilderStoreApi = ReturnType<typeof createGraphBuilderStore>;

type GraphBuilderProps = {
  data?: DataRow[];
};

const GraphBuilderContext = createContext<GraphBuilderStoreApi | undefined>(undefined);

export const createGraphBuilderStore = (initProps?: Partial<GraphBuilderProps>) => {
  const DEFAULT_PROPS: GraphBuilderState = {
    type: undefined,
    columns: [],
    data: [],
    enableTimeRange: false,
    originalData: [],
  };

  const initialData = initProps?.data || [];
  const initialColumns = transformDataToColumns(initialData);

  return createStore<GraphBuilderStore>()((set, get) => ({
    ...DEFAULT_PROPS,
    data: initialData,
    originalData: initialData,
    columns: initialColumns,

    setType: (type) =>
      set((state) => ({
        type,
        columns: state.columns.map((col) => ({
          ...col,
          isXAxis: false,
          isYAxis: false,
          isBreakdown: false,
        })),
      })),

    setColumnXAxis: (columnName, isXAxis) =>
      set((state) => ({
        columns: state.columns.map((col) =>
          col.name === columnName ? { ...col, isXAxis } : isXAxis ? { ...col, isXAxis: false } : col
        ),
      })),

    setColumnYAxis: (columnName, isYAxis) =>
      set((state) => ({
        columns: state.columns.map((col) => (col.name === columnName ? { ...col, isYAxis } : col)),
      })),

    setColumnBreakdown: (columnName, isBreakdown) =>
      set((state) => ({
        columns: state.columns.map((col) =>
          col.name === columnName ? { ...col, isBreakdown } : isBreakdown ? { ...col, isBreakdown: false } : col
        ),
      })),

    setEnableTimeRange: (enabled) =>
      set((state) => {
        if (enabled) {
          const sampleData = generateSampleTimeData(state.originalData);
          const newColumns = transformDataToColumns(sampleData);

          const updatedColumns = newColumns.map((col) => ({
            ...col,
            isXAxis: col.name === "timestamp",
          }));

          return {
            enableTimeRange: enabled,
            data: sampleData,
            columns: updatedColumns,
          };
        } else {
          return {
            enableTimeRange: enabled,
            data: state.originalData,
            columns: transformDataToColumns(state.originalData),
          };
        }
      }),

    getSelectedXColumn: () => get().columns.find((col) => col.isXAxis),
    getSelectedYColumns: () => get().columns.filter((col) => col.isYAxis),
    getSelectedBreakdownColumn: () => get().columns.find((col) => col.isBreakdown),
    getAvailableBreakdownColumns: () => get().columns.filter((col) => !col.isXAxis && !col.isYAxis),

    canSelectForYAxis: (columnName: string) => {
      const state = get();
      const column = state.columns.find((col) => col.name === columnName);
      if (!column) return false;
      return utilCanSelectForYAxis(column, state.type);
    },

    isValidGraphConfiguration: () => {
      const state = get();
      return utilIsValidGraphConfiguration(state.type, state.columns);
    },

    reset: () =>
      set((state) => ({
        ...DEFAULT_PROPS,
        data: state.originalData,
        originalData: state.originalData,
        columns: transformDataToColumns(state.originalData),
      })),
  }));
};

export const useGraphBuilderStoreContext = <T,>(selector: (state: GraphBuilderStore) => T): T => {
  const store = useContext(GraphBuilderContext);
  if (!store) throw new Error("Missing GraphBuilderContext.Provider in the tree");
  return useStore(store, selector);
};

export const GraphBuilderStoreProvider = ({ children, ...props }: PropsWithChildren<GraphBuilderProps>) => {
  const storeRef = useRef<GraphBuilderStoreApi | undefined>(undefined);

  const memoizedData = useMemo(() => props.data, [props.data]);

  if (!storeRef.current) {
    storeRef.current = createGraphBuilderStore({ data: memoizedData });
  }

  return <GraphBuilderContext.Provider value={storeRef.current}>{children}</GraphBuilderContext.Provider>;
};
