import { create } from "zustand";

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

const initialState: TracesState = {
  traceId: null,
  spanId: null,
  defaultTraceViewWidth: 1000,
};

export type TracesStore = TracesState & TracesActions;

export const useTracesStore = create<TracesStore>()((set, get) => ({
  ...initialState,

  setTraceId: (traceId) =>
    set({
      traceId,
    }),

  setSpanId: (spanId: string | null) => set({ spanId }),

  setDefaultTraceViewWidth: (defaultTraceViewWidth) => set({ defaultTraceViewWidth }),

  reset: () =>
    set({
      ...initialState,
      defaultTraceViewWidth: getDefaultTraceViewWidth(),
    }),
}));

export const useTraceViewState = () =>
  useTracesStore((state) => ({
    traceId: state.traceId,
    defaultTraceViewWidth: state.defaultTraceViewWidth,
  }));

export const useTraceViewActions = () =>
  useTracesStore((state) => ({
    setSpanId: state.setSpanId,
    setTraceId: state.setTraceId,
    setDefaultTraceViewWidth: state.setDefaultTraceViewWidth,
    reset: state.reset,
  }));
