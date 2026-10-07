"use client";

import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore } from "zustand";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";

interface DashboardTraceState {
  traceId: string | null;
  spanId: string | null;
  signalId: string | null;
}

interface DashboardTraceActions {
  openTrace: (traceId: string, spanId?: string, signalId?: string) => void;
  closeTrace: () => void;
}

type DashboardTraceStore = DashboardTraceState & DashboardTraceActions;

const createDashboardTraceStore = () =>
  createStore<DashboardTraceStore>((set) => ({
    traceId: null,
    spanId: null,
    signalId: null,
    openTrace: (traceId, spanId, signalId) => set({ traceId, spanId: spanId ?? null, signalId: signalId ?? null }),
    closeTrace: () => set({ traceId: null, spanId: null, signalId: null }),
  }));

type DashboardTraceStoreApi = ReturnType<typeof createDashboardTraceStore>;

const DashboardTraceContext = createContext<DashboardTraceStoreApi | null>(null);

export const DashboardTraceProvider = ({ children }: PropsWithChildren) => {
  const [store] = useState(() => createDashboardTraceStore());

  return <DashboardTraceContext.Provider value={store}>{children}</DashboardTraceContext.Provider>;
};

export const useDashboardTraceStore = <T,>(selector: (state: DashboardTraceStore) => T): T => {
  const store = useContext(DashboardTraceContext);
  if (!store) {
    throw new Error("useDashboardTraceStore must be used within a DashboardTraceProvider");
  }
  return useStoreWithEqualityFn(store, selector, shallow);
};
