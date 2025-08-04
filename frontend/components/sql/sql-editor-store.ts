import { format, startOfToday, subDays } from "date-fns";
import { isDate, isNil } from "lodash";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SQLTemplate {
  id: string;
  name: string;
  query: string;
  createdAt: string;
  projectId: string;
}

export type SQLParameter = {
  name: string;
} & (DateParameter | StringParameter | NumberParameter);

type DateParameter = { value?: Date; type: "date" };
type StringParameter = { value?: string; type: "string" };
type NumberParameter = { value?: number; type: "number" };

export type SqlEditorState = {
  editTemplate: SQLTemplate | undefined;
  currentTemplate: SQLTemplate | undefined;
  parameters: SQLParameter[];
};

export type SqlEditorActions = {
  setEditTemplate: (query: SQLTemplate | undefined) => void;
  setCurrentTemplate: (query: SQLTemplate | undefined) => void;
  onCurrentTemplateChange: (e: string) => void;
  setParameterValue: (name: string, value: SQLParameter["value"]) => void;
  getFormattedParameters: () => Record<string, string | number>;
};

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
          parameters: state.parameters.map((param) =>
            param.name === name ? { ...param, value: value } : param
          ) as SQLParameter[],
        }));
      },
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
    }),
    {
      name: "sql-editor-storage",
      partialize: (state) => ({
        selectedQueryId: state.currentTemplate?.id,
      }),
    }
  )
);
