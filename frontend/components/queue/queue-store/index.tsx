"use client";

import { get as lodashGet } from "lodash";
import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore, type StoreApi } from "zustand";
import { persist } from "zustand/middleware";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { type LabelingQueue, type LabelingQueueItem } from "@/lib/queue/types";

import { parseAnnotationSchema, type TargetField } from "./schema";

/**
 * Per-item debounced save factory. Why per-item state?
 * `labeling_queue_items` is a `ReplacingMergeTree(updated_at)` — a stale
 * `isLabelled:false` PATCH arriving after an `isLabelled:true` PATCH silently
 * reverts the approval (last write by `updated_at` wins). Same applies to
 * re-inserts after a delete tombstone. The factory therefore:
 *  - tracks timers / abort controllers keyed by item id, not by "current"
 *    item (so editing A then nav-flipping to B within 600 ms doesn't drop
 *    A's pending save),
 *  - lets approve/discard/push cancel a specific id's pending save before
 *    they fire their own commit-style PATCH/DELETE,
 *  - flushes still-pending saves on unmount so leaving doesn't lose edits.
 *
 * Closure-scoped Maps live OUTSIDE Zustand state — they're imperative
 * handles, nothing reactive. Surface stays the same as the old class.
 */
interface ScheduleSaveArgs {
  itemId: string;
  target: unknown;
  doSave: (target: unknown, signal: AbortSignal) => Promise<void>;
}

const createSaveOrchestrator = (delayMs = 600) => {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const aborts = new Map<string, AbortController>();

  const flushOne = (itemId: string, target: unknown, doSave: ScheduleSaveArgs["doSave"]) => {
    const existing = aborts.get(itemId);
    if (existing) existing.abort();
    const controller = new AbortController();
    aborts.set(itemId, controller);
    void (async () => {
      try {
        await doSave(target, controller.signal);
      } catch {
        // Aborted by a newer schedule/cancel — caller owns the next state.
      } finally {
        if (aborts.get(itemId) === controller) aborts.delete(itemId);
      }
    })();
  };

  return {
    /** Debounced — repeated calls for the same id within the window collapse. */
    schedule({ itemId, target, doSave }: ScheduleSaveArgs) {
      const existingTimer = timers.get(itemId);
      if (existingTimer) clearTimeout(existingTimer);
      const timer = setTimeout(() => {
        timers.delete(itemId);
        flushOne(itemId, target, doSave);
      }, delayMs);
      timers.set(itemId, timer);
    },

    /** Cancel timer + abort in-flight for one id. Caller is committing a write. */
    cancel(itemId: string) {
      const timer = timers.get(itemId);
      if (timer) {
        clearTimeout(timer);
        timers.delete(itemId);
      }
      const controller = aborts.get(itemId);
      if (controller) {
        controller.abort();
        aborts.delete(itemId);
      }
    },

    /**
     * Synchronously fire still-pending timers (one PATCH each). Called from
     * the provider's unmount cleanup so the trailing 600 ms isn't dropped.
     */
    flushAllPending(getArgs: (itemId: string) => Omit<ScheduleSaveArgs, "itemId"> | undefined) {
      for (const [itemId, timer] of timers) {
        clearTimeout(timer);
        const args = getArgs(itemId);
        if (!args) continue;
        flushOne(itemId, args.target, args.doSave);
      }
      timers.clear();
    },

    /**
     * Cancel every pending timer + abort every in-flight save. Used by the
     * push-to-dataset path which deletes rows server-side: any post-flush
     * PATCH would re-insert via FINAL-SELECT-misses-then-defaults, undoing
     * the delete tombstone with a fresh `updated_at`.
     */
    cancelAll() {
      for (const [, timer] of timers) clearTimeout(timer);
      timers.clear();
      for (const [, controller] of aborts) controller.abort();
      aborts.clear();
    },

    /** Cheap probe used by the windowed-eviction logic in the queue store. */
    hasPending(itemId: string): boolean {
      return timers.has(itemId) || aborts.has(itemId);
    },
  };
};

export type { TargetField };
export { parseAnnotationSchema };

export type QueueIoState = false | "list" | "push-all" | "push-one" | "remove" | "save";

