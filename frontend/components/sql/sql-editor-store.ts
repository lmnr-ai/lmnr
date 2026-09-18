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
/** The request itself, plus the handle that lets a delete cancel it. */
type InFlightSave = { promise: Promise<void>; abort: AbortController };

/**
 * Autosave state deliberately lives outside React. The previous implementation rebuilt its debounced
 * saver whenever the template name changed and cancelled the old one on cleanup, so renaming right
 * after typing dropped the queued query. Module state has exactly one lifetime — the tab's — so no
 * render, remount or navigation can drop a queued edit; the only way out is a completed PUT.
 *
 * Everything is keyed by template id: a save queued or in flight for one query must not be dropped
 * by, retried against, or reported as the save status of another.
 */
const pendingSaves = new Map<string, PendingSave>();
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const inFlightSaves = new Map<string, InFlightSave>();

/**
 * Query text this tab has typed but not confirmed persisted yet. The templates list lags until the PUT
 * resolves and patches SWR, so switching away and back inside that window would otherwise reload the
 * pre-edit query from the cache and let the next keystroke undo the save that just landed.
 */
const unconfirmedQueries = new Map<string, string>();

type StatusSetter = (templateId: string, status: SaveStatus) => void;

const clearSaveTimer = (templateId: string) => {
  const timer = saveTimers.get(templateId);
  if (timer) {
    clearTimeout(timer);
    saveTimers.delete(templateId);
  }
};

const putQuery = async ({ projectId, templateId, query }: PendingSave, keepalive: boolean, signal: AbortSignal) => {
  const res = await fetch(`/api/projects/${projectId}/sql/templates/${templateId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    // The query only. The rename path PUTs the name only, so the two can't clobber each other.
    body: JSON.stringify({ query }),
    keepalive,
    signal,
  });

  if (!res.ok) {
    const errMessage = await res
      .json()
      .then((d) => d?.error)
      .catch(() => null);
    throw new Error(errMessage ?? "Failed to save query");
  }
};

const runSave = (templateId: string, setStatus: StatusSetter, keepalive: boolean): Promise<void> => {
  clearSaveTimer(templateId);

  const save = pendingSaves.get(templateId);
  const inFlight = inFlightSaves.get(templateId);
  if (!save) return inFlight?.promise ?? Promise.resolve();
  // Serialize PUTs of the same template so two saves can't land out of order.
  if (inFlight) return inFlight.promise.then(() => runSave(templateId, setStatus, keepalive));

  pendingSaves.delete(templateId);
  setStatus(templateId, "saving");

  const abort = new AbortController();
  const promise = (async () => {
    try {
      await putQuery(save, keepalive, abort.signal);
      // Keep the templates list in sync. The rename path reads its copy of the query, and a stale
      // copy there is what used to travel back to the server and undo the edit.
      await mutate<SQLTemplate[]>(
        `/api/projects/${save.projectId}/sql/templates`,
        (current) => current?.map((t) => (t.id === templateId ? { ...t, query: save.query } : t)),
        { revalidate: false }
      );
      // Only this exact text is confirmed; a newer edit typed mid-flight stays unconfirmed.
      if (unconfirmedQueries.get(templateId) === save.query) unconfirmedQueries.delete(templateId);
      setStatus(templateId, pendingSaves.has(templateId) ? "unsaved" : "saved");
    } catch (e) {
      // Aborted means the template is being deleted: there is no row left to retry against, and a
      // "failed to save" toast for a query the user just removed is noise. Drop it silently.
      if (abort.signal.aborted) return;
      // Requeue the edit so the next flush retries it instead of losing it, unless a newer edit for
      // this same query is already queued.
      if (!pendingSaves.has(templateId)) pendingSaves.set(templateId, save);
      setStatus(templateId, "error");
      toast({
        variant: "destructive",
        title: "Failed to save query",
        description: e instanceof Error ? e.message : undefined,
      });
    }
  })().finally(() => {
    if (inFlightSaves.get(templateId)?.promise === promise) inFlightSaves.delete(templateId);
  });

  inFlightSaves.set(templateId, { promise, abort });
  return promise;
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
  /** Drop queued and in-flight saves for a template that is going away, so no PUT chases a deleted row. */
  discardQuerySave: (templateId: string) => void;
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

export const useSqlEditorStore = create<SqlEditorStore>()((set, get) => {
  // The indicator belongs to the query in the editor: a save landing for one the user has already
  // left must not relabel the one they are looking at.
  const setStatus: StatusSetter = (templateId, saveStatus) => {
    if (get().currentTemplate?.id === templateId) set({ saveStatus });
  };

  return {
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
      if (current && pendingSaves.has(current.id)) {
        void runSave(current.id, setStatus, false);
      }

      if (!template) {
        set({ currentTemplate: undefined, saveStatus: "saved" });
        return;
      }

      // The list copy lags a save this tab hasn't confirmed yet (switch away and straight back inside
      // the PUT), so the text we know we typed wins over the one the cache holds.
      const unconfirmed = unconfirmedQueries.get(template.id);
      set({
        currentTemplate: unconfirmed === undefined ? template : { ...template, query: unconfirmed },
        saveStatus: pendingSaves.has(template.id) ? "unsaved" : inFlightSaves.has(template.id) ? "saving" : "saved",
      });
    },
    setQuery: (projectId, query) => {
      const current = get().currentTemplate;
      if (!current || current.query === query) return;
      const { id: templateId } = current;

      set({ currentTemplate: { ...current, query }, saveStatus: "unsaved" });

      pendingSaves.set(templateId, { projectId, templateId, query });
      unconfirmedQueries.set(templateId, query);
      clearSaveTimer(templateId);
      saveTimers.set(
        templateId,
        setTimeout(() => runSave(templateId, setStatus, false), AUTOSAVE_DEBOUNCE_MS)
      );
    },
    flushQuerySave: (options) => {
      const current = get().currentTemplate;
      if (!current) return Promise.resolve();
      return runSave(current.id, setStatus, options?.keepalive ?? false);
    },
    discardQuerySave: (templateId) => {
      clearSaveTimer(templateId);
      pendingSaves.delete(templateId);
      unconfirmedQueries.delete(templateId);
      // Clearing the queue is not enough — a PUT already on the wire would 404 against the deleted
      // row, and its catch would requeue the payload for the next flush to send again. Abort it.
      inFlightSaves.get(templateId)?.abort.abort();
      inFlightSaves.delete(templateId);
      setStatus(templateId, "saved");
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
  };
});
