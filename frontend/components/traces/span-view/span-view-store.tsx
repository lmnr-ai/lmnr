"use client";

import React, { createContext, type PropsWithChildren, useContext, useRef } from "react";
import { createStore, type StoreApi, useStore } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SpanViewState {
  collapsed: Set<string>;
  heights: Map<string, number>;
}

interface SpanViewActions {
  isCollapsed: (key: string) => boolean;
  toggleCollapse: (key: string) => void;
  setHeight: (key: string) => (height: number) => void;
}

interface SerializableState {
  collapsed: string[];
  heights: [string, number][];
}

export type SpanViewStore = SpanViewState & SpanViewActions;

const createSpanViewStore = () =>
  createStore<SpanViewStore>()(
    persist(
      (set, get) => ({
        collapsed: new Set<string>(),
        heights: new Map<string, number>(),
        isCollapsed: (key: string) => get().collapsed.has(key),
        toggleCollapse: (key: string) => {
          set((state) => ({
            ...state,
            collapsed: new Set(
              state.collapsed.has(key)
                ? Array.from(state.collapsed).filter((k) => k !== key)
                : [...Array.from(state.collapsed), key]
            ),
          }));
        },

        setHeight: (key: string) => (height: number) => {
          set((state) => ({
            ...state,
            heights: new Map([...state.heights.entries(), [key, height]]),
          }));
        },
      }),
      {
        name: "span-view-state",
        storage: createJSONStorage(() => ({
          getItem: (name) => localStorage.getItem(name),
          setItem: (name, value) => localStorage.setItem(name, value),
          removeItem: (name) => localStorage.removeItem(name),
        })),
        partialize: (state): SerializableState => ({
          collapsed: Array.from(state.collapsed),
          heights: Array.from(state.heights.entries()),
        }),
        merge: (persistedState, currentState) => {
          const persisted = persistedState as SerializableState;

          return {
            ...currentState,
            collapsed: new Set<string>(persisted.collapsed || []),
            heights: new Map<string, number>(persisted.heights || []),
          };
        },
      }
    )
  );

const SpanViewStoreContext = createContext<StoreApi<SpanViewStore> | null>(null);

export function SpanViewStateProvider({ children }: PropsWithChildren) {
  const storeRef = useRef<StoreApi<SpanViewStore> | undefined>(undefined);

  if (!storeRef.current) {
    storeRef.current = createSpanViewStore();
  }

  return <SpanViewStoreContext.Provider value={storeRef.current}>{children}</SpanViewStoreContext.Provider>;
}

export function useSpanViewStore<T>(selector: (store: SpanViewStore) => T): T {
  const spanViewStoreContext = useContext(SpanViewStoreContext);

  if (!spanViewStoreContext) {
    throw new Error("useSpanViewStore must be used within SpanViewStateProvider");
  }

  return useStore(spanViewStoreContext, selector);
}
