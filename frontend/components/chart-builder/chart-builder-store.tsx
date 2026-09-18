import { createContext, type PropsWithChildren, useContext, useEffect, useState } from "react";
import { createStore, type StoreApi, useStore } from "zustand";
import { persist } from "zustand/middleware";

import { type ChartConfig, ChartType } from "@/components/chart-builder/types";
import {
  canSelectForXAxis as utilCanSelectForXAxis,
  canSelectForYAxis as utilCanSelectForYAxis,
  type ColumnInfo,
  type DataRow,
  getAvailableBreakdownColumns as utilGetAvailableBreakdownColumns,
  isValidChartConfiguration as utilIsValidChartConfiguration,
  reconcileChartConfig,
  transformDataToColumns,
} from "@/components/chart-builder/utils";

type ChartBuilderState = {
  chartConfig: ChartConfig;
  columns: ColumnInfo[];
  data: DataRow[];
  name: string | undefined;
  query: string;
};

type ChartBuilderActions = {
  setChartConfig: (config: Partial<ChartConfig>) => void;
  setChartName: (name?: string) => void;
  setChartType: (type: ChartType) => void;
  setXColumn: (columnName?: string) => void;
  setYColumn: (columnName?: string) => void;
  setBreakdownColumn: (columnName?: string) => void;
  setShowTotal: (total: boolean) => void;
  syncSource: (data: DataRow[], query: string) => void;

  getSelectedXColumn: () => ColumnInfo | undefined;
  getSelectedYColumn: () => ColumnInfo | undefined;
  getSelectedBreakdownColumn: () => ColumnInfo | undefined;
  getAvailableBreakdownColumns: () => ColumnInfo[];

  canSelectForXAxis: (columnName: string) => boolean;
  canSelectForYAxis: (columnName: string) => boolean;
  isValidChartConfiguration: () => boolean;
};

const defaultConfig: ChartConfig = {
  type: undefined,
  x: undefined,
  y: undefined,
  breakdown: undefined,
  total: false,
};

type ChartBuilderStore = ChartBuilderState & ChartBuilderActions;
type ChartBuilderStoreApi = ReturnType<typeof createChartBuilderStore>;

export interface ChartBuilderProps {
  data: DataRow[];
  query: string;
  storageKey?: string;
}

const createChartBuilderStore = (props: ChartBuilderProps) => {
  const initialColumns = transformDataToColumns(props?.data || []);
  const chartState: ChartBuilderState = {
    query: props.query,
    name: undefined,
    chartConfig: reconcileChartConfig(defaultConfig, initialColumns),
    columns: initialColumns,
    data: props?.data || [],
  };

  const storeConfig = (
    set: StoreApi<ChartBuilderStore>["setState"],
    get: StoreApi<ChartBuilderStore>["getState"]
  ): ChartBuilderStore => ({
    ...chartState,
    setChartConfig: (config) =>
      set((state: ChartBuilderState) => ({
        chartConfig: { ...state.chartConfig, ...config } as ChartConfig,
      })),

    setChartName: (name) =>
      set(() => ({
        name: name,
      })),

    setChartType: (type) =>
      set((state: ChartBuilderState) => {
        // Horizontal bars swap what each axis means, so crossing that boundary re-derives the axes
        // instead of keeping selections that would now plot a category as a value.
        const swapsAxes =
          (type === ChartType.HorizontalBarChart) !== (state.chartConfig.type === ChartType.HorizontalBarChart);
        const next = swapsAxes
          ? ({ ...state.chartConfig, type, x: undefined, y: undefined, breakdown: undefined } as ChartConfig)
          : ({ ...state.chartConfig, type } as ChartConfig);

        return { chartConfig: reconcileChartConfig(next, state.columns) };
      }),

    setXColumn: (columnName) =>
      set((state: ChartBuilderState) => ({
        chartConfig: { ...state.chartConfig, x: columnName },
      })),

    setYColumn: (columnName) =>
      set((state: ChartBuilderState) => ({
        chartConfig: { ...state.chartConfig, y: columnName },
      })),

    setBreakdownColumn: (columnName) =>
      set((state: ChartBuilderState) => ({
        chartConfig: { ...state.chartConfig, breakdown: columnName },
      })),

    setShowTotal: (total) =>
      set((state: ChartBuilderState) => ({
        chartConfig: { ...state.chartConfig, total },
      })),

    syncSource: (data, query) => {
      const state = get();
      if (state.data === data && state.query === query) return;

      const columns = state.data === data ? state.columns : transformDataToColumns(data);

      set({
        data,
        query,
        columns,
        chartConfig: state.columns === columns ? state.chartConfig : reconcileChartConfig(state.chartConfig, columns),
      });
    },

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

    canSelectForXAxis: (columnName: string) => {
      const { chartConfig, columns } = get();
      const column = columns.find((col) => col.name === columnName);
      if (!column) return false;
      return utilCanSelectForXAxis(column, chartConfig.type);
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
  });

  if (props.storageKey) {
    return createStore<ChartBuilderStore>()(
      persist(storeConfig, {
        name: `sql-chart-builder-${props.storageKey}`,
        partialize: (state) => ({
          chartConfig: state.chartConfig,
        }),
        // A stored config outlives the query that produced it, so it is reconciled against the
        // current columns as it is rehydrated rather than one paint later.
        merge: (persisted, current) => {
          const stored = (persisted as Partial<ChartBuilderState> | undefined)?.chartConfig;
          return {
            ...current,
            chartConfig: reconcileChartConfig(stored ?? current.chartConfig, current.columns),
          };
        },
      })
    );
  }

  return createStore<ChartBuilderStore>()(storeConfig);
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
  const [storeState] = useState(() => createChartBuilderStore(props));
  const { data, query } = props;

  // The store is created once, but a re-run query hands down new rows (and new columns) — without
  // this the chart keeps rendering the shape of the first result set it ever saw.
  useEffect(() => {
    storeState.getState().syncSource(data, query);
  }, [storeState, data, query]);

  return <ChartBuilderStoreContext.Provider value={storeState}>{children}</ChartBuilderStoreContext.Provider>;
};
