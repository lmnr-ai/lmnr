import { createContext, PropsWithChildren, useContext, useRef } from "react";
import { createStore, useStore } from "zustand";

import { getDefaultTraceViewWidth } from "./trace-view/utils";

export type TracesState = {
  traceId: string | null;
  spanId: string | null;
  defaultTraceViewWidth: number;
};

export type TracesActions = {
  setTraceId: (traceId: string | null) => void;
  setSpanId: (spanId: string | null) => void;
  setDefaultTraceViewWidth: (width: number) => void;
  reset: () => void;
};

export interface TracesProps {
  traceId: string | null;
  spanId: string | null;
  defaultTraceViewWidth?: number;
}

export type TracesStore = TracesState & TracesActions;

export type TracesStoreApi = ReturnType<typeof createTracesStore>;

export const createTracesStore = (initProps?: Partial<TracesProps>) => {
  const DEFAULT_PROPS: TracesState = {
    traceId: null,
    spanId: null,
    defaultTraceViewWidth: 1000,
  };

  return createStore<TracesStore>()((set, get) => ({
    ...DEFAULT_PROPS,
    ...initProps,

    setTraceId: (traceId) =>
      set({
        traceId,
      }),

    setSpanId: (spanId: string | null) => set({ spanId }),

    setDefaultTraceViewWidth: (defaultTraceViewWidth) => set({ defaultTraceViewWidth }),

    reset: () =>
      set({
        ...DEFAULT_PROPS,
        defaultTraceViewWidth: getDefaultTraceViewWidth(),
      }),
  }));
};

export const TracesContext = createContext<TracesStoreApi | null>(null);

export const useTracesStoreContext = <T,>(selector: (state: TracesStore) => T): T => {
  const store = useContext(TracesContext);
  if (!store) throw new Error("Missing TracesContext.Provider in the tree");
  return useStore(store, selector);
};

export const useTraceViewState = () =>
  useTracesStoreContext((state) => ({
    traceId: state.traceId,
    spanId: state.spanId,
    defaultTraceViewWidth: state.defaultTraceViewWidth,
  }));

export const useTraceViewActions = () =>
  useTracesStoreContext((state) => ({
    setSpanId: state.setSpanId,
    setTraceId: state.setTraceId,
    setDefaultTraceViewWidth: state.setDefaultTraceViewWidth,
    reset: state.reset,
  }));

export const TracesStoreProvider = ({ children, ...props }: PropsWithChildren<TracesProps>) => {
  const storeRef = useRef<TracesStoreApi | undefined>(undefined);
  if (!storeRef.current) {
    storeRef.current = createTracesStore(props);
  }

  return <TracesContext.Provider value={storeRef.current}>{children}</TracesContext.Provider>;
};
