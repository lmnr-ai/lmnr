import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SQLTemplate {
  id: string;
  name: string;
  query: string;
  createdAt: string;
  projectId: string;
}

export interface SQLParameter {
  name: string;
  value?: Date;
  type: "date";
}

export type SqlEditorState = {
  editTemplate: SQLTemplate | undefined;
  currentTemplate: SQLTemplate | undefined;
  parameters: SQLParameter[];
};

export type SqlEditorActions = {
  setEditTemplate: (query: SQLTemplate | undefined) => void;
  setCurrentTemplate: (query: SQLTemplate | undefined) => void;
  onCurrentTemplateChange: (e: string) => void;
  setParameterValue: (name: string, value?: Date) => void;
  getFormattedParameters: () => Record<string, string>;
};

const initialParameters: SQLParameter[] = [
  { name: "start_time", value: undefined, type: "date" },
  { name: "end_time", value: undefined, type: "date" },
];

const initialState: SqlEditorState = {
  editTemplate: undefined,
  currentTemplate: undefined,
  parameters: initialParameters,
};

export type SqlEditorStore = SqlEditorState & SqlEditorActions;

export const useSqlEditorStore = create<SqlEditorStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setEditTemplate: (template) => {
        set({ editTemplate: template });
      },
      setCurrentTemplate: (template) => {
        set({ currentTemplate: template });
      },
      onCurrentTemplateChange: (e) => {
        const current = get().currentTemplate;
        if (current) {
          set({ currentTemplate: { ...current, query: e } });
        }
      },
      setParameterValue: (name, value) => {
        set((state) => ({
          parameters: state.parameters.map((param) => (param.name === name ? { ...param, value } : param)),
        }));
      },
      getFormattedParameters: () => {
        const { parameters } = get();
        const formatted: Record<string, string> = {};

        parameters.forEach((variable) => {
          if (variable.value) {
            formatted[variable.name] = variable.value.toISOString().slice(0, -1).replace("T", " ");
          }
        });

        return formatted;
      },
    }),
    {
      name: "sql-editor-storage",
      partialize: (state) => ({
        selectedQueryId: state.currentTemplate?.id,
      }),
    }
  )
);