export interface QueueProgress {
  total: number;
  labelled: number;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Number of items kept in memory on each side of the focused index.
 * Window size is therefore `2 * WINDOW_RADIUS + 1` (default 5). Items
 * outside the window are evicted on every nav so a 10k-item queue never
 * holds more than 5 full payloads at once. Kept as a top-level constant
 * (not a store field) because changing it at runtime would invalidate
 * the eviction invariants without simplifying any caller.
 */
const WINDOW_RADIUS = 2;

export interface QueueState {
  queue: LabelingQueue;
  projectId: string;
  /**
   * Master ordering for the queue: every item id present on the server,
   * sorted by `(created_at, id)`. Tiny relative to the full payload list
   * (~36 bytes per id), so we pay one ids-only query upfront and avoid
   * fetching real items the user might never see.
   */
  idsList: string[];
  /**
   * Sparse cache of fully-hydrated items, keyed by id. Only ids inside the
   * current window (or with pending unsaved saves) are kept — the rest get
   * evicted on every `setCurrentIndex` / `step` so memory stays bounded.
   */
  loadedItems: Record<string, LabelingQueueItem>;
  /**
   * Item ids that the user has navigated past while their underlying data
   * was still in-flight. The `globalTargetSelections` merge is delayed for
   * those ids until `hydrateWindow` actually lands the row — otherwise
   * navigating to an unloaded slot would silently drop the carry-over.
   */
  pendingGlobalsFor: Record<string, true>;
  progress: QueueProgress;
  /** Flipped by `QueueDataLoader` after the first ids+progress fetch settles. */
  isInitialLoaded: boolean;
  currentIndex: number;
  ioState: QueueIoState;
  /** Dataset id persisted to localStorage so the user doesn't re-pick each session. */
  dataset: string | undefined;
  /** Rendered-JSON validity for the manual Target editor. */
  isTargetJsonValid: boolean;

  annotationSchema: Record<string, unknown> | null;
  fields: TargetField[];
  focusedFieldIndex: number;
  /** Sticky global target values — carry over between items when the user selects once. */
  globalTargetSelections: Record<string, unknown>;
}

export interface QueueActions {
  /**
   * Hydrate the master ordering + progress. Called once on mount and after
   * every mutation that changes the queue size. Preserves loaded items
   * whose ids are still present and drops orphans.
   */
  hydrateIndex: (idsList: string[], progress: QueueProgress) => void;
  /**
   * Hydrate the body of one or more items (typically a window fetch).
   * Drains any deferred globals merge for items that just landed.
   */
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

  setAnnotationSchema: (schema: Record<string, unknown> | null) => void;
  setTarget: (target: unknown) => void;
  setTargetJsonValid: (valid: boolean) => void;
  updateTargetField: (key: string, value: unknown) => void;
  focusField: (direction: "next" | "prev" | "first") => void;
  selectOptionInFocusedField: (optionNumber: number) => void;

