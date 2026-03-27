"use client";

import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore, type StoreApi, useStore } from "zustand";
import { persist } from "zustand/middleware";

import {
  type TraceViewListSpan,
  type TraceViewSpan,
  type TraceViewTrace,
} from "@/components/traces/trace-view/store/base";
import { toListSpans } from "@/components/traces/trace-view/store/utils";

import { type DiffRow, type SpanMapping } from "./types";
import { computeAlignedRows } from "./utils";

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

  selectedRowIndex: number | null;

  mappingCache: Record<string, SpanMapping>;
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
  getCachedMapping: (left: string, right: string) => SpanMapping | undefined;
  setCachedMapping: (left: string, right: string, mapping: SpanMapping) => void;
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
  selectedRowIndex: null,
  mappingCache: {},
};

const createTraceDiffStore = () =>
  createStore<TraceDiffStore>()(
    persist(
      (set, get) => ({
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
            selectedRowIndex: null,
          });
        },

        setMappingError: (error) =>
          set({
            mappingError: error,
            isMappingLoading: false,
            phase: "error",
          }),

        retryMapping: () =>
          set({
            mappingError: null,
            isMappingLoading: true,
            phase: "loading" as DiffPhase,
          }),

        toggleRow: (index) => set((s) => ({ selectedRowIndex: s.selectedRowIndex === index ? null : index })),
        clearSelection: () => set({ selectedRowIndex: null }),

        reset: () =>
          set({
            ...initialState,
            mappingCache: get().mappingCache,
            leftTrace: get().leftTrace,
            leftSpans: get().leftSpans,
            leftListSpans: get().leftListSpans,
            isLeftLoading: false,
          }),

        getCachedMapping: (left, right) => get().mappingCache[`${left}-${right}`],
        setCachedMapping: (left, right, mapping) =>
          set((s) => {
            const cache = { ...s.mappingCache, [`${left}-${right}`]: mapping };
            // Evict oldest entries when cache exceeds max size
            const MAX_CACHE_ENTRIES = 50;
            const keys = Object.keys(cache);
            if (keys.length > MAX_CACHE_ENTRIES) {
              for (const key of keys.slice(0, keys.length - MAX_CACHE_ENTRIES)) {
                delete cache[key];
              }
            }
            return { mappingCache: cache };
          }),
      }),
      {
        name: "trace-diff-mapping-cache",
        partialize: (state) => ({ mappingCache: state.mappingCache }),
        merge: (persisted, current) => ({
          ...current,
          mappingCache: (persisted as Partial<TraceDiffState>)?.mappingCache ?? current.mappingCache,
        }),
      }
    )
  );

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
