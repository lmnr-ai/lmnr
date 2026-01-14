"use client";

import { createContext, type PropsWithChildren, useContext, useRef } from "react";
import { createStore, useStore } from "zustand";
import { persist } from "zustand/middleware";

import { type LabelingQueue, type LabelingQueueItem } from "@/lib/queue/types";

export interface AnnotationField {
  key: string;
  type: "number" | "enum" | "boolean" | "string";
  description?: string;
  options?: string[] | { min?: number; max?: number };
}

export type QueueState = {
  queue: LabelingQueue | null;
  currentItem:
    | (LabelingQueueItem & {
        count: number;
        position: number;
        payload: {
          data: Record<string, unknown>;
          target: Record<string, unknown>;
        };
      })
    | null;
  isLoading: "skip" | "move" | "first-load" | false;
  isValid: boolean;
  dataset: string | undefined;

  globalTargetSelections: Record<string, unknown>;
  annotationSchema: Record<string, unknown> | null;
  fields: AnnotationField[];
  focusedFieldIndex: number;

  height: number | null;
};

export type QueueActions = {
  setQueue: (queue: LabelingQueue) => void;
  setCurrentItem: (item: QueueState["currentItem"]) => void;
  setCurrentItemTarget: (target: Record<string, unknown>) => void;
  clearGlobalSelections: () => void;
  setIsLoading: (loading: QueueState["isLoading"]) => void;
  setIsValid: (valid: boolean) => void;
  setDataset: (dataset: string | undefined) => void;

  setAnnotationSchema: (annotationSchema: Record<string, unknown> | null) => void;
  updateTargetField: (key: string, value: unknown) => void;
  setFocusedField: (index: number) => void;
  focusField: (direction: "next" | "prev" | "first") => void;
  selectOptionInFocusedField: (optionNumber: number) => void;
  getTarget: () => Record<string, unknown>;

  setHeight: (height: number) => void;
};

export type QueueStore = QueueState & QueueActions;

interface SerializableQueueState {
  height: number | null;
  dataset?: string;
}

function parseAnnotationSchema(annotationSchema: Record<string, unknown> | null): AnnotationField[] {
  if (!annotationSchema || typeof annotationSchema !== "object" || !annotationSchema.properties) {
    return [];
  }

  const properties = annotationSchema.properties as Record<string, any>;
  const fields: AnnotationField[] = [];

  for (const [key, property] of Object.entries(properties)) {
    if (typeof property !== "object") continue;

    const description = property.description;
    const type = property.type;

    // Handle enum fields (which may not have a type property)
    if (property.enum && Array.isArray(property.enum)) {
      fields.push({
        key,
        type: "enum",
        description,
        options: property.enum.map((v: any) => String(v)),
      });
    } else if (!type) {
      // Skip if no type and no enum
      continue;
    } else if (type === "string") {
      fields.push({
        key,
        type: "string",
        description,
      });
    } else if (type === "number" || type === "integer") {
      const min = property.minimum ?? 1;
      const max = property.maximum ?? 5;
      fields.push({
        key,
        type: "number",
        description,
        options: { min, max },
      });
    } else if (type === "boolean") {
      fields.push({
        key,
        type: "boolean",
        description,
      });
    }
  }

  return fields.slice(0, 9);
}

const getDefaultQueueItem = (queueId: string): QueueState["currentItem"] => ({
  count: 0,
  position: 0,
  id: "-",
  createdAt: "",
  queueId,
  metadata: "{}",
  payload: {
    data: {},
    target: {},
  },
});

