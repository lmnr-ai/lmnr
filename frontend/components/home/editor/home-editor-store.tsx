"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { format, subDays } from "date-fns";
import { isDate, isEmpty, isNil, isObject } from "lodash";
import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore, useStore } from "zustand";

import { ChartType, type DisplayMode } from "@/components/chart-builder/types.ts";
import { type HomeChart } from "@/components/home/types";
import { type SQLParameter } from "@/components/sql/sql-editor-store";

type HomeEditorState = {
  chart: { id?: string; createdAt?: string } & Omit<HomeChart, "id" | "createdAt">;
  isLoading: boolean;
  error: string | null;
  data: Record<string, string | number | boolean>[];
  columns: ColumnDef<any>[];
  parameters: SQLParameter[];
  tab: TabType;
};

type HomeEditorActions = {
  setTab: (tab: TabType) => void;
  setChart: (chart: HomeChart) => void;
  setQuery: (query: string) => void;
  setName: (name: string) => void;
  setChartConfig: (config: HomeChart["settings"]["config"]) => void;
  setDisplayMode: (displayMode: DisplayMode) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setData: (data: Record<string, string | number | boolean>[]) => void;
  setColumns: (columns: ColumnDef<any>[]) => void;
  setParameterValue: (name: string, value: SQLParameter["value"]) => void;
  getFormattedParameters: () => Record<string, string | number>;
  executeQuery: (projectId: string) => Promise<void>;
};

enum TabType {
  Table = "table",
  Chart = "chart",
  Parameters = "parameters",
}

const initialParameters: SQLParameter[] = [
  { name: "start_time", value: subDays(new Date(), 1), type: "date" },
  { name: "end_time", value: new Date(), type: "date" },
  {
    name: "interval_unit",
    value: "HOUR",
    type: "string",
  },
];

type HomeEditorStore = HomeEditorState & HomeEditorActions;
type HomeEditorStoreApi = ReturnType<typeof createHomeEditorStore>;

export interface HomeEditorProps {
  chart?: HomeChart;
}

const defaultChart: HomeEditorState["chart"] = {
  name: "",
  query: "",
  settings: {
    config: {
      x: undefined,
      y: undefined,
      displayMode: "none",
      breakdown: undefined,
      type: ChartType.LineChart,
    },
    layout: {
      x: 0,
      y: 0,
      h: 4,
      w: 6,
    },
  },
};

const createHomeEditorStore = (props: HomeEditorProps) => {
  const editorState: HomeEditorState = {
    tab: TabType.Chart,
    chart: props.chart || defaultChart,
    columns: [],
    isLoading: false,
    error: null,
    data: [],
    parameters: initialParameters,
  };

  return createStore<HomeEditorStore>()((set, get) => ({
    ...editorState,

    setTab: (tab) => {
      set({ tab });
    },
    setChart: (chart) => {
      set({ chart });
    },

    setQuery: (query) =>
      set((state) => ({
        chart: { ...state.chart, query },
      })),

    setName: (name) =>
      set((state) => ({
        chart: { ...state.chart, name },
      })),

    setChartConfig: (config) =>
      set((state) => ({
        chart: {
          ...state.chart,
          settings: {
            ...state.chart.settings,
            config,
          },
        },
      })),

    setDisplayMode: (displayMode) =>
      set((state) => ({
        chart: {
          ...state.chart,
          settings: {
            ...state.chart.settings,
            config: {
              ...state.chart.settings.config,
              displayMode,
              total: undefined,
            },
          },
        },
      })),

    setLoading: (isLoading) => {
      set({ isLoading });
    },

    setError: (error) => {
      set({ error });
    },

    setData: (data) => {
      set({ data });
    },

    setColumns: (columns) => {
      set({ columns });
    },

    setParameterValue: (name, value) =>
      set((state) => ({
        parameters: state.parameters.map((param) =>
          param.name === name ? { ...param, value } : param
        ) as SQLParameter[],
      })),

    getFormattedParameters: () => {
      const { parameters } = get();

      return parameters.reduce(
        (formatted, param) => {
          if (!isNil(param.value)) {
            if (isDate(param.value)) {
              formatted[param.name] = format(param.value, "yyyy-MM-dd HH:mm:ss.SSS");
            } else if (param.type === "number") {
              formatted[param.name] = Number(param.value);
            } else {
              formatted[param.name] = param.value;
            }
          }
          return formatted;
        },
        {} as Record<string, string | number>
      );
    },

    executeQuery: async (projectId: string) => {
      const { chart, setLoading, setError, setData, setColumns, getFormattedParameters } = get();

      if (!chart.query?.trim()) {
        setError("Query is required");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const parameters = getFormattedParameters();
        const response = await fetch(`/api/projects/${projectId}/sql`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: chart.query, parameters }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || `Query failed with status ${response.status}`);
        }

        setData(Array.isArray(data) ? data : []);
        if (!isEmpty(data)) {
          setColumns(
            Object.keys(data?.[0]).map((column) => ({
              header: column,
              accessorFn: (row: any) => {
                const value = row[column];
                if (isNil(value)) return "NULL";
                if (isObject(value)) {
                  try {
                    const serialized = JSON.stringify(value);
                    return serialized.length > 100 ? `${serialized.slice(0, 100)}...` : serialized;
                  } catch {
                    return "[Object]";
                  }
                }
                return String(value);
              },
            }))
          );
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Error executing the query. Please try again.";
        setError(errorMessage);
        setData([]);
        setColumns([]);
      } finally {
        set({ tab: TabType.Chart });
        setLoading(false);
      }
    },
  }));
};

const HomeEditorStoreContext = createContext<HomeEditorStoreApi | null>(null);

export const useHomeEditorStoreContext = <T,>(selector: (store: HomeEditorStore) => T): T => {
  const store = useContext(HomeEditorStoreContext);
  if (!store) {
    throw new Error("useHomeEditorStoreContext must be used within a HomeEditorStoreProvider");
  }
  return useStore(store, selector);
};

export const HomeEditorStoreProvider = ({ children, ...props }: PropsWithChildren<HomeEditorProps>) => {
  const [storeState] = useState(() => createHomeEditorStore(props));

  return <HomeEditorStoreContext.Provider value={storeState}>{children}</HomeEditorStoreContext.Provider>;
};
