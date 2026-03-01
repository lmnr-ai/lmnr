"use client";

import { createContext, type PropsWithChildren, useContext, useRef } from "react";
import { createStore, type StoreApi, useStore } from "zustand";

import {
  type TraceViewListSpan,
  type TraceViewSpan,
  type TraceViewTrace,
} from "@/components/traces/trace-view/store/base";

import { type DiffRow, type SpanMapping } from "./trace-diff-types";
import { computeAlignedRows, toListSpans } from "./trace-diff-utils";

export type DiffPhase = "selecting" | "loading" | "ready";

interface TraceDiffState {
  phase: DiffPhase;

  leftTrace?: TraceViewTrace;
  leftSpans: TraceViewSpan[];
  leftListSpans: TraceViewListSpan[];
  isLeftLoading: boolean;

  rightTrace?: TraceViewTrace;
  rightSpans: TraceViewSpan[];
  rightListSpans: TraceViewListSpan[];
  isRightLoading: boolean;

  spanMapping: SpanMapping;
  isMappingLoading: boolean;
  alignedRows: DiffRow[];

  selectedRowIndex: number | null;
}

interface TraceDiffActions {
  setLeftData: (trace: TraceViewTrace, spans: TraceViewSpan[]) => void;
  setRightData: (trace: TraceViewTrace, spans: TraceViewSpan[]) => void;
  setIsLeftLoading: (loading: boolean) => void;
  setIsRightLoading: (loading: boolean) => void;
  setIsMappingLoading: (loading: boolean) => void;
  setMapping: (mapping: SpanMapping) => void;
  selectRow: (index: number | null) => void;
  clearSelection: () => void;
  reset: () => void;
}

export type TraceDiffStore = TraceDiffState & TraceDiffActions;

const initialState: TraceDiffState = {
  phase: "selecting",
  leftSpans: [],
  leftListSpans: [],
  isLeftLoading: true,
  rightSpans: [],
  rightListSpans: [],
  isRightLoading: false,
  spanMapping: [],
  isMappingLoading: false,
  alignedRows: [],
  selectedRowIndex: null,
};

function createTraceDiffStore() {
  return createStore<TraceDiffStore>()((set, get) => ({
    ...initialState,

    setLeftData: (trace, spans) => {
      const listSpans = toListSpans(spans);
      set({
        leftTrace: trace,
        leftSpans: spans,
        leftListSpans: listSpans,
        isLeftLoading: false,
      });
    },

    setRightData: (trace, spans) => {
      const listSpans = toListSpans(spans);
      set({
        rightTrace: trace,
        rightSpans: spans,
        rightListSpans: listSpans,
        isRightLoading: false,
        phase: "loading",
      });
    },

    setIsLeftLoading: (loading) => set({ isLeftLoading: loading }),
    setIsRightLoading: (loading) => set({ isRightLoading: loading }),
    setIsMappingLoading: (loading) => set({ isMappingLoading: loading }),

    setMapping: (mapping) => {
      const { leftListSpans, rightListSpans } = get();
      const alignedRows = computeAlignedRows(leftListSpans, rightListSpans, mapping);
      set({
        spanMapping: mapping,
        alignedRows,
        isMappingLoading: false,
        phase: "ready",
      });
    },

    selectRow: (index) => set({ selectedRowIndex: index }),
    clearSelection: () => set({ selectedRowIndex: null }),

    reset: () =>
      set({
        ...initialState,
        leftTrace: get().leftTrace,
        leftSpans: get().leftSpans,
        leftListSpans: get().leftListSpans,
        isLeftLoading: false,
      }),
  }));
}

const TraceDiffStoreContext = createContext<StoreApi<TraceDiffStore> | undefined>(undefined);

export function TraceDiffStoreProvider({ children }: PropsWithChildren) {
  const storeRef = useRef<StoreApi<TraceDiffStore>>(undefined);

  if (storeRef.current == null) {
    storeRef.current = createTraceDiffStore();
  }

  return <TraceDiffStoreContext.Provider value={storeRef.current!}>{children}</TraceDiffStoreContext.Provider>;
}

export function useTraceDiffStore<T>(selector: (store: TraceDiffStore) => T): T {
  const store = useContext(TraceDiffStoreContext);
  if (!store) {
    throw new Error("useTraceDiffStore must be used within a TraceDiffStoreProvider");
  }
  return useStore(store, selector);
}
