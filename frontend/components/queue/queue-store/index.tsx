"use client";

import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore, type StoreApi } from "zustand";
import { persist } from "zustand/middleware";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { type QueueItemState, type QueueItemStateRow } from "@/lib/actions/queue";
import { track } from "@/lib/posthog";
import { type LabelingQueue, type LabelingQueueItem } from "@/lib/queue/types";

import {
  type ActionResult,
  computeProgress,
  deriveItemState,
  EMPTY_PROGRESS,
  getEffectiveTarget,
  isDirty,
  type QueueIoState,
  type QueueProgress,
  WINDOW_RADIUS,
} from "./helpers";
import { createSaveOrchestrator } from "./save-orchestrator";
import { parseAnnotationSchema, type TargetField } from "./schema";

export type { ActionResult, QueueIoState, QueueProgress, TargetSchemaDrift } from "./helpers";
export { deriveItemState, getEffectiveTarget, getTargetSchemaDrift, isApproved, isDirty } from "./helpers";
export type { TargetField } from "./schema";
export { parseAnnotationSchema } from "./schema";
export type { QueueItemState } from "@/lib/actions/queue";

export interface QueueState {
  queue: LabelingQueue;
  projectId: string;
  idsList: string[];
  loadedItems: Record<string, LabelingQueueItem>;
  itemStates: Record<string, QueueItemState>;
  progress: QueueProgress;
  /** Flipped by `QueueDataLoader` after the first index fetch settles. */
  isInitialLoaded: boolean;
  currentIndex: number;
  ioState: QueueIoState;
  /** Dataset id persisted to localStorage so the user doesn't re-pick each session. */
  dataset: string | undefined;
  targetTab: "fields" | "json" | undefined;
  /** Rendered-JSON validity for the manual Target editor. */
  isTargetJsonValid: boolean;
  dialogOpen: boolean;

  annotationSchema: Record<string, unknown> | null;
  fields: TargetField[];
  focusedFieldIndex: number;
}

export interface QueueActions {
  hydrateIndex: (rows: QueueItemStateRow[]) => void;
  /** Hydrate the body of one or more items (typically a window fetch). */
  hydrateWindow: (items: LabelingQueueItem[]) => void;
  /** Register the SWR `mutate` so side-effecting actions can revalidate the index. */
  registerRevalidate: (revalidate: () => Promise<unknown>) => void;
  /**
   * Returns the ids in the window around `centerIndex` that the loader
   * still needs to fetch. Exposed so `QueueDataLoader` can decide whether
   * to issue an HTTP request without duplicating the window math.
   */
  getMissingWindowIds: (centerIndex: number) => string[];
  /**
   * Returns every id currently inside the window — the loader uses this to
   * decide what to keep in the SWR cache key for window fetches.
   */
  getWindowIds: (centerIndex: number) => string[];

  setCurrentIndex: (index: number) => void;
  step: (dir: 1 | -1) => void;
  setDataset: (dataset: string | undefined) => void;
  setIoState: (state: QueueIoState) => void;
  setDialogOpen: (open: boolean) => void;
  setTargetTab: (tab: "fields" | "json") => void;

  setAnnotationSchema: (schema: Record<string, unknown> | null) => void;
  setTarget: (target: unknown) => void;
  setTargetJsonValid: (valid: boolean) => void;
  updateTargetField: (key: string, value: unknown) => void;
  revertCurrent: () => void;
  focusField: (direction: "next" | "prev" | "first") => void;
  selectOptionInFocusedField: (optionNumber: number) => void;

  approveCurrent: () => Promise<ActionResult>;
  unapproveCurrent: () => Promise<ActionResult>;
  discardCurrent: () => Promise<ActionResult>;
  pushAllToDataset: (opts?: { includeUnlabelled?: boolean }) => Promise<ActionResult & { pushed?: number }>;
  pushCurrentToDataset: (opts?: { includeUnlabelled?: boolean }) => Promise<ActionResult & { pushed?: number }>;

  /** Flush still-pending debounced saves. Called from the provider's unmount cleanup. */
  flushPendingSaves: () => void;

  getCurrentItem: () => LabelingQueueItem | undefined;
  getTarget: () => unknown;
}

export type QueueStore = QueueState & QueueActions;

export interface QueueStoreInit {
  queue: LabelingQueue;
  projectId: string;
}

