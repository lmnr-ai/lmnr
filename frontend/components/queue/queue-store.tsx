"use client";

import { get as lodashGet } from "lodash";
import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore, useStore } from "zustand";
import { persist } from "zustand/middleware";

import { type LabelingQueue, type LabelingQueueItem } from "@/lib/queue/types";

export interface TargetField {
  key: string;
  type: "number" | "enum" | "boolean" | "string";
  description?: string;
  options?: string[] | { min?: number; max?: number };
}

export type QueueIoState = false | "list" | "push-all" | "push-one" | "remove" | "save";

export type QueueState = {
  queue: LabelingQueue | null;
  items: LabelingQueueItem[];
  currentIndex: number;
  ioState: QueueIoState;
  /** Dataset id persisted to localStorage so the user doesn't re-pick each session. */
  dataset: string | undefined;
  /** Rendered-JSON validity for the manual Target editor. */
  isTargetJsonValid: boolean;

  targetSchema: Record<string, unknown> | null;
  fields: TargetField[];
  focusedFieldIndex: number;
  /** Sticky global target values — carry over between items when the user selects once. */
  globalTargetSelections: Record<string, unknown>;
  /** True after a user edit; determines whether to commit `is_labelled=true` on navigation. */
  dirtyItemIds: Set<string>;
};

export type QueueActions = {
  setItems: (items: LabelingQueueItem[]) => void;
  replaceItem: (item: LabelingQueueItem) => void;
  removeItem: (id: string) => void;
  setCurrentIndex: (index: number) => void;
  step: (dir: 1 | -1) => void;
  setIoState: (state: QueueIoState) => void;
  setDataset: (dataset: string | undefined) => void;

  setTargetSchema: (schema: Record<string, unknown> | null) => void;
  setTarget: (target: unknown) => void;
  setTargetJsonValid: (valid: boolean) => void;
  updateTargetField: (key: string, value: unknown) => void;
  focusField: (direction: "next" | "prev" | "first") => void;
  selectOptionInFocusedField: (optionNumber: number) => void;
  markDirty: (id: string) => void;
  markLabelled: (id: string) => void;
  reset: () => void;
  getCurrentItem: () => LabelingQueueItem | undefined;
  getTarget: () => unknown;
};

export type QueueStore = QueueState & QueueActions;

export const parseTargetSchema = (schema: Record<string, unknown> | null): TargetField[] => {
  if (!schema || typeof schema !== "object" || !schema.properties) {
    return [];
  }

  const properties = schema.properties as Record<string, any>;
  const fields: TargetField[] = [];

  for (const [key, property] of Object.entries(properties)) {
    if (typeof property !== "object") continue;

    const description = property.description;
    const type = property.type;

    if (property.enum && Array.isArray(property.enum)) {
      fields.push({
        key,
        type: "enum",
        description,
        options: property.enum.map((v: any) => String(v)),
      });
    } else if (!type) {
      continue;
    } else if (type === "string") {
      fields.push({ key, type: "string", description });
    } else if (type === "number" || type === "integer") {
      const min = property.minimum ?? 1;
      const max = property.maximum ?? 5;
      fields.push({ key, type: "number", description, options: { min, max } });
    } else if (type === "boolean") {
      fields.push({ key, type: "boolean", description });
    }
  }

  return fields.slice(0, 9);
};

