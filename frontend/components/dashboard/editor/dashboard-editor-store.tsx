"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
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
};

type DashboardEditorActions = {
  setChart: (chart: DashboardChart) => void;
  setQuery: (query: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setData: (data: Record<string, string | number | boolean>[]) => void;
  setParameterValue: (name: string, value?: Date) => void;
  getFormattedParameters: () => Record<string, string | number>;
  executeQuery: (projectId: string) => Promise<void>;
  reset: () => void;
};

const initialParameters: SQLParameter[] = [
  { name: "start_time", value: undefined, type: "date" },
  { name: "end_time", value: undefined, type: "date" },
];

type DashboardEditorStore = DashboardEditorState & DashboardEditorActions;
type DashboardEditorStoreApi = ReturnType<typeof createDashboardEditorStore>;

export interface DashboardEditorProps {
  chart?: DashboardChart;
}

const defaultChart: DashboardEditorState["chart"] = {
  name: "",
  query: "",
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
            parameters: state.parameters.map((param) => (param.name === name ? { ...param, value } : param)),
          })),

        getFormattedParameters: () => {
          const { parameters } = get();
          const formatted: Record<string, string | number> = {};

          parameters.forEach((variable) => {
            if (!isNil(variable.value) && isDate(variable.value)) {
              formatted[variable.name] = format(variable.value, "yyyy-MM-dd HH:mm:ss.SSS");
            }
          });

          return formatted;
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
            setLoading(false);
          }
        },

        reset: () => {
          set(editorState);
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