const createQueueStore = (queue: LabelingQueue) =>
  createStore<QueueStore>()(
    persist(
      (set, get) => ({
        queue,
        currentItem: getDefaultQueueItem(queue.id),
        isLoading: "first-load" as const,
        isValid: true,
        dataset: undefined,

        globalTargetSelections: {},
        annotationSchema: (queue.annotationSchema as Record<string, unknown>) || null,
        fields: parseAnnotationSchema((queue.annotationSchema as Record<string, unknown>) || null),
        focusedFieldIndex:
          parseAnnotationSchema((queue.annotationSchema as Record<string, unknown>) || null).length > 0 ? 0 : -1,

        height: null,

        setQueue: (queue) => set({ queue }),

        setCurrentItem: (currentItem) => {
          const { globalTargetSelections } = get();
          if (currentItem) {
            // Merge global selections with existing target data, prioritizing item-specific data
            currentItem = {
              ...currentItem,
              payload: {
                ...currentItem.payload,
                target: {
                  ...globalTargetSelections,
                  ...currentItem.payload.target,
                },
              },
            };
          }
          set({ currentItem });
        },

        setCurrentItemTarget: (target) => {
          set((state) => {
            if (!state.currentItem) return state;
            return {
              ...state,
              currentItem: {
                ...state.currentItem,
                payload: {
                  ...state.currentItem.payload,
                  target,
                },
              },
            };
          });
        },

        clearGlobalSelections: () => {
          set({ globalTargetSelections: {} });
        },

        setIsLoading: (isLoading) => set({ isLoading }),
        setIsValid: (isValid) => set({ isValid }),
        setDataset: (dataset) => set({ dataset }),

        setAnnotationSchema: (annotationSchema: Record<string, unknown> | null) => {
          const fields = parseAnnotationSchema(annotationSchema);
          set({
            annotationSchema,
            fields,
            focusedFieldIndex: fields.length > 0 ? 0 : -1,
          });
        },

        getTarget: () => {
          const { currentItem } = get();
          return currentItem?.payload.target || {};
        },

        updateTargetField: (key, value) => {
          set((state) => {
            if (!state.currentItem) return state;

            const newGlobalSelections = {
              ...state.globalTargetSelections,
              [key]: value,
            };

            return {
              ...state,
              globalTargetSelections: newGlobalSelections,
              currentItem: {
                ...state.currentItem,
                payload: {
                  ...state.currentItem.payload,
                  target: {
                    ...state.currentItem.payload.target,
                    [key]: value,
                  },
                },
              },
            };
          });
        },

        setFocusedField: (index) => {
          const { fields } = get();
          if (index >= 0 && index < fields.length) {
            set({ focusedFieldIndex: index });
          }
        },

        focusField: (direction: "next" | "prev" | "first") => {
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

        selectOptionInFocusedField: (optionNumber: number) => {
          const { fields, focusedFieldIndex, updateTargetField } = get();
          const field = fields[focusedFieldIndex];
          if (!field) return;

          const options = field.options;
          if (field.type === "number" && options && "min" in options) {
            const { min = 1, max = 5 } = options;
            const targetValue = min - 1 + optionNumber;
            if (targetValue >= min && targetValue <= max) {
              updateTargetField(field.key, targetValue);
            }
          } else if (field.type === "enum" && Array.isArray(field.options)) {
            const optionIndex = optionNumber - 1;
            if (optionIndex >= 0 && optionIndex < field.options.length) {
              updateTargetField(field.key, field.options[optionIndex]);
            }
          } else if (field.type === "boolean") {
            if (optionNumber === 1) {
              updateTargetField(field.key, false);
            } else if (optionNumber === 2) {
              updateTargetField(field.key, true);
            }
          }
        },

        setHeight: (height: number) => set({ height }),
      }),
      {
        name: `queue-${queue.id}-state`,
        partialize: (state): SerializableQueueState => ({
          height: state.height,
          dataset: state.dataset,
        }),
      }
    )
  );

type QueueStoreApi = ReturnType<typeof createQueueStore>;

const QueueStoreContext = createContext<QueueStoreApi | undefined>(undefined);

export interface QueueStoreProviderProps {
  queue: LabelingQueue;
}

export function QueueStoreProvider({ children, queue }: PropsWithChildren<QueueStoreProviderProps>) {
  const storeRef = useRef<QueueStoreApi | undefined>(undefined);

  if (!storeRef.current) {
    storeRef.current = createQueueStore(queue);
  }

  return <QueueStoreContext.Provider value={storeRef.current}>{children}</QueueStoreContext.Provider>;
}

export function useQueueStore<T>(selector: (store: QueueStore) => T): T {
  const queueStoreContext = useContext(QueueStoreContext);

  if (!queueStoreContext) {
    throw new Error("useQueueStore must be used within QueueStoreProvider");
  }

  return useStore(queueStoreContext, selector);
}
