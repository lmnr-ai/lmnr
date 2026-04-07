"use client";

import { createContext, type PropsWithChildren, useContext, useRef } from "react";
import { createStore, useStore } from "zustand";
import { shallow } from "zustand/shallow";

interface DashboardTraceState {
  traceId: string | null;
  spanId: string | null;
}

interface DashboardTraceActions {
  openTrace: (traceId: string, spanId?: string) => void;
  closeTrace: () => void;
}

type DashboardTraceStore = DashboardTraceState & DashboardTraceActions;

const createDashboardTraceStore = () =>
  createStore<DashboardTraceStore>((set) => ({
    traceId: null,
    spanId: null,
    openTrace: (traceId, spanId) => set({ traceId, spanId: spanId ?? null }),
    closeTrace: () => set({ traceId: null, spanId: null }),
  }));

type DashboardTraceStoreApi = ReturnType<typeof createDashboardTraceStore>;

const DashboardTraceContext = createContext<DashboardTraceStoreApi | null>(null);

export const DashboardTraceProvider = ({ children }: PropsWithChildren) => {
  const storeRef = useRef<DashboardTraceStoreApi>(null);
  if (!storeRef.current) {
    storeRef.current = createDashboardTraceStore();
  }

  return (
    <DashboardTraceContext.Provider value={storeRef.current}>
      {children}
    </DashboardTraceContext.Provider>
  );
};

export const useDashboardTraceStore = <T,>(selector: (state: DashboardTraceStore) => T): T => {
  const store = useContext(DashboardTraceContext);
  if (!store) {
    throw new Error("useDashboardTraceStore must be used within a DashboardTraceProvider");
  }
  return useStore(store, selector, shallow);
};
