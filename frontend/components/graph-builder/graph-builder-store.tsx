import { createContext, PropsWithChildren, useContext, useMemo, useRef } from "react";
import { createStore, useStore } from "zustand";

import { ChartConfig, GraphType } from "@/components/graph-builder/types";
import {
  canSelectForYAxis as utilCanSelectForYAxis,
  ColumnInfo,
  DataRow,
  generateSampleTimeData,
  getAvailableBreakdownColumns as utilGetAvailableBreakdownColumns,
  isValidGraphConfiguration as utilIsValidGraphConfiguration,
  transformDataToColumns,
} from "@/components/graph-builder/utils";

export type GraphBuilderState = {
  chartConfig: ChartConfig;
  columns: ColumnInfo[];
  data: DataRow[];
  originalData: DataRow[];
};

export type GraphBuilderActions = {
  setChartConfig: (config: Partial<ChartConfig>) => void;
  setGraphType: (type: GraphType) => void;
  setXColumn: (columnName?: string) => void;
  setYColumns: (columnNames: string[]) => void;
  toggleYColumn: (columnName: string) => void;
  setBreakdownColumn: (columnName?: string) => void;
  setEnableTimeRange: (enabled: boolean) => void;

  getSelectedXColumn: () => ColumnInfo | undefined;
  getSelectedYColumns: () => ColumnInfo[];
  getSelectedBreakdownColumn: () => ColumnInfo | undefined;
  getAvailableBreakdownColumns: () => ColumnInfo[];

  canSelectForYAxis: (columnName: string) => boolean;
  isValidGraphConfiguration: () => boolean;

  reset: () => void;
};

export type GraphBuilderStore = GraphBuilderState & GraphBuilderActions;
export type GraphBuilderStoreApi = ReturnType<typeof createGraphBuilderStore>;

type GraphBuilderProps = {
  data?: DataRow[];
  initialConfig?: ChartConfig;
};

const GraphBuilderContext = createContext<GraphBuilderStoreApi | undefined>(undefined);

export const createGraphBuilderStore = (initProps?: Partial<GraphBuilderProps>) => {
  const DEFAULT_CONFIG: ChartConfig = {
    type: undefined,
    x: undefined,
    y: [],
    breakdown: undefined,
    enableTimeRange: false,
  };

  const DEFAULT_PROPS: GraphBuilderState = {
    chartConfig: DEFAULT_CONFIG,
    columns: [],
    data: [],
    originalData: [],
  };

  const initialData = initProps?.data || [];
  const initialColumns = transformDataToColumns(initialData);
  const initialConfig = { ...DEFAULT_CONFIG, ...initProps?.initialConfig };

  return createStore<GraphBuilderStore>()((set, get) => ({
    ...DEFAULT_PROPS,
    chartConfig: initialConfig,
    data: initialData,
    originalData: initialData,
    columns: initialColumns,

    setChartConfig: (config) =>
      set((state) => ({
        chartConfig: { ...state.chartConfig, ...config },
      })),

    setGraphType: (type) =>
      set((state) => ({
        chartConfig: {
          ...state.chartConfig,
          type,
          x: undefined,
          y: [],
          breakdown: undefined,
        },
      })),

    setXColumn: (columnName) =>
      set((state) => ({
        chartConfig: { ...state.chartConfig, x: columnName },
      })),

    setYColumns: (columnNames) =>
      set((state) => ({
        chartConfig: { ...state.chartConfig, y: columnNames },
      })),

    toggleYColumn: (columnName) =>
      set((state) => {
        const currentY = state.chartConfig.y || [];
        const newY = currentY.includes(columnName)
          ? currentY.filter((name) => name !== columnName)
          : [...currentY, columnName];
        return {
          chartConfig: { ...state.chartConfig, y: newY },
        };
      }),

    setBreakdownColumn: (columnName) =>
      set((state) => ({
        chartConfig: { ...state.chartConfig, breakdown: columnName },
      })),

    setEnableTimeRange: (enabled) =>
      set((state) => {
        if (enabled) {
          const sampleData = generateSampleTimeData(state.originalData);
          const newColumns = transformDataToColumns(sampleData);

          return {
            chartConfig: {
              ...state.chartConfig,
              enableTimeRange: enabled,
              x: "timestamp",
            },
            data: sampleData,
            columns: newColumns,
          };
        } else {
          return {
            chartConfig: { ...state.chartConfig, enableTimeRange: enabled },
            data: state.originalData,
            columns: transformDataToColumns(state.originalData),
          };
        }
      }),

    getSelectedXColumn: () => {
      const { chartConfig, columns } = get();
      return chartConfig.x ? columns.find((col) => col.name === chartConfig.x) : undefined;
    },

    getSelectedYColumns: () => {
      const { chartConfig, columns } = get();
      return chartConfig.y.map((yName) => columns.find((col) => col.name === yName)).filter(Boolean) as ColumnInfo[];
    },

    getSelectedBreakdownColumn: () => {
      const { chartConfig, columns } = get();
      return chartConfig.breakdown ? columns.find((col) => col.name === chartConfig.breakdown) : undefined;
    },

    getAvailableBreakdownColumns: () => {
      const { chartConfig, columns } = get();
      return utilGetAvailableBreakdownColumns(chartConfig, columns);
    },

    canSelectForYAxis: (columnName: string) => {
      const { chartConfig, columns } = get();
      const column = columns.find((col) => col.name === columnName);
      if (!column) return false;
      return utilCanSelectForYAxis(column, chartConfig.type);
    },

    isValidGraphConfiguration: () => {
      const { chartConfig, columns } = get();
      return utilIsValidGraphConfiguration(chartConfig, columns);
    },

    reset: () =>
      set((state) => ({
        chartConfig: DEFAULT_CONFIG,
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
  const memoizedConfig = useMemo(() => props.initialConfig, [props.initialConfig]);

  if (!storeRef.current) {
    storeRef.current = createGraphBuilderStore({ data: memoizedData, initialConfig: memoizedConfig });
  }

  return <GraphBuilderContext.Provider value={storeRef.current}>{children}</GraphBuilderContext.Provider>;
};
