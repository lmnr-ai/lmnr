import { createContext, PropsWithChildren, useContext, useRef } from "react";
import { createStore, useStore } from "zustand";

export type TracesState = {
  traceId: string | null;
  spanId: string | null;
};

export type TracesActions = {
  setTraceId: (traceId: string | null) => void;
  setSpanId: (spanId: string | null) => void;
};

export interface TracesProps {
  traceId: string | null;
  spanId: string | null;
}

export type TracesStore = TracesState & TracesActions;

export type TracesStoreApi = ReturnType<typeof createTracesStore>;

export const createTracesStore = (initProps?: Partial<TracesProps>) => {
  const DEFAULT_PROPS: TracesState = {
    traceId: null,
    spanId: null,
  };

  return createStore<TracesStore>()((set, get) => ({
    ...DEFAULT_PROPS,
    ...initProps,

    setTraceId: (traceId) =>
      set({
        traceId,
      }),

    setSpanId: (spanId: string | null) => set({ spanId }),
  }));
};

export const TracesContext = createContext<TracesStoreApi | null>(null);

export const useTracesStoreContext = <T,>(selector: (state: TracesStore) => T): T => {
  const store = useContext(TracesContext);
  if (!store) throw new Error("Missing TracesContext.Provider in the tree");
  return useStore(store, selector);
};

export const TracesStoreProvider = ({ children, ...props }: PropsWithChildren<TracesProps>) => {
  const storeRef = useRef<TracesStoreApi | undefined>(undefined);
  if (!storeRef.current) {
    storeRef.current = createTracesStore(props);
  }

  return <TracesContext.Provider value={storeRef.current}>{children}</TracesContext.Provider>;
};
