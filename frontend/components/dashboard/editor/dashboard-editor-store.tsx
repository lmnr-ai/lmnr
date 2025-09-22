"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format, startOfToday, subDays } from "date-fns";
import { isDate, isEmpty, isNil, isObject } from "lodash";
import { createContext, PropsWithChildren, useContext, useRef } from "react";
import { createStore, useStore } from "zustand";

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
    "-- [QUERY EXAMPLE] \n" +
    "-- Model Performance Analysis: 90th Percentile Latency Over Time\n" +
    "-- This query analyzes model execution latency grouped by time intervals and model type\n" +
    "-- Returns continuous time series data with 90th percentile response times\n" +
    "\n" +
    "SELECT\n" +
    "    -- Round timestamps to interval boundaries (hour, day, etc.)\n" +
    "    toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time,\n" +
    "    model,\n" +
    "    -- Calculate 90th percentile of execution duration\n" +
    "    quantile(0.9)(end_time - start_time) AS value\n" +
    "FROM spans\n" +
    "WHERE\n" +
    "    -- Filter out null models and focus on LLM/generation spans\n" +
    "    model != '<null>'\n" +
    "  AND span_type = 'LLM'\n" +
    "    -- Parameters are defined using {param_name:Type} syntax\n" +
    '    -- Configure these values in the "Parameters" tab below\n' +
    "  AND start_time >= {start_time:DateTime64}\n" +
    "  AND start_time <= {end_time:DateTime64}\n" +
    "GROUP BY time, model\n" +
    "ORDER BY time\n" +
    "-- WITH FILL ensures continuous time series even for periods with no data\n" +
    "WITH FILL\n" +
    "FROM toStartOfInterval({start_time:DateTime64}, toInterval(1, {interval_unit:String}))\n" +
    "    TO toStartOfInterval({end_time:DateTime64}, toInterval(1, {interval_unit:String}))\n" +
    "    STEP toInterval(1, {interval_unit:String})",
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

  return createStore<DashboardEditorStore>()((set, get) => ({
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
  }));
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
