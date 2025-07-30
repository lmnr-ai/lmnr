import { createContext, PropsWithChildren, useContext, useRef } from "react";
import { createStore, useStore } from "zustand";
import { persist } from "zustand/middleware";

import { ChartConfig, ChartType } from "@/components/chart-builder/types";
import {
  canSelectForYAxis as utilCanSelectForYAxis,
  ColumnInfo,
  DataRow,
  getAvailableBreakdownColumns as utilGetAvailableBreakdownColumns,
  isValidChartConfiguration as utilIsValidChartConfiguration,
  transformDataToColumns,
} from "@/components/chart-builder/utils";

type ChartBuilderState = {
  chartConfig: ChartConfig;
  columns: ColumnInfo[];
  data: DataRow[];
};

type ChartBuilderActions = {
  setChartConfig: (config: Partial<ChartConfig>) => void;
  setChartName: (name?: string) => void;
  setChartType: (type: ChartType) => void;
  setXColumn: (columnName?: string) => void;
  setYColumn: (columnName?: string) => void;
  setBreakdownColumn: (columnName?: string) => void;
  setShowTotal: (total: boolean) => void;

  getSelectedXColumn: () => ColumnInfo | undefined;
  getSelectedYColumn: () => ColumnInfo | undefined;
  getSelectedBreakdownColumn: () => ColumnInfo | undefined;
  getAvailableBreakdownColumns: () => ColumnInfo[];

  canSelectForYAxis: (columnName: string) => boolean;
  isValidChartConfiguration: () => boolean;
};

const defaultConfig: ChartConfig = {
  name: undefined,
  type: undefined,
  x: undefined,
  y: undefined,
  breakdown: undefined,
  total: false,
};

type ChartBuilderStore = ChartBuilderState & ChartBuilderActions;
type ChartBuilderStoreApi = ReturnType<typeof createChartBuilderStore>;

interface ChartBuilderProps {
  data: DataRow[];
}

const createChartBuilderStore = (props: Partial<ChartBuilderProps>) => {
  const chartState: ChartBuilderState = {
    chartConfig: defaultConfig,
    columns: transformDataToColumns(props?.data || []),
    data: props?.data || [],
  };

  return createStore<ChartBuilderStore>()(
    persist(
      (set, get) => ({
        ...chartState,
        setChartConfig: (config) =>
          set((state) => ({
            chartConfig: { ...state.chartConfig, ...config },
          })),

        setChartName: (name) =>
          set((state) => ({
            chartConfig: { ...state.chartConfig, name },
          })),

        setChartType: (type) =>
          set((state) => ({
            chartConfig: {
              ...state.chartConfig,
              type,
              x: undefined,
              y: undefined,
              breakdown: undefined,
            },
          })),

        setXColumn: (columnName) =>
          set((state) => ({
            chartConfig: { ...state.chartConfig, x: columnName },
          })),

        setYColumn: (columnName) =>
          set((state) => ({
            chartConfig: { ...state.chartConfig, y: columnName },
          })),

        setBreakdownColumn: (columnName) =>
          set((state) => ({
            chartConfig: { ...state.chartConfig, breakdown: columnName },
          })),

        setShowTotal: (total) =>
          set((state) => ({
            chartConfig: { ...state.chartConfig, total },
          })),

        getSelectedXColumn: () => {
          const { chartConfig, columns } = get();
          return chartConfig.x ? columns.find((col) => col.name === chartConfig.x) : undefined;
        },

        getSelectedYColumn: () => {
          const { chartConfig, columns } = get();
          return chartConfig.y ? columns.find((col) => col.name === chartConfig.y) : undefined;
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
      }),
      {
        name: "chart-builder-config",
        partialize: (state) => ({ chartConfig: state.chartConfig }),
      }
    )
  );
};

const ChartBuilderStoreContext = createContext<ChartBuilderStoreApi | null>(null);

export const useChartBuilderStoreContext = <T,>(selector: (store: ChartBuilderStore) => T): T => {
  const store = useContext(ChartBuilderStoreContext);
  if (!store) {
    throw new Error("useChartBuilderStoreContext must be used within a ChartBuilderStoreProvider");
  }
  return useStore(store, selector);
};

export const ChartBuilderStoreProvider = ({ children, ...props }: PropsWithChildren<ChartBuilderProps>) => {
  const storeRef = useRef<ChartBuilderStoreApi | undefined>(undefined);

  if (!storeRef.current) {
    storeRef.current = createChartBuilderStore(props);
  }
  return <ChartBuilderStoreContext.Provider value={storeRef.current}>{children}</ChartBuilderStoreContext.Provider>;
};
