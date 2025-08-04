import { isDate, isNil, map } from "lodash";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { SQLParameter } from "@/components/sql/sql-editor-store";

export type DashboardEditorState = {
  query: string;
  isLoading: boolean;
  error: string | null;
  data: Record<string, string | number | boolean>[];
  parameters: SQLParameter[];
};

export type DashboardEditorActions = {
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

const initialState: DashboardEditorState = {
  query: "",
  isLoading: false,
  error: null,
  data: [],
  parameters: initialParameters,
};

export type DashboardEditorStore = DashboardEditorState & DashboardEditorActions;

export const useDashboardEditorStore = create<DashboardEditorStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setQuery: (query) => {
        set({ query });
      },

      setLoading: (isLoading) => {
        set({ isLoading });
      },

      setError: (error) => {
        set({ error });
      },

      setData: (data) => {
        set({ data });
      },

      setParameterValue: (name, value) => {
        set((state) => ({
          parameters: state.parameters.map((param) => (param.name === name ? { ...param, value } : param)),
        }));
      },

      getFormattedParameters: () => {
        const { parameters } = get();
        const formatted: Record<string, string | number> = {};

        parameters.forEach((variable) => {
          if (!isNil(variable.value) && isDate(variable.value)) {
            formatted[variable.name] = variable.value.toISOString().slice(0, -1).replace("T", " ");
          }
        });

        return formatted;
      },

      executeQuery: async (projectId: string) => {
        const { query, setLoading, setError, setData, getFormattedParameters } = get();

        if (!query?.trim()) {
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
            body: JSON.stringify({ query, parameters }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data?.error || `Query failed with status ${response.status}`);
          }

          setData(Array.isArray(data) ? data : []);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "Error executing the query. Please try again.";
          setError(errorMessage);
          setData([]);
        } finally {
          setLoading(false);
        }
      },

      reset: () => {
        set(initialState);
      },
    }),
    {
      name: "dashboard-editor-storage",
      partialize: (state) => ({
        query: state.query,
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
