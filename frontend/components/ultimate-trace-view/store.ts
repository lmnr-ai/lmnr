import { clamp } from "lodash";
import { createContext, useContext } from "react";
import { createStore, type StoreApi, useStore } from "zustand";

import { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/store";
import {
  computeVisibleSpanIds,
  type CondensedTimelineData,
  transformSpansToCondensedTimeline,
} from "@/components/traces/trace-view/store/utils";

import { type BlockSummary, type SpanTreeNode } from "./timeline/timeline-types";
import { buildSpanTree, computeExpandedLayout, computeMaxDepth } from "./timeline/timeline-utils";

export const MAX_ZOOM = 18;
export const MIN_ZOOM = 1;
export const ZOOM_INCREMENT = 0.5;

// Per-trace state
export interface UltimateTraceState {
  trace?: TraceViewTrace;
  spans: TraceViewSpan[];
  isTraceLoading: boolean;
  isSpansLoading: boolean;
  traceError?: string;
  spansError?: string;
  zoom: number;
  selectedSpanIds: Set<string>;
  visibleSpanIds: Set<string>;
  // Span tree and granularity
  spanTree: SpanTreeNode[] | null;
  maxDepth: number;
  granularityDepth: number;
  expandedRowMap: Map<string, number>;
  totalRows: number;
  blockSummaries: Record<string, BlockSummary>;
  isSummarizationLoading: boolean;
}

const createDefaultTraceState = (trace?: TraceViewTrace): UltimateTraceState => ({
  trace,
  spans: [],
  isTraceLoading: false,
  isSpansLoading: false,
  zoom: 1,
  selectedSpanIds: new Set(),
  visibleSpanIds: new Set(),
  spanTree: null,
  maxDepth: 0,
  granularityDepth: 0,
  expandedRowMap: new Map(),
  totalRows: 0,
  blockSummaries: {},
  isSummarizationLoading: false,
});

export interface UltimateTraceViewState {
  traces: Map<string, UltimateTraceState>;
  traceOrder: string[];
  selectedSpanId: string | null;
  selectedTraceId: string | null;
}

export interface UltimateTraceViewActions {
  addTrace: (traceId: string, trace?: TraceViewTrace) => void;
  removeTrace: (traceId: string) => void;

  setTraceData: (traceId: string, trace: TraceViewTrace) => void;
  setSpans: (traceId: string, spans: TraceViewSpan[]) => void;
  setIsTraceLoading: (traceId: string, loading: boolean) => void;
  setIsSpansLoading: (traceId: string, loading: boolean) => void;
  setTraceError: (traceId: string, error?: string) => void;
  setSpansError: (traceId: string, error?: string) => void;

  setZoom: (traceId: string, zoom: number) => void;
  selectSpan: (traceId: string, spanId: string) => void;
  deselectSpan: () => void;

  setSelectedSpanIds: (traceId: string, ids: Set<string>) => void;
  clearSelectedSpanIds: (traceId: string) => void;

  // Granularity / block summary actions
  setGranularityDepth: (traceId: string, depth: number) => void;
  addBlockSummaries: (traceId: string, summaries: Record<string, BlockSummary>) => void;
  setIsSummarizationLoading: (traceId: string, loading: boolean) => void;

  getCondensedTimelineData: (traceId: string) => CondensedTimelineData;
  getTraceState: (traceId: string) => UltimateTraceState | undefined;
}

export type UltimateTraceViewStore = UltimateTraceViewState & UltimateTraceViewActions;

function updateTraceState(
  traces: Map<string, UltimateTraceState>,
  traceId: string,
  update: Partial<UltimateTraceState>
): Map<string, UltimateTraceState> {
  const existing = traces.get(traceId);
  if (!existing) return traces;
  const next = new Map(traces);
  next.set(traceId, { ...existing, ...update });
  return next;
}

export const createUltimateTraceViewStore = (initialTraceId: string, initialTrace?: TraceViewTrace) =>
  createStore<UltimateTraceViewStore>()((set, get) => ({
    traces: new Map([[initialTraceId, createDefaultTraceState(initialTrace)]]),
    traceOrder: [initialTraceId],
    selectedSpanId: null,
    selectedTraceId: null,

    addTrace: (traceId, trace) => {
      set((state) => {
        if (state.traces.has(traceId)) return state;
        const next = new Map(state.traces);
        next.set(traceId, createDefaultTraceState(trace));
        return { traces: next, traceOrder: [...state.traceOrder, traceId] };
      });
    },

    removeTrace: (traceId) => {
      set((state) => {
        const next = new Map(state.traces);
        next.delete(traceId);
        return {
          traces: next,
          traceOrder: state.traceOrder.filter((id) => id !== traceId),
          selectedTraceId: state.selectedTraceId === traceId ? null : state.selectedTraceId,
          selectedSpanId: state.selectedTraceId === traceId ? null : state.selectedSpanId,
        };
      });
    },

    setTraceData: (traceId, trace) => {
      set((state) => ({ traces: updateTraceState(state.traces, traceId, { trace }) }));
    },

    setSpans: (traceId, spans) => {
      // When spans arrive, build the span tree and compute layout
      const spanTree = buildSpanTree(spans);
      const maxDepth = computeMaxDepth(spanTree);
      const { rowMap, totalRows } = computeExpandedLayout(spans);

      set((state) => ({
        traces: updateTraceState(state.traces, traceId, {
          spans,
          spanTree,
          maxDepth,
          granularityDepth: maxDepth, // Default to max depth (no summaries)
          expandedRowMap: rowMap,
          totalRows,
        }),
      }));
    },

    setIsTraceLoading: (traceId, loading) => {
      set((state) => ({ traces: updateTraceState(state.traces, traceId, { isTraceLoading: loading }) }));
    },

    setIsSpansLoading: (traceId, loading) => {
      set((state) => ({ traces: updateTraceState(state.traces, traceId, { isSpansLoading: loading }) }));
    },

    setTraceError: (traceId, error) => {
      set((state) => ({ traces: updateTraceState(state.traces, traceId, { traceError: error }) }));
    },

    setSpansError: (traceId, error) => {
      set((state) => ({ traces: updateTraceState(state.traces, traceId, { spansError: error }) }));
    },

    setZoom: (traceId, zoom) => {
      set((state) => ({
        traces: updateTraceState(state.traces, traceId, { zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM) }),
      }));
    },

    selectSpan: (traceId, spanId) => {
      set({ selectedSpanId: spanId, selectedTraceId: traceId });
    },

    deselectSpan: () => {
      set({ selectedSpanId: null, selectedTraceId: null });
    },

    setSelectedSpanIds: (traceId, ids) => {
      const traceState = get().traces.get(traceId);
      if (!traceState) return;
      const visibleIds = computeVisibleSpanIds(ids, traceState.spans);
      set((state) => ({
        traces: updateTraceState(state.traces, traceId, {
          selectedSpanIds: ids,
          visibleSpanIds: visibleIds,
        }),
      }));
    },

    clearSelectedSpanIds: (traceId) => {
      set((state) => ({
        traces: updateTraceState(state.traces, traceId, {
          selectedSpanIds: new Set(),
          visibleSpanIds: new Set(),
        }),
      }));
    },

    setGranularityDepth: (traceId, depth) => {
      set((state) => ({
        traces: updateTraceState(state.traces, traceId, { granularityDepth: depth }),
      }));
    },

    addBlockSummaries: (traceId, summaries) => {
      const traceState = get().traces.get(traceId);
      if (!traceState) return;
      set((state) => ({
        traces: updateTraceState(state.traces, traceId, {
          blockSummaries: { ...traceState.blockSummaries, ...summaries },
        }),
      }));
    },

    setIsSummarizationLoading: (traceId, loading) => {
      set((state) => ({
        traces: updateTraceState(state.traces, traceId, { isSummarizationLoading: loading }),
      }));
    },

    getCondensedTimelineData: (traceId) => {
      const traceState = get().traces.get(traceId);
      if (!traceState) {
        return {
          spans: [],
          startTime: 0,
          endTime: 0,
          totalRows: 0,
          timelineWidthInMilliseconds: 0,
          totalDurationMs: 0,
        };
      }
      return transformSpansToCondensedTimeline(traceState.spans);
    },

    getTraceState: (traceId) => get().traces.get(traceId),
  }));

// Context and hooks
export const UltimateTraceViewContext = createContext<StoreApi<UltimateTraceViewStore> | undefined>(undefined);

export const useUltimateTraceViewStore = <T>(selector: (store: UltimateTraceViewStore) => T): T => {
  const store = useContext(UltimateTraceViewContext);
  if (!store) {
    throw new Error("useUltimateTraceViewStore must be used within a UltimateTraceViewContext provider");
  }
  return useStore(store, selector);
};

export const useUltimateTraceViewStoreRaw = () => {
  const store = useContext(UltimateTraceViewContext);
  if (!store) {
    throw new Error("useUltimateTraceViewStoreRaw must be used within a UltimateTraceViewContext provider");
  }
  return store;
};