  approveCurrent: () => Promise<ActionResult>;
  unapproveCurrent: () => Promise<ActionResult>;
  discardCurrent: () => Promise<ActionResult>;
  /**
   * Push approved items by default. Pass `{ includeUnlabelled: true }` to ship
   * every item in the queue regardless of approval state — un-annotated rows
   * land in the dataset with whatever `target` they carry. The default keeps
   * the safer "approved-only" contract the UI has historically relied on.
   */
  pushAllToDataset: (opts?: { includeUnlabelled?: boolean }) => Promise<ActionResult & { pushed?: number }>;
  /**
   * Push just the current item. By default only allowed when the item is
   * approved (preserves the historical "approved-only" contract). Pass
   * `{ includeUnlabelled: true }` to also push un-annotated items — the
   * dialog uses this for the "Just the current item" radio so users aren't
   * forced to approve a single-item push.
   */
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
 * its in-flight target body (or worse, the orchestrator would fire its
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

/**
 * Merge sticky `globalTargetSelections` into the newly-focused item's target. Only fills
 * missing keys (item's own target wins) and only touches un-labelled items, so re-visiting
 * an approved item doesn't mutate its saved answer. Schedules a debounced save when any
 * key is filled so the carried-over values are persisted.
 *
 * If the target item is NOT yet loaded (window-fetch still in flight), the merge is
 * deferred via `pendingGlobalsFor` and replayed by `hydrateWindow` once the row lands.
 */
const applyGlobalsToIndex = (
  state: QueueStore,
  nextIndex: number,
  scheduleSave: (item: LabelingQueueItem) => void
): Partial<QueueStore> => {
  const id = state.idsList[nextIndex];
  const target = id ? state.loadedItems[id] : undefined;
  const globals = state.globalTargetSelections;
  if (Object.keys(globals).length === 0) {
    return { currentIndex: nextIndex, isTargetJsonValid: true };
  }
  if (!target) {
    if (!id) return { currentIndex: nextIndex, isTargetJsonValid: true };
    // Defer until the window-fetch hydrates this id. `hydrateWindow` checks
    // `pendingGlobalsFor` and replays the merge for whichever items just landed.
    return {
      currentIndex: nextIndex,
      isTargetJsonValid: true,
      pendingGlobalsFor: { ...state.pendingGlobalsFor, [id]: true as const },
    };
  }
  if (target.isLabelled) {
    return { currentIndex: nextIndex, isTargetJsonValid: true };
  }
  const existing = (target.payload?.target as Record<string, unknown> | undefined) ?? {};
  const merged: Record<string, unknown> = { ...existing };
  let changed = false;
  for (const [key, value] of Object.entries(globals)) {
    if (!(key in existing)) {
      merged[key] = value;
      changed = true;
    }
  }
  if (!changed) {
    return { currentIndex: nextIndex, isTargetJsonValid: true };
  }
  const nextItem = { ...target, payload: { ...target.payload, target: merged } };
  scheduleSave(nextItem);
  return {
    currentIndex: nextIndex,
    loadedItems: { ...state.loadedItems, [target.id]: nextItem },
    isTargetJsonValid: true,
  };
};

const createQueueStore = ({ queue, projectId }: QueueStoreInit) => {
  const initialSchema = (queue.annotationSchema as Record<string, unknown>) || null;
  const initialFields = parseAnnotationSchema(initialSchema);
  const queueId = queue.id;
  const orchestrator = createSaveOrchestrator(600);
  let revalidate: (() => Promise<unknown>) | null = null;

  /** PATCH `target` for one item; throws on non-2xx so the orchestrator can flag a retry. */
  const patchTarget = async (itemId: string, target: unknown, signal: AbortSignal) => {
    const res = await fetch(`/api/projects/${projectId}/queues/${queueId}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, isLabelled: false }),
      signal,
    });
    if (!res.ok) throw new Error("save failed");
  };

  const store = createStore<QueueStore>()(
    persist(
      (set, get) => {
        /** Schedule a debounced PATCH for one item id with its current target. */
        const scheduleSaveFor = (item: LabelingQueueItem) => {
          const target = (item.payload as { target?: unknown }).target ?? null;
          orchestrator.schedule({
            itemId: item.id,
            target,
            doSave: (latestTarget, signal) => patchTarget(item.id, latestTarget, signal),
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
            const wasLabelled = state.loadedItems[id]?.isLabelled ?? false;
            const nextIds = state.idsList.slice();
            nextIds.splice(idx, 1);
            const nextLoaded = { ...state.loadedItems };
            delete nextLoaded[id];
            // Drop any deferred globals merge for the removed id — the row
            // is gone, replaying it on a future hydrate would be incorrect.
            const nextPendingGlobals = { ...state.pendingGlobalsFor };
            delete nextPendingGlobals[id];
            // Keep currentIndex pointing at the same logical item:
            //  - removal before current: shift left by one
            //  - removal at current: stay (shows the next item)
            //  - removal after current: unchanged
            const shifted = idx < state.currentIndex ? state.currentIndex - 1 : state.currentIndex;
            const newIndex = Math.min(Math.max(shifted, 0), Math.max(nextIds.length - 1, 0));
            return {
              idsList: nextIds,
              loadedItems: nextLoaded,
              pendingGlobalsFor: nextPendingGlobals,
              currentIndex: newIndex,
              progress: {
                total: Math.max(state.progress.total - 1, 0),
                labelled: Math.max(state.progress.labelled - (wasLabelled ? 1 : 0), 0),
              },
            };
          });
        };

        const unlabel = (item: LabelingQueueItem): LabelingQueueItem =>
          item.isLabelled ? { ...item, isLabelled: false } : item;

        /** Decrement the labelled progress count when a previously-approved item is edited. */
        const adjustLabelledCountForUnapprove = (wasLabelled: boolean) => {
          if (!wasLabelled) return;
          set((state) => ({
            progress: { ...state.progress, labelled: Math.max(state.progress.labelled - 1, 0) },
          }));
        };

        return {
          queue,
          projectId,
          idsList: [],
          loadedItems: {},
          pendingGlobalsFor: {},
          progress: { total: 0, labelled: 0 },
          isInitialLoaded: false,
          currentIndex: 0,
          ioState: false as QueueIoState,
          dataset: undefined,
          isTargetJsonValid: true,
          annotationSchema: initialSchema,
          fields: initialFields,
          focusedFieldIndex: initialFields.length > 0 ? 0 : -1,
          globalTargetSelections: {},

          hydrateIndex: (idsList, progress) => {
            set((state) => {
              // Drop loaded items whose id is no longer in the queue (server
              // mutations elsewhere). Then run the standard window eviction
              // so the cache stays bounded after a revalidate.
              const presentIds = new Set(idsList);
              const surviving: Record<string, LabelingQueueItem> = {};
              for (const [id, item] of Object.entries(state.loadedItems)) {
                if (presentIds.has(id)) surviving[id] = item;
              }
              const surviving_pendingGlobals: Record<string, true> = {};
              for (const id of Object.keys(state.pendingGlobalsFor)) {
                if (presentIds.has(id)) surviving_pendingGlobals[id] = true;
              }
              const clamped = Math.min(Math.max(state.currentIndex, 0), Math.max(idsList.length - 1, 0));
              const windowIds = computeWindowIds(idsList, clamped);
              return {
                idsList,
                loadedItems: evictOutsideWindow(surviving, windowIds, orchestrator.hasPending),
                pendingGlobalsFor: surviving_pendingGlobals,
                progress,
                isInitialLoaded: true,
                currentIndex: clamped,
              };
            });
          },

          hydrateWindow: (items) => {
            if (items.length === 0) return;
            set((state) => {
              const nextLoaded = { ...state.loadedItems };
              const nextPendingGlobals = { ...state.pendingGlobalsFor };
              const globals = state.globalTargetSelections;
              const hasGlobals = Object.keys(globals).length > 0;
              const itemsForOrchestrator: LabelingQueueItem[] = [];

              for (const item of items) {
                // Don't clobber a locally-edited (and possibly still-saving)
                // version with the freshly-fetched server row. Without this,
                // a window refetch landing during a 600ms debounce window
                // would silently roll back the user's keystrokes.
                if (orchestrator.hasPending(item.id)) continue;

                let next = item;
                // Replay any deferred globals merge that was queued while
                // this id was unloaded. Same merge rule as `applyGlobalsToIndex`.
                if (hasGlobals && nextPendingGlobals[item.id] && !next.isLabelled) {
                  const existing = (next.payload?.target as Record<string, unknown> | undefined) ?? {};
                  const merged: Record<string, unknown> = { ...existing };
                  let changed = false;
                  for (const [key, value] of Object.entries(globals)) {
                    if (!(key in existing)) {
                      merged[key] = value;
                      changed = true;
                    }
                  }
                  if (changed) {
                    next = { ...next, payload: { ...next.payload, target: merged } };
                    itemsForOrchestrator.push(next);
                  }
                }
                if (nextPendingGlobals[item.id]) delete nextPendingGlobals[item.id];
                nextLoaded[item.id] = next;
              }

              // Schedule debounced saves OUTSIDE the set callback — Zustand's
              // setState contract is "pure"; firing fetches from inside it
              // breaks Strict Mode invocations and replay-time consistency.
              queueMicrotask(() => {
                for (const item of itemsForOrchestrator) scheduleSaveFor(item);
              });

              return { loadedItems: nextLoaded, pendingGlobalsFor: nextPendingGlobals };
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
              const next = applyGlobalsToIndex(state, clamped, scheduleSaveFor);
              const windowIds = computeWindowIds(state.idsList, clamped);
              const baseLoaded = (next.loadedItems as Record<string, LabelingQueueItem>) ?? state.loadedItems;
              return {
                ...next,
                loadedItems: evictOutsideWindow(baseLoaded, windowIds, orchestrator.hasPending),
              };
            });
          },

          step: (dir) => {
            set((state) => {
              const next = state.currentIndex + dir;
              if (next < 0 || next >= state.idsList.length) return state;
              const merged = applyGlobalsToIndex(state, next, scheduleSaveFor);
              const windowIds = computeWindowIds(state.idsList, next);
              const baseLoaded = (merged.loadedItems as Record<string, LabelingQueueItem>) ?? state.loadedItems;
              return {
                ...merged,
                loadedItems: evictOutsideWindow(baseLoaded, windowIds, orchestrator.hasPending),
              };
            });
          },

          setDataset: (dataset) => set({ dataset }),
          setIoState: (ioState) => set({ ioState }),

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
            // The PATCH body always sends `isLabelled: false`, so editing an approved
            // item un-approves it server-side. Mirror that locally so the approval
            // pill doesn't lie in the gap between save and the next hydrate.
            const nextItem = unlabel({ ...current, payload: { ...current.payload, target } });
            replaceItem(nextItem);
            adjustLabelledCountForUnapprove(current.isLabelled);
            scheduleSaveFor(nextItem);
          },

          setTargetJsonValid: (isTargetJsonValid) => set({ isTargetJsonValid }),

          updateTargetField: (key, value) => {
            const state = get();
            const current = state.getCurrentItem();
            if (!current) return;
            const newTarget = {
              ...((current.payload.target as Record<string, unknown>) || {}),
              [key]: value,
            };
            set({ globalTargetSelections: { ...state.globalTargetSelections, [key]: value } });
            const nextItem = unlabel({ ...current, payload: { ...current.payload, target: newTarget } });
            replaceItem(nextItem);
            adjustLabelledCountForUnapprove(current.isLabelled);
            scheduleSaveFor(nextItem);
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
            // Re-entry guard — meta+enter bypasses button disabled state.
            if (state.ioState !== false && state.ioState !== "list") {
              return { ok: false, error: "Busy" };
            }
            const target = (current.payload as { target?: unknown }).target;
            // Stale `isLabelled:false` PATCH arriving after `true` would silently
            // revert the approval (RMT last-write-wins by updated_at).
            orchestrator.cancel(current.id);
            set({ ioState: "save" });
            try {
              const res = await fetch(`/api/projects/${projectId}/queues/${queueId}/items/${current.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ target, isLabelled: true }),
              });
              if (!res.ok) {
                const errMessage = await res
                  .json()
                  .then((d) => d?.error)
                  .catch(() => null);
                return { ok: false, error: errMessage ?? "Failed to approve item" };
              }
              // Increment the labelled count by 1 instead of recounting:
              // with windowing only a slice of items is loaded, so a global
              // recount over `loadedItems` would under-report.
              set((s) => {
                const existing = s.loadedItems[current.id];
                if (!existing) return s;
                return {
                  loadedItems: { ...s.loadedItems, [current.id]: { ...existing, isLabelled: true } },
                  progress: { ...s.progress, labelled: Math.min(s.progress.labelled + 1, s.progress.total) },
                };
              });
              const after = get();
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
            if (!current.isLabelled) return { ok: false, error: "Item is not approved" };
            if (state.ioState !== false && state.ioState !== "list") {
              return { ok: false, error: "Busy" };
            }
            // Same write-ordering concern as approve: cancel any pending debounced
            // save first so a stale `isLabelled:false` PATCH doesn't race the
            // explicit unapprove (both write false here, but the cancel also nulls
            // any pending target body that might be older than the current state).
            orchestrator.cancel(current.id);
            const target = (current.payload as { target?: unknown }).target;
            set({ ioState: "save" });
            try {
              const res = await fetch(`/api/projects/${projectId}/queues/${queueId}/items/${current.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ target, isLabelled: false }),
              });
              if (!res.ok) {
                const errMessage = await res
                  .json()
                  .then((d) => d?.error)
                  .catch(() => null);
                return { ok: false, error: errMessage ?? "Failed to unapprove item" };
              }
              set((s) => {
                const existing = s.loadedItems[current.id];
                if (!existing) return s;
                return {
                  loadedItems: { ...s.loadedItems, [current.id]: { ...existing, isLabelled: false } },
                  progress: { ...s.progress, labelled: Math.max(s.progress.labelled - 1, 0) },
                };
              });
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
                body: JSON.stringify({
                  skip: true,
                  data: lodashGet(current.payload, "data", {}),
                  target: lodashGet(current.payload, "target", {}),
                  metadata: lodashGet(current.payload, "metadata", {}),
                }),
              });
              if (!res.ok) {
                const errMessage = await res
                  .json()
                  .then((d) => d?.error)
                  .catch(() => null);
                return { ok: false, error: errMessage ?? "Failed to discard item" };
              }
              removeItemLocal(current.id);
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
              await revalidate?.();
              return { ok: true, pushed: result?.pushed ?? 0 };
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
            if (!current.isLabelled && !opts?.includeUnlabelled) {
              return { ok: false, error: "Approve the item before pushing" };
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
              const target = (item.payload as { target?: unknown }).target ?? null;
              return {
                target,
                doSave: (latestTarget, signal) => patchTarget(id, latestTarget, signal),
              };
            });
          },

          getCurrentItem: () => {
            const { idsList, loadedItems, currentIndex } = get();
            const id = idsList[currentIndex];
            return id ? loadedItems[id] : undefined;
          },

          getTarget: () => {
            const current = get().getCurrentItem();
            return lodashGet(current, "payload.target", {});
          },
        };
      },
      {
        name: `queue-store-${queue.id}`,
        partialize: (state) => ({ dataset: state.dataset }),
      }
    )
  );

  return store;
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
