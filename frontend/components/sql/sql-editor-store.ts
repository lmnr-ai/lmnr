import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SQLTemplate {
  id: string;
  name: string;
  query: string;
  createdAt: string;
  projectId: string;
}

export type SqlEditorState = {
  editTemplate: SQLTemplate | undefined;
  currentTemplate: SQLTemplate | undefined;
};

export type SqlEditorActions = {
  setEditTemplate: (query: SQLTemplate | undefined) => void;
  setCurrentTemplate: (query: SQLTemplate | undefined) => void;
  onCurrentTemplateChange: (e: string) => void;
};

const initialState: SqlEditorState = {
  editTemplate: undefined,
  currentTemplate: undefined,
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
    }),
    {
      name: "sql-editor-storage",
      partialize: (state) => ({
        selectedQueryId: state.currentTemplate?.id,
      }),
    }
  )
);