const createQueueStore = (queue: LabelingQueue) => {
  const initialSchema = (queue.targetSchema as Record<string, unknown>) || null;
  const initialFields = parseTargetSchema(initialSchema);

  return createStore<QueueStore>()(
    persist(
      (set, get) => ({
        queue,
        items: [],
        currentIndex: 0,
        ioState: "list" as const,
        dataset: undefined,
        isTargetJsonValid: true,

        targetSchema: initialSchema,
        fields: initialFields,
        focusedFieldIndex: initialFields.length > 0 ? 0 : -1,
        globalTargetSelections: {},
        dirtyItemIds: new Set(),

        setItems: (items) => {
          const { currentIndex } = get();
          set({
            items,
            currentIndex: Math.min(Math.max(currentIndex, 0), Math.max(items.length - 1, 0)),
          });
        },

        replaceItem: (item) => {
          set((state) => {
            const idx = state.items.findIndex((i) => i.id === item.id);
            if (idx === -1) return state;
            const next = state.items.slice();
            next[idx] = item;
            return { items: next };
          });
        },

        removeItem: (id) => {
          set((state) => {
            const idx = state.items.findIndex((i) => i.id === id);
            if (idx === -1) return state;
            const next = state.items.slice();
            next.splice(idx, 1);
            const newIndex = state.currentIndex >= next.length ? Math.max(next.length - 1, 0) : state.currentIndex;
            const dirty = new Set(state.dirtyItemIds);
            dirty.delete(id);
            return { items: next, currentIndex: newIndex, dirtyItemIds: dirty };
          });
        },

        setCurrentIndex: (index) => {
          set((state) => ({
            currentIndex: Math.min(Math.max(index, 0), Math.max(state.items.length - 1, 0)),
          }));
        },

        step: (dir) => {
          set((state) => {
            const next = state.currentIndex + dir;
            if (next < 0 || next >= state.items.length) return state;
            return { currentIndex: next };
          });
        },

        setIoState: (ioState) => set({ ioState }),
        setDataset: (dataset) => set({ dataset }),

        setTargetSchema: (schema) => {
          const fields = parseTargetSchema(schema);
          set({
            targetSchema: schema,
            fields,
            focusedFieldIndex: fields.length > 0 ? 0 : -1,
          });
        },

        setTarget: (target) => {
          const current = get().getCurrentItem();
          if (!current) return;
          get().replaceItem({
            ...current,
            payload: { ...current.payload, target },
          });
          get().markDirty(current.id);
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
          set({
            globalTargetSelections: { ...state.globalTargetSelections, [key]: value },
          });
          state.replaceItem({
            ...current,
            payload: { ...current.payload, target: newTarget },
          });
          state.markDirty(current.id);
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

        markDirty: (id) => {
          set((state) => {
            if (state.dirtyItemIds.has(id)) return state;
            const next = new Set(state.dirtyItemIds);
            next.add(id);
            return { dirtyItemIds: next };
          });
        },

        markLabelled: (id) => {
          set((state) => {
            const idx = state.items.findIndex((i) => i.id === id);
            if (idx === -1) return state;
            const next = state.items.slice();
            next[idx] = { ...next[idx], isLabelled: true };
            const dirty = new Set(state.dirtyItemIds);
            dirty.delete(id);
            return { items: next, dirtyItemIds: dirty };
          });
        },

        reset: () => set({ items: [], currentIndex: 0, dirtyItemIds: new Set() }),

        getCurrentItem: () => {
          const { items, currentIndex } = get();
          return items[currentIndex];
        },

        getTarget: () => {
          const current = get().getCurrentItem();
          return lodashGet(current, "payload.target", {});
        },
      }),
      {
        name: `queue-store-${queue.id}`,
        partialize: (state) => ({ dataset: state.dataset }),
      }
    )
  );
};

type QueueStoreApi = ReturnType<typeof createQueueStore>;

const QueueStoreContext = createContext<QueueStoreApi | undefined>(undefined);

export interface QueueStoreProviderProps {
  queue: LabelingQueue;
}

export function QueueStoreProvider({ children, queue }: PropsWithChildren<QueueStoreProviderProps>) {
  const [storeState] = useState(() => createQueueStore(queue));
  return <QueueStoreContext.Provider value={storeState}>{children}</QueueStoreContext.Provider>;
}

export function useQueueStore<T>(selector: (store: QueueStore) => T): T {
  const ctx = useContext(QueueStoreContext);
  if (!ctx) {
    throw new Error("useQueueStore must be used within QueueStoreProvider");
  }
  return useStore(ctx, selector);
}
