"use client";

import { createContext, type PropsWithChildren, useContext, useRef } from "react";
import { createStore, useStore } from "zustand";
import { shallow } from "zustand/shallow";

interface HomeTraceState {
  traceId: string | null;
  spanId: string | null;
}

interface HomeTraceActions {
  openTrace: (traceId: string, spanId?: string) => void;
  closeTrace: () => void;
}

type HomeTraceStore = HomeTraceState & HomeTraceActions;

const createHomeTraceStore = () =>
  createStore<HomeTraceStore>((set) => ({
    traceId: null,
    spanId: null,
    openTrace: (traceId, spanId) => set({ traceId, spanId: spanId ?? null }),
    closeTrace: () => set({ traceId: null, spanId: null }),
  }));

type HomeTraceStoreApi = ReturnType<typeof createHomeTraceStore>;

const HomeTraceContext = createContext<HomeTraceStoreApi | null>(null);

export const HomeTraceProvider = ({ children }: PropsWithChildren) => {
  const storeRef = useRef<HomeTraceStoreApi>(null);
  if (!storeRef.current) {
    storeRef.current = createHomeTraceStore();
  }

  return (
    <HomeTraceContext.Provider value={storeRef.current}>
      {children}
    </HomeTraceContext.Provider>
  );
};

export const useHomeTraceStore = <T,>(selector: (state: HomeTraceStore) => T): T => {
  const store = useContext(HomeTraceContext);
  if (!store) {
    throw new Error("useHomeTraceStore must be used within a HomeTraceProvider");
  }
  return useStore(store, selector, shallow);
};
