import { createContext, PropsWithChildren, useContext, useMemo, useRef } from "react";
import { createStore, useStore } from "zustand";

import { ChartConfig, ChartType } from "@/components/chart-builder/types";
import {
  canSelectForYAxis as utilCanSelectForYAxis,
  ColumnInfo,
  DataRow,
  getAvailableBreakdownColumns as utilGetAvailableBreakdownColumns,
  isValidChartConfiguration as utilIsValidChartConfiguration,
  transformDataToColumns,
} from "@/components/chart-builder/utils";

export type ChartBuilderState = {
  chartConfig: ChartConfig;
  columns: ColumnInfo[];
  data: DataRow[];
  originalData: DataRow[];
};

export type ChartBuilderActions = {
  setChartConfig: (config: Partial<ChartConfig>) => void;
  setChartType: (type: ChartType) => void;
  setXColumn: (columnName?: string) => void;
  setYColumns: (columnNames: string[]) => void;
  toggleYColumn: (columnName: string) => void;
  setBreakdownColumn: (columnName?: string) => void;

  getSelectedXColumn: () => ColumnInfo | undefined;
  getSelectedYColumns: () => ColumnInfo[];
  getSelectedBreakdownColumn: () => ColumnInfo | undefined;
  getAvailableBreakdownColumns: () => ColumnInfo[];

  canSelectForYAxis: (columnName: string) => boolean;
  isValidChartConfiguration: () => boolean;

  reset: () => void;
};

export type ChartBuilderStore = ChartBuilderState & ChartBuilderActions;
export type ChartBuilderStoreApi = ReturnType<typeof createChartBuilderStore>;

type ChartBuilderProps = {
  data?: DataRow[];
  initialConfig?: ChartConfig;
};

const ChartBuilderContext = createContext<ChartBuilderStoreApi | undefined>(undefined);

export const createChartBuilderStore = (initProps?: Partial<ChartBuilderProps>) => {
  const DEFAULT_CONFIG: ChartConfig = {
    type: undefined,
    x: undefined,
    y: [],
    breakdown: undefined,
  };

  const DEFAULT_PROPS: ChartBuilderState = {
    chartConfig: DEFAULT_CONFIG,
    columns: [],
    data: [],
    originalData: [],
  };

  const initialData = initProps?.data || [];
  const initialColumns = transformDataToColumns(initialData);
  const initialConfig = { ...DEFAULT_CONFIG, ...initProps?.initialConfig };

  return createStore<ChartBuilderStore>()((set, get) => ({
    ...DEFAULT_PROPS,
    chartConfig: initialConfig,
    data: initialData,
    originalData: initialData,
    columns: initialColumns,

    setChartConfig: (config) =>
      set((state) => ({
        chartConfig: { ...state.chartConfig, ...config },
      })),

    setChartType: (type) =>
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

    isValidChartConfiguration: () => {
      const { chartConfig, columns } = get();
      return utilIsValidChartConfiguration(chartConfig, columns);
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

export const useChartBuilderStoreContext = <T,>(selector: (state: ChartBuilderStore) => T): T => {
  const store = useContext(ChartBuilderContext);
  if (!store) throw new Error("Missing ChartBuilderContext.Provider in the tree");
  return useStore(store, selector);
};

export const ChartBuilderStoreProvider = ({ children, ...props }: PropsWithChildren<ChartBuilderProps>) => {
  const storeRef = useRef<ChartBuilderStoreApi | undefined>(undefined);

  const memoizedData = useMemo(() => props.data, [props.data]);
  const memoizedConfig = useMemo(() => props.initialConfig, [props.initialConfig]);

  if (!storeRef.current) {
    storeRef.current = createChartBuilderStore({ data: memoizedData, initialConfig: memoizedConfig });
  }

  return <ChartBuilderContext.Provider value={storeRef.current}>{children}</ChartBuilderContext.Provider>;
};
