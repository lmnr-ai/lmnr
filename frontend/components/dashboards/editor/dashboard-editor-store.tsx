"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { isEmpty, isNil, isObject } from "lodash";
import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore, useStore } from "zustand";

import { ChartType, type DisplayMode } from "@/components/chart-builder/types.ts";
import { type EditorMode } from "@/components/dashboards/editor/chart-editor-mode";
import { TABLE_PAGE_SIZE } from "@/components/dashboards/editor/constants";
import { paginateQuery } from "@/components/dashboards/editor/utils";
import { type DashboardChart } from "@/components/dashboards/types";
import { type TimeParameters } from "@/lib/time";

type DashboardEditorState = {
  chart: { id?: string; createdAt?: string; dashboardId?: string } & Omit<
    DashboardChart,
    "id" | "createdAt" | "dashboardId"
  >;
  isLoading: boolean;
  error: string | null;
  data: Record<string, string | number | boolean>[];
  columns: ColumnDef<any>[];
  editorMode: EditorMode;
  tab: TabType;
  tableHasMore: boolean;
  tableIsFetching: boolean;
  tablePage: number;
};

type DashboardEditorActions = {
  setTab: (tab: TabType) => void;
  setEditorMode: (editorMode: EditorMode) => void;
  setChart: (chart: DashboardChart) => void;
  setQuery: (query: string) => void;
  setName: (name: string) => void;
  setChartConfig: (config: DashboardChart["settings"]["config"]) => void;
  setDisplayMode: (displayMode: DisplayMode) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setData: (data: Record<string, string | number | boolean>[]) => void;
  setColumns: (columns: ColumnDef<any>[]) => void;
  executeQuery: (projectId: string, parameters: TimeParameters, paginateTable?: boolean) => Promise<void>;
  fetchNextTablePage: (projectId: string, parameters: TimeParameters) => Promise<void>;
};

enum TabType {
  Table = "table",
  Chart = "chart",
  Parameters = "parameters",
}

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

const createDashboardEditorStore = (props: DashboardEditorProps) => {
  // Cancels an in-flight pagination fetch when the query changes underneath it
  // (e.g. user scrolls mid-fetch, then changes filter → executeQuery resets
  // page 0). Without this the paginated rows would splice onto fresh data.
  let paginationAbortController: AbortController | null = null;
  let queryAbortController: AbortController | null = null;

  const editorState: DashboardEditorState = {
    tab: TabType.Chart,
    chart: props.chart || defaultChart,
    columns: [],
    isLoading: false,
    error: null,
    data: [],
    editorMode: "visual",
    tableHasMore: false,
    tableIsFetching: false,
    tablePage: 0,
  };

  return createStore<DashboardEditorStore>()((set, get) => ({
    ...editorState,

    setTab: (tab) => {
      set({ tab });
    },
    setEditorMode: (editorMode) => set({ editorMode }),
    setChart: (chart) => {
      set({ chart });
    },

    setQuery: (query) => {
      queryAbortController?.abort();
      queryAbortController = null;
      paginationAbortController?.abort();
      paginationAbortController = null;
      set((state) => ({
        chart: { ...state.chart, query },
        isLoading: false,
        error: null,
        data: [],
        columns: [],
        tableHasMore: false,
        tableIsFetching: false,
      }));
    },

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

    executeQuery: async (projectId, parameters, paginateTable = true) => {
      const { chart, setLoading, setError, setData, setColumns } = get();

      if (!chart.query?.trim()) {
        setError("Query is required");
        return;
      }

      // Cancel any in-flight pagination — it would splice onto the stale data
      // we're about to replace.
      if (paginationAbortController) {
        paginationAbortController.abort();
        paginationAbortController = null;
        set({ tableIsFetching: false });
      }

      queryAbortController?.abort();
      const controller = new AbortController();
      queryAbortController = controller;
      setLoading(true);
      setError(null);

      const isTable = chart.settings.config.type === ChartType.Table;

      try {
        const query = isTable && paginateTable ? paginateQuery(chart.query, 0) : chart.query;
        const response = await fetch(`/api/projects/${projectId}/sql`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, parameters }),
          signal: controller.signal,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || `Query failed with status ${response.status}`);
        }

        const rows: Record<string, any>[] = Array.isArray(data) ? data : [];

        if (isTable && paginateTable) {
          const hasMore = rows.length > TABLE_PAGE_SIZE;
          const pageRows = hasMore ? rows.slice(0, TABLE_PAGE_SIZE) : rows;
          setData(pageRows);
          set({ tableHasMore: hasMore, tablePage: 0, tableIsFetching: false });
        } else {
          setData(rows);
          set({ tableHasMore: false, tablePage: 0, tableIsFetching: false });
        }

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
        if (controller.signal.aborted) return;
        const errorMessage = err instanceof Error ? err.message : "Error executing the query. Please try again.";
        setError(errorMessage);
        setData([]);
        setColumns([]);
      } finally {
        if (queryAbortController === controller) {
          queryAbortController = null;
          set({ tab: TabType.Chart, isLoading: false });
        }
      }
    },

    fetchNextTablePage: async (projectId, parameters) => {
      const { chart, tableIsFetching, tableHasMore, tablePage } = get();

      if (tableIsFetching || !tableHasMore || !chart.query?.trim()) return;

      // Abort any prior pagination (e.g. rapid scroll fires multiple times).
      paginationAbortController?.abort();
      const controller = new AbortController();
      paginationAbortController = controller;

      set({ tableIsFetching: true });
      const nextPage = tablePage + 1;

      try {
        const query = paginateQuery(chart.query, nextPage);
        const response = await fetch(`/api/projects/${projectId}/sql`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, parameters }),
          signal: controller.signal,
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result?.error || `Query failed with status ${response.status}`);
        }

        const rows: Record<string, any>[] = Array.isArray(result) ? result : [];
        const hasMore = rows.length > TABLE_PAGE_SIZE;
        const pageRows = hasMore ? rows.slice(0, TABLE_PAGE_SIZE) : rows;

        set((state) => ({
          data: [...state.data, ...pageRows],
          tablePage: nextPage,
          tableHasMore: hasMore,
          tableIsFetching: false,
        }));
      } catch {
        // Aborted — whoever replaced us (executeQuery or newer scroll) owns state.
        if (controller.signal.aborted) return;
        set({ tableIsFetching: false });
      } finally {
        if (paginationAbortController === controller) {
          paginationAbortController = null;
        }
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
  const [storeState] = useState(() => createDashboardEditorStore(props));

  return <DashboardEditorStoreContext.Provider value={storeState}>{children}</DashboardEditorStoreContext.Provider>;
};
