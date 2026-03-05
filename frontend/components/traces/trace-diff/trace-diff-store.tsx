"use client";

import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore, type StoreApi, useStore } from "zustand";

import {
  type TraceViewListSpan,
  type TraceViewSpan,
  type TraceViewTrace,
} from "@/components/traces/trace-view/store/base";
import { toListSpans } from "@/components/traces/trace-view/store/utils";

import { type DiffRow, type SpanMapping } from "./trace-diff-types";
import { computeAlignedRows } from "./trace-diff-utils";

export type DiffPhase = "selecting" | "loading" | "error" | "ready";

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
  mappingError: string | null;
  alignedRows: DiffRow[];
  retryCounter: number;

  selectedRowIndex: number | null;
}

interface TraceDiffActions {
  setLeftData: (trace: TraceViewTrace, spans: TraceViewSpan[]) => void;
  setRightData: (trace: TraceViewTrace, spans: TraceViewSpan[]) => void;
  setIsLeftLoading: (loading: boolean) => void;
  setIsRightLoading: (loading: boolean) => void;
  setIsMappingLoading: (loading: boolean) => void;
  setMapping: (mapping: SpanMapping) => void;
  setMappingError: (error: string) => void;
  retryMapping: () => void;
  toggleRow: (index: number) => void;
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
  mappingError: null,
  alignedRows: [],
  retryCounter: 0,
  selectedRowIndex: null,
};

const createTraceDiffStore = () =>
  createStore<TraceDiffStore>()((set, get) => ({
    ...initialState,

    setLeftData: (trace, spans) => {
      const listSpans = toListSpans(spans);
      const hasRight = !!get().rightTrace;
      set({
        leftTrace: trace,
        leftSpans: spans,
        leftListSpans: listSpans,
        isLeftLoading: false,
        // If right trace exists, reset mapping state so it re-runs
        ...(hasRight
          ? {
              phase: "loading" as DiffPhase,
              spanMapping: [],
              alignedRows: [],
              selectedRowIndex: null,
              mappingError: null,
            }
          : {}),
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
        spanMapping: [],
        alignedRows: [],
        selectedRowIndex: null,
        mappingError: null,
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
        mappingError: null,
        phase: "ready",
      });
    },

    setMappingError: (error) =>
      set({
        mappingError: error,
        isMappingLoading: false,
        phase: "error",
      }),

    retryMapping: () =>
      set((s) => ({
        mappingError: null,
        isMappingLoading: true,
        phase: "loading" as DiffPhase,
        retryCounter: s.retryCounter + 1,
      })),

    toggleRow: (index) => set((s) => ({ selectedRowIndex: s.selectedRowIndex === index ? null : index })),
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

const TraceDiffStoreContext = createContext<StoreApi<TraceDiffStore> | undefined>(undefined);

export const TraceDiffStoreProvider = ({ children }: PropsWithChildren) => {
  const [store] = useState(createTraceDiffStore);
  return <TraceDiffStoreContext.Provider value={store}>{children}</TraceDiffStoreContext.Provider>;
};

export const useTraceDiffStore = <T,>(selector: (store: TraceDiffStore) => T): T => {
  const store = useContext(TraceDiffStoreContext);
  if (!store) {
    throw new Error("useTraceDiffStore must be used within a TraceDiffStoreProvider");
  }
  return useStore(store, selector);
};
