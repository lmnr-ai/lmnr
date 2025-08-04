"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format, startOfToday, subDays } from "date-fns";
import { isDate, isEmpty, isNil, isObject, map } from "lodash";
import { createContext, PropsWithChildren, useContext, useRef } from "react";
import { createStore, useStore } from "zustand";
import { persist } from "zustand/middleware";

import { DashboardChart } from "@/components/dashboard/types";
import { SQLParameter } from "@/components/sql/sql-editor-store";

type DashboardEditorState = {
  chart: { id?: string; createdAt?: string } & Omit<DashboardChart, "id" | "createdAt">;
  isLoading: boolean;
  error: string | null;
  data: Record<string, string | number | boolean>[];
  columns: ColumnDef<any>[];
  parameters: SQLParameter[];
  tab: TabType;
};

type DashboardEditorActions = {
  setTab: (tab: TabType) => void;
  setChart: (chart: DashboardChart) => void;
  setQuery: (query: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setData: (data: Record<string, string | number | boolean>[]) => void;
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
  { name: "start_time", value: subDays(startOfToday(), 7), type: "date" },
  { name: "end_time", value: startOfToday(), type: "date" },
  {
    name: "interval_number",
    value: 1,
    type: "number",
  },
  {
    name: "interval_unit",
    value: "HOUR",
    type: "string",
  },
];

type DashboardEditorStore = DashboardEditorState & DashboardEditorActions;
type DashboardEditorStoreApi = ReturnType<typeof createDashboardEditorStore>;

export interface DashboardEditorProps {
  chart?: DashboardChart;
}

const defaultChart: DashboardEditorState["chart"] = {
  name: "",
  query:
    "-- Top 5 most frequent span names within a time range\n" +
    "-- This example shows how to use parameterized queries with time filters\n" +
    "\n" +
    "SELECT \n" +
    "    name,\n" +
    "    COUNT(span_id) AS value\n" +
    "FROM spans\n" +
    "WHERE\n" +
    "    -- Parameters are defined using {param_name:Type} syntax\n" +
    '    -- Configure these values in the "Parameters" tab below\n' +
    "    start_time >= {start_time:DateTime64}\n" +
    "    AND start_time <= {end_time:DateTime64}\n" +
    "GROUP BY name\n" +
    "ORDER BY value DESC\n" +
    "LIMIT 5",
  settings: {
    config: {
      x: undefined,
      y: undefined,
      total: undefined,
      breakdown: undefined,
      type: undefined,
    },
    layout: {
      x: 0,
      y: 0,
      h: 4,
      w: 6,
    },
  },
};

const createDashboardEditorStore = (props: DashboardEditorProps) => {
  const editorState: DashboardEditorState = {
    tab: TabType.Chart,
    chart: props.chart || defaultChart,
    columns: [],
    isLoading: false,
    error: null,
    data: [],
    parameters: initialParameters,
  };

  return createStore<DashboardEditorStore>()(
    persist(
      (set, get) => ({
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

        setLoading: (isLoading) => {
          set({ isLoading });
        },

        setError: (error) => {
          set({ error });
        },

        setData: (data) => {
          set({ data });
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
          const { chart, setLoading, setError, setData, getFormattedParameters } = get();

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
              set({
                columns: Object.keys(data?.[0]).map((column) => ({
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
                })),
              });
            }
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Error executing the query. Please try again.";
            setError(errorMessage);
            setData([]);
          } finally {
            set({ tab: TabType.Chart });
            setLoading(false);
          }
        },
      }),
      {
        name: "dashboard-editor-storage",
        partialize: (state) => ({
          parameters: state.parameters,
        }),
        onRehydrateStorage: () => (state) => {
          if (state?.parameters) {
            state.parameters = map(state.parameters, (p) =>
              p.type === "date" ? { ...p, value: p.value ? new Date(p.value) : p.value } : p
            );
          }
        },
      }
    )
  );
};

const DashboardEditorStoreContext = createContext<DashboardEditorStoreApi | null>(null);

export const useDashboardEditorStoreContext = <T,>(selector: (store: DashboardEditorStore) => T): T => {
  const store = useContext(DashboardEditorStoreContext);
  if (!store) {
    throw new Error("useDashboardEditorStoreContext must be used within a DashboardEditorStoreProvider");
  }
  return useStore(store, selector);
};

export const DashboardEditorStoreProvider = ({ children, ...props }: PropsWithChildren<DashboardEditorProps>) => {
  const storeRef = useRef<DashboardEditorStoreApi | undefined>(undefined);

  if (!storeRef.current) {
    storeRef.current = createDashboardEditorStore(props);
  }

  return (
    <DashboardEditorStoreContext.Provider value={storeRef.current}>{children}</DashboardEditorStoreContext.Provider>
  );
};