/**
 * Compute the contiguous window of ids around `centerIndex`, clamped to the
 * idsList bounds. Used by both eviction (which keeps the window) and the
 * loader (which fetches anything missing in it).
 */
const computeWindowIds = (idsList: string[], centerIndex: number): string[] => {
  if (idsList.length === 0) return [];
  const start = Math.max(0, centerIndex - WINDOW_RADIUS);
  const end = Math.min(idsList.length, centerIndex + WINDOW_RADIUS + 1);
  return idsList.slice(start, end);
};

/**
 * Drop loaded items that are NOT in the window AND don't have a pending
 * unsaved save. Without the pending check, an evicted dirty item would lose
 * its in-flight edit body (or worse, the orchestrator would fire its
 * trailing PATCH against state we no longer hold and surface as defaults).
 */
const evictOutsideWindow = (
  loadedItems: Record<string, LabelingQueueItem>,
  windowIds: string[],
  hasPending: (id: string) => boolean
): Record<string, LabelingQueueItem> => {
  const keep = new Set(windowIds);
  const next: Record<string, LabelingQueueItem> = {};
  for (const [id, item] of Object.entries(loadedItems)) {
    if (keep.has(id) || hasPending(id)) next[id] = item;
  }
  return next;
};

const createQueueStore = ({ queue, projectId }: QueueStoreInit) => {
  const initialSchema = (queue.annotationSchema as Record<string, unknown>) || null;
  const initialFields = parseAnnotationSchema(initialSchema);
  const queueId = queue.id;
  const orchestrator = createSaveOrchestrator(600);
  let revalidate: (() => Promise<unknown>) | null = null;

  /** PATCH `edit` for one item; throws on non-2xx so the orchestrator can flag a retry. */
  const patchEdit = async (itemId: string, edit: string, signal: AbortSignal) => {
    const res = await fetch(`/api/projects/${projectId}/queues/${queueId}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edit, status: 0 }),
      signal,
    });
    if (!res.ok) throw new Error("save failed");
  };

  return createStore<QueueStore>()(
    persist(
      (set, get) => {
        /** Schedule a debounced PATCH for one item id with its current `edit` body. */
        const scheduleSaveFor = (item: LabelingQueueItem) => {
          orchestrator.schedule({
            itemId: item.id,
            edit: item.edit,
            doSave: (latestEdit, signal) => patchEdit(item.id, latestEdit, signal),
          });
        };

        const replaceItem = (next: LabelingQueueItem) => {
          set((state) => {
            if (!state.idsList.includes(next.id)) return state;
            return { loadedItems: { ...state.loadedItems, [next.id]: next } };
          });
        };

        const removeItemLocal = (id: string) => {
          set((state) => {
            const idx = state.idsList.indexOf(id);
            if (idx === -1) return state;
            const nextIds = state.idsList.slice();
            nextIds.splice(idx, 1);
            const nextLoaded = { ...state.loadedItems };
            delete nextLoaded[id];
            const nextStates = { ...state.itemStates };
            delete nextStates[id];
            // Keep currentIndex pointing at the same logical item:
            //  - removal before current: shift left by one
            //  - removal at current: stay (shows the next item)
            //  - removal after current: unchanged
            const shifted = idx < state.currentIndex ? state.currentIndex - 1 : state.currentIndex;
            const newIndex = Math.min(Math.max(shifted, 0), Math.max(nextIds.length - 1, 0));
            return {
              idsList: nextIds,
              loadedItems: nextLoaded,
              itemStates: nextStates,
              currentIndex: newIndex,
              progress: computeProgress(nextStates),
            };
          });
        };

        const setItemState = (id: string, state: QueueItemState) => {
          set((prev) => {
            if (prev.itemStates[id] === state) return prev;
            // Drop the write if the id isn't part of the queue ordering
            // (e.g. a discard race) — recomputing progress over an
            // out-of-band id would inflate counts vs. idsList.length.
            if (!prev.idsList.includes(id) && !(id in prev.itemStates)) return prev;
            const nextStates = { ...prev.itemStates, [id]: state };
            return { itemStates: nextStates, progress: computeProgress(nextStates) };
          });
        };

        const unapproveLocal = (item: LabelingQueueItem): LabelingQueueItem =>
          item.status === 1 ? { ...item, status: 0 as const } : item;

        return {
          queue,
          projectId,
          idsList: [],
          loadedItems: {},
          itemStates: {},
          progress: EMPTY_PROGRESS,
          isInitialLoaded: false,
          currentIndex: 0,
          ioState: false as QueueIoState,
          dataset: undefined,
          targetTab: undefined,
          isTargetJsonValid: true,
          dialogOpen: false,
          annotationSchema: initialSchema,
          fields: initialFields,
          focusedFieldIndex: initialFields.length > 0 ? 0 : -1,

          hydrateIndex: (rows) => {
            set((state) => {
              const idsList = rows.map((r) => r.id);
              const presentIds = new Set(idsList);
              const surviving: Record<string, LabelingQueueItem> = {};
              for (const [id, item] of Object.entries(state.loadedItems)) {
                if (presentIds.has(id)) surviving[id] = item;
              }
              // Server is the source of truth for state EXCEPT for ids with
              // a pending save in flight — that local mutation hasn't reached
              // CH yet, so trust the optimistic value we already hold.
              const itemStates: Record<string, QueueItemState> = {};
              for (const row of rows) {
                itemStates[row.id] =
                  orchestrator.hasPending(row.id) && state.itemStates[row.id] ? state.itemStates[row.id] : row.state;
              }
              const clamped = Math.min(Math.max(state.currentIndex, 0), Math.max(idsList.length - 1, 0));
              const windowIds = computeWindowIds(idsList, clamped);
              return {
                idsList,
                loadedItems: evictOutsideWindow(surviving, windowIds, orchestrator.hasPending),
                itemStates,
                progress: computeProgress(itemStates),
                isInitialLoaded: true,
                currentIndex: clamped,
              };
            });
          },

          hydrateWindow: (items) => {
            if (items.length === 0) return;
            set((state) => {
              const nextLoaded = { ...state.loadedItems };
              const nextStates = { ...state.itemStates };
              let statesDirty = false;
              for (const item of items) {
                // Don't clobber a locally-edited (and possibly still-saving)
                // version with the freshly-fetched server row. Without this,
                // a window refetch landing during a 600ms debounce window
                // would silently roll back the user's keystrokes.
                if (orchestrator.hasPending(item.id)) continue;
                nextLoaded[item.id] = item;
                const derived = deriveItemState(item);
                if (nextStates[item.id] !== derived) {
                  nextStates[item.id] = derived;
                  statesDirty = true;
                }
              }
              return statesDirty
                ? {
                    loadedItems: nextLoaded,
                    itemStates: nextStates,
                    progress: computeProgress(nextStates),
                  }
                : { loadedItems: nextLoaded };
            });
          },

          registerRevalidate: (r) => {
            revalidate = r;
          },

          getMissingWindowIds: (centerIndex) => {
            const { idsList, loadedItems } = get();
            return computeWindowIds(idsList, centerIndex).filter((id) => !loadedItems[id]);
          },

          getWindowIds: (centerIndex) => computeWindowIds(get().idsList, centerIndex),

          setCurrentIndex: (index) => {
            set((state) => {
              const clamped = Math.min(Math.max(index, 0), Math.max(state.idsList.length - 1, 0));
              const windowIds = computeWindowIds(state.idsList, clamped);
              return {
                currentIndex: clamped,
                isTargetJsonValid: true,
                loadedItems: evictOutsideWindow(state.loadedItems, windowIds, orchestrator.hasPending),
              };
            });
          },

          step: (dir) => {
            set((state) => {
              const next = state.currentIndex + dir;
              if (next < 0 || next >= state.idsList.length) return state;
              const windowIds = computeWindowIds(state.idsList, next);
              return {
                currentIndex: next,
                isTargetJsonValid: true,
                loadedItems: evictOutsideWindow(state.loadedItems, windowIds, orchestrator.hasPending),
              };
            });
          },

          setDataset: (dataset) => set({ dataset }),
          setIoState: (ioState) => set({ ioState }),
          setDialogOpen: (dialogOpen) => set({ dialogOpen }),
          setTargetTab: (targetTab) => set({ targetTab }),

          setAnnotationSchema: (schema) => {
            const fields = parseAnnotationSchema(schema);
            set({
              annotationSchema: schema,
              fields,
              focusedFieldIndex: fields.length > 0 ? 0 : -1,
            });
          },

          setTarget: (target) => {
            const current = get().getCurrentItem();
            if (!current) return;
            // Writing the edit drops approval — see `patchEdit`.
            const nextItem = unapproveLocal({ ...current, edit: JSON.stringify(target ?? {}) });
            replaceItem(nextItem);
            setItemState(nextItem.id, deriveItemState(nextItem));
            scheduleSaveFor(nextItem);
          },

          setTargetJsonValid: (isTargetJsonValid) => set({ isTargetJsonValid }),

          updateTargetField: (key, value) => {
            const current = get().getCurrentItem();
            if (!current) return;
            const existing = (getEffectiveTarget(current) as Record<string, unknown> | undefined) ?? {};
            const newTarget = { ...existing, [key]: value };
            const nextItem = unapproveLocal({ ...current, edit: JSON.stringify(newTarget) });
            replaceItem(nextItem);
            setItemState(nextItem.id, deriveItemState(nextItem));
            scheduleSaveFor(nextItem);
          },

          revertCurrent: () => {
            const current = get().getCurrentItem();
            if (!current || !isDirty(current)) return;
            // Cancel any pending debounced PATCH carrying the now-discarded
            // edit body — otherwise it would land after the revert's PATCH
            // and silently re-modify the row (RMT last-write-wins on
            // updated_at). Same write-ordering rationale as approve/discard.
            orchestrator.cancel(current.id);
            // Use `?? null` (not `?? {}`) to match the mirror seed
            // convention: omitted target → CH seeds `edit = "null"`, and
            // `isDirty` normalises both sides via `?? null`. Writing "{}"
            // for an originally-null target would leave the row dirty.
            const originalEdit = JSON.stringify(current.payload?.target ?? null);
            const reverted: LabelingQueueItem = { ...current, edit: originalEdit, status: 0 };
            replaceItem(reverted);
            setItemState(reverted.id, deriveItemState(reverted));
            scheduleSaveFor(reverted);
          },

          focusField: (direction) => {
            const { fields, focusedFieldIndex } = get();
            if (fields.length === 0) return;
            let newIndex: number;
            switch (direction) {
              case "next":
                newIndex = (focusedFieldIndex + 1) % fields.length;
                break;
              case "prev":
                newIndex = (focusedFieldIndex - 1 + fields.length) % fields.length;
                break;
              case "first":
                newIndex = 0;
                break;
            }
            set({ focusedFieldIndex: newIndex });
          },

          selectOptionInFocusedField: (optionNumber) => {
            const state = get();
            const field = state.fields[state.focusedFieldIndex];
            if (!field) return;
            const options = field.options;
            if (field.type === "number" && options && "min" in options) {
              const { min = 1, max = 5 } = options;
              if (optionNumber >= min && optionNumber <= max) {
                state.updateTargetField(field.key, optionNumber);
              }
            } else if (field.type === "enum" && Array.isArray(field.options)) {
              const optionIndex = optionNumber - 1;
              if (optionIndex >= 0 && optionIndex < field.options.length) {
                state.updateTargetField(field.key, field.options[optionIndex]);
              }
            } else if (field.type === "boolean") {
              if (optionNumber === 1) state.updateTargetField(field.key, false);
              else if (optionNumber === 2) state.updateTargetField(field.key, true);
            }
          },

          approveCurrent: async () => {
            const state = get();
            const current = state.getCurrentItem();
            if (!current || !state.isTargetJsonValid) {
              return { ok: false, error: "No item or invalid JSON" };
            }
            if (state.ioState !== false && state.ioState !== "list") {
              return { ok: false, error: "Busy" };
            }
            // Stale `status: 0` PATCH arriving after `1` would silently revert
            // the approval (RMT last-write-wins by updated_at). Body sent is
            // `{ status: 1 }` only — the canonical value already lives in
            // `edit` (or `payload.target` when no edits exist).
            orchestrator.cancel(current.id);
            set({ ioState: "save" });
            try {
              const res = await fetch(`/api/projects/${projectId}/queues/${queueId}/items/${current.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: 1 }),
              });
              if (!res.ok) {
                const errMessage = await res
                  .json()
                  .then((d) => d?.error)
                  .catch(() => null);
                return { ok: false, error: errMessage ?? "Failed to approve item" };
              }
              // Optimistic: flip loaded body + state bucket + progress in one
              // setState. Whole-map recount over `itemStates` is O(idsList),
              // not O(loadedItems) — windowing doesn't hide unloaded ids.
              set((s) => {
                const existing = s.loadedItems[current.id];
                const nextLoaded = existing
                  ? { ...s.loadedItems, [current.id]: { ...existing, status: 1 as const } }
                  : s.loadedItems;
                const nextStates = { ...s.itemStates, [current.id]: "approved" as QueueItemState };
                return {
                  loadedItems: nextLoaded,
                  itemStates: nextStates,
                  progress: computeProgress(nextStates),
                };
              });
              const after = get();
              track("labeling_queues", "item_approved");
              if (after.currentIndex < after.idsList.length - 1) after.step(1);
              return { ok: true };
            } catch {
              return { ok: false, error: "Failed to approve item" };
            } finally {
              set({ ioState: false });
            }
          },

          unapproveCurrent: async () => {
            const state = get();
            const current = state.getCurrentItem();
            if (!current) return { ok: false, error: "No item" };
            if (current.status !== 1) return { ok: false, error: "Item is not approved" };
            if (state.ioState !== false && state.ioState !== "list") {
              return { ok: false, error: "Busy" };
            }
            // Same write-ordering concern as approve: cancel any pending debounced
            // save first so its `status: 0` doesn't race the explicit unapprove
            // (both write 0 here, but the cancel also drops any older `edit`
            // body that was queued before the user explicitly unapproved).
            orchestrator.cancel(current.id);
            set({ ioState: "save" });
            try {
              const res = await fetch(`/api/projects/${projectId}/queues/${queueId}/items/${current.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: 0 }),
              });
              if (!res.ok) {
                const errMessage = await res
                  .json()
                  .then((d) => d?.error)
                  .catch(() => null);
                return { ok: false, error: errMessage ?? "Failed to unapprove item" };
              }
              // Optimistic: drop the body's status to 0, then re-derive the
              // bucket from edit vs payload.target (could be "new" if the
              // user never touched the target, or "modified" if they did).
              set((s) => {
                const existing = s.loadedItems[current.id];
                if (!existing) return s;
                const unapproved = { ...existing, status: 0 as const };
                const nextStates = { ...s.itemStates, [current.id]: deriveItemState(unapproved) };
                return {
                  loadedItems: { ...s.loadedItems, [current.id]: unapproved },
                  itemStates: nextStates,
                  progress: computeProgress(nextStates),
                };
              });
              track("labeling_queues", "item_unapproved");
              return { ok: true };
            } catch {
              return { ok: false, error: "Failed to unapprove item" };
            } finally {
              set({ ioState: false });
            }
          },

          discardCurrent: async () => {
            const state = get();
            const current = state.getCurrentItem();
            if (!current) return { ok: false, error: "No item" };
            if (state.ioState !== false && state.ioState !== "list") {
              return { ok: false, error: "Busy" };
            }
            // A late save would re-insert with a fresher updated_at, resurrecting
            // this row past the delete tombstone.
            orchestrator.cancel(current.id);
            set({ ioState: "remove" });
            try {
              const res = await fetch(`/api/projects/${projectId}/queues/${queueId}/items/${current.id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ skip: true }),
              });
              if (!res.ok) {
                const errMessage = await res
                  .json()
                  .then((d) => d?.error)
                  .catch(() => null);
                return { ok: false, error: errMessage ?? "Failed to discard item" };
              }
              removeItemLocal(current.id);
              track("labeling_queues", "item_discarded");
              await revalidate?.();
              return { ok: true };
            } catch {
              return { ok: false, error: "Failed to discard item" };
            } finally {
              set({ ioState: false });
            }
          },

          pushAllToDataset: async (opts) => {
            const state = get();
            if (!state.dataset) return { ok: false, error: "Pick a dataset first" };
            // Push deletes rows; cancel EVERY pending save so a late PATCH can't
            // re-create a ghost row (FINAL-SELECT misses, falls through to
            // defaults). With windowing only a slice of items is loaded, so we
            // can't enumerate the full set on the client — `cancelAll` clears
            // every timer/abort the orchestrator is holding regardless of the
            // current window state.
            orchestrator.cancelAll();
            set({ ioState: "push-all" });
            try {
              const res = await fetch(`/api/projects/${projectId}/queues/${queueId}/push-to-dataset`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  datasetId: state.dataset,
                  includeUnlabelled: opts?.includeUnlabelled ? true : undefined,
                }),
              });
              if (!res.ok) {
                const errMessage = await res
                  .json()
                  .then((d) => d?.error)
                  .catch(() => null);
                return { ok: false, error: errMessage ?? "Failed to push approved items" };
              }
              const result = await res.json();
              const pushed = result?.pushed ?? 0;
              if (pushed > 0) {
                track("labeling_queues", "items_pushed_to_dataset", {
                  scope: opts?.includeUnlabelled ? "all" : "approved",
                  count: pushed,
                });
              }
              await revalidate?.();
              return { ok: true, pushed };
            } catch {
              return { ok: false, error: "Failed to push approved items" };
            } finally {
              set({ ioState: false });
            }
          },

          pushCurrentToDataset: async (opts) => {
            const state = get();
            const current = state.getCurrentItem();
            if (!current) return { ok: false, error: "No item" };
            if (!state.dataset) return { ok: false, error: "Pick a dataset first" };
            // Only block on approval when the caller has NOT opted into pushing
            // un-annotated items. Without `includeUnlabelled`, the backend will
            // also drop unlabelled rows — surface that early as a clear error.
            if (current.status !== 1 && !opts?.includeUnlabelled) {
              return { ok: false, error: "Approve the item before pushing" };
            }
            if (state.ioState !== false && state.ioState !== "list") {
              return { ok: false, error: "Busy" };
            }
            orchestrator.cancel(current.id);
            set({ ioState: "push-one" });
            try {
              const res = await fetch(`/api/projects/${projectId}/queues/${queueId}/push-to-dataset`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  datasetId: state.dataset,
                  itemIds: [current.id],
                  includeUnlabelled: opts?.includeUnlabelled ? true : undefined,
                }),
              });
              if (!res.ok) {
                const errMessage = await res
                  .json()
                  .then((d) => d?.error)
                  .catch(() => null);
                return { ok: false, error: errMessage ?? "Failed to push item" };
              }
              const result = await res.json();
              if (!result?.pushed) {
                return { ok: false, error: "Item was not pushed — approve it first" };
              }
              removeItemLocal(current.id);
              track("labeling_queues", "items_pushed_to_dataset", {
                scope: opts?.includeUnlabelled ? "current_unlabelled" : "current",
                count: result.pushed,
              });
              await revalidate?.();
              return { ok: true, pushed: result.pushed };
            } catch {
              return { ok: false, error: "Failed to push item" };
            } finally {
              set({ ioState: false });
            }
          },

          flushPendingSaves: () => {
            const loadedItems = get().loadedItems;
            orchestrator.flushAllPending((id) => {
              // The orchestrator holds timers for any id ever scheduled.
              // After eviction an id can have a pending timer but no row in
              // `loadedItems` — that's by design, eviction skips ids with
              // pending saves so we should always find the row here.
              const item = loadedItems[id];
              if (!item) return undefined;
              return {
                edit: item.edit,
                doSave: (latestEdit, signal) => patchEdit(id, latestEdit, signal),
              };
            });
          },

          getCurrentItem: () => {
            const { idsList, loadedItems, currentIndex } = get();
            const id = idsList[currentIndex];
            return id ? loadedItems[id] : undefined;
          },

          getTarget: () => getEffectiveTarget(get().getCurrentItem()),
        };
      },
      {
        name: `queue-store-${queue.id}`,
        partialize: (state) => ({ dataset: state.dataset, targetTab: state.targetTab }),
      }
    )
  );
};

export type QueueStoreApi = StoreApi<QueueStore>;

const QueueStoreContext = createContext<QueueStoreApi | null>(null);

export function QueueStoreProvider({ children, queue, projectId }: PropsWithChildren<QueueStoreInit>) {
  const [store] = useState(() => createQueueStore({ queue, projectId }));
  return <QueueStoreContext.Provider value={store}>{children}</QueueStoreContext.Provider>;
}

export function useQueueStore<T>(selector: (store: QueueStore) => T): T {
  const ctx = useContext(QueueStoreContext);
  if (!ctx) throw new Error("useQueueStore must be used within QueueStoreProvider");
  return useStoreWithEqualityFn(ctx, selector, shallow);
}
