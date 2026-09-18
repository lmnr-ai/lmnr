import { format, startOfToday, subDays } from "date-fns";
import { isDate, isNil } from "lodash";
import { mutate } from "swr";
import { create } from "zustand";

import { toast } from "@/lib/hooks/use-toast";

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

export type SaveStatus = "saved" | "unsaved" | "saving" | "error";

const AUTOSAVE_DEBOUNCE_MS = 500;

type PendingSave = { projectId: string; templateId: string; query: string };

/**
 * Autosave state deliberately lives outside React. The previous implementation rebuilt its debounced
 * saver whenever the template name changed and cancelled the old one on cleanup, so renaming right
 * after typing dropped the queued query. Module state has exactly one lifetime — the tab's — so no
 * render, remount or navigation can drop a queued edit; the only way out is a completed PUT.
 */
let pendingSave: PendingSave | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let inFlightSave: Promise<void> | null = null;

const putQuery = async ({ projectId, templateId, query }: PendingSave, keepalive: boolean) => {
  const res = await fetch(`/api/projects/${projectId}/sql/templates/${templateId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    // The query only. The rename path PUTs the name only, so the two can't clobber each other.
    body: JSON.stringify({ query }),
    keepalive,
  });

  if (!res.ok) {
    const errMessage = await res
      .json()
      .then((d) => d?.error)
      .catch(() => null);
    throw new Error(errMessage ?? "Failed to save query");
  }
};

const runSave = (setStatus: (status: SaveStatus) => void, keepalive: boolean): Promise<void> => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  const save = pendingSave;
  if (!save) return inFlightSave ?? Promise.resolve();
  // Serialize PUTs of the same template so two saves can't land out of order.
  if (inFlightSave) return inFlightSave.then(() => runSave(setStatus, keepalive));

  pendingSave = null;
  setStatus("saving");

  inFlightSave = (async () => {
    try {
      await putQuery(save, keepalive);
      // Keep the templates list in sync. The rename path reads its copy of the query, and a stale
      // copy there is what used to travel back to the server and undo the edit.
      await mutate<SQLTemplate[]>(
        `/api/projects/${save.projectId}/sql/templates`,
        (current) => current?.map((t) => (t.id === save.templateId ? { ...t, query: save.query } : t)),
        { revalidate: false }
      );
      setStatus(pendingSave ? "unsaved" : "saved");
    } catch (e) {
      // Requeue the edit so the next flush retries it instead of losing it.
      pendingSave ??= save;
      setStatus("error");
      toast({
        variant: "destructive",
        title: "Failed to save query",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      inFlightSave = null;
    }
  })();

  return inFlightSave;
};

export type SqlEditorState = {
  editTemplate: SQLTemplate | undefined;
  currentTemplate: SQLTemplate | undefined;
  parameters: SQLParameter[];
  saveStatus: SaveStatus;
};

export type SqlEditorActions = {
  setEditTemplate: (query: SQLTemplate | undefined) => void;
  /** Point the editor at a template from the list, keeping unsaved keystrokes for the same id. */
  selectTemplate: (template: SQLTemplate | undefined) => void;
  setQuery: (projectId: string, query: string) => void;
  /** Save anything queued right now — before a rename, a run, or leaving the page. */
  flushQuerySave: (options?: { keepalive?: boolean }) => Promise<void>;
  setParameterValue: (name: string, value: SQLParameter["value"]) => void;
  getFormattedParameters: () => Record<string, string | number>;
};

const initialParameters: SQLParameter[] = [
  { name: "start_time", value: subDays(startOfToday(), 7), type: "date" },
  { name: "end_time", value: startOfToday(), type: "date" },
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
  saveStatus: "saved",
};

export type SqlEditorStore = SqlEditorState & SqlEditorActions;

export const useSqlEditorStore = create<SqlEditorStore>()((set, get) => ({
  ...initialState,

  setEditTemplate: (template) => {
    set({ editTemplate: template });
  },
  selectTemplate: (template) => {
    const current = get().currentTemplate;

    if (template && current?.id === template.id) {
      // Same query, refreshed from the list: adopt server-side fields (a rename) but keep the text
      // in the editor, which may hold keystrokes the list hasn't caught up with yet.
      set({ currentTemplate: { ...template, query: current.query } });
      return;
    }

    // Switching away: land whatever is still queued for the previous query.
    if (pendingSave) {
      void runSave((saveStatus) => set({ saveStatus }), false);
    }

    set({ currentTemplate: template, saveStatus: "saved" });
  },
  setQuery: (projectId, query) => {
    const current = get().currentTemplate;
    if (!current || current.query === query) return;

    set({ currentTemplate: { ...current, query }, saveStatus: "unsaved" });

    pendingSave = { projectId, templateId: current.id, query };
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => runSave((saveStatus) => set({ saveStatus }), false), AUTOSAVE_DEBOUNCE_MS);
  },
  flushQuerySave: (options) => runSave((saveStatus) => set({ saveStatus }), options?.keepalive ?? false),
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
}));
