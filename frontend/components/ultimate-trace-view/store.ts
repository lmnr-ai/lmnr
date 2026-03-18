import { clamp } from "lodash";
import { createContext, useContext } from "react";
import { createStore, type StoreApi, useStore } from "zustand";

import type { TraceViewSpan, TraceViewTrace } from "@/components/traces/trace-view/store";
import {
  computeVisibleSpanIds,
  type CondensedTimelineData,
  transformSpansToCondensedTimeline,
} from "@/components/traces/trace-view/store/utils";

import { type BlockSummary, type SpanTreeNode } from "./timeline/timeline-types";
import { buildSpanTree, computeExpandedLayout, computeMaxDepth } from "./timeline/timeline-utils";

// Signal event from the signal_events ClickHouse table
export interface TraceSignalEvent {
  id: string;
  signal_id: string;
  signal_name: string;
  trace_id: string;
  payload: string;
  timestamp: string;
}

// Per-signal info for a trace, including fake span associations
export interface TraceSignalInfo {
  signalId: string;
  signalName: string;
  color: string;
  // Fake associations: random span IDs from the trace
  associatedSpanIds: string[];
  // Real event data
  events: TraceSignalEvent[];
}

export const MAX_ZOOM = 18;
export const MIN_ZOOM = 1;
export const ZOOM_INCREMENT = 0.5;

// Panel types
export type PanelType = "span-list" | "span-view" | "event-payload" | "trace-picker";

export interface PanelDescriptor {
  type: PanelType;
  key: string;
  traceId: string;
  // span-list: spanIds to show; span-view: spanId; event-payload: signalId + event
  data: {
    spanIds?: string[];
    spanId?: string;
    title?: string;
    signalId?: string;
    event?: TraceSignalEvent;
  };
}

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
  // Signal data
  signals: TraceSignalInfo[];
  // Map from spanId to signal IDs associated with it
  spanSignalMap: Map<string, string[]>;
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
  signals: [],
  spanSignalMap: new Map(),
});

export interface UltimateTraceViewState {
  traces: Map<string, UltimateTraceState>;
  traceOrder: string[];
  selectedSpanId: string | null;
  selectedTraceId: string | null;
  panels: PanelDescriptor[];
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

  // Signal actions
  setSignals: (traceId: string, signals: TraceSignalInfo[]) => void;

  // Panel actions
  openSpanListPanel: (traceId: string, spanIds: string[], title?: string) => void;
  openEventPayloadPanel: (traceId: string, signalId: string, event: TraceSignalEvent) => void;
  openSpanViewPanel: (traceId: string, spanId: string) => void;
  openTracePickerPanel: () => void;
  closePanel: (key: string) => void;
  closePanelsByType: (type: PanelType) => void;

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
    panels: [],

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
          panels: state.panels.filter((p) => p.traceId !== traceId),
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

    setSignals: (traceId, signals) => {
      // Build spanSignalMap from signals
      const spanSignalMap = new Map<string, string[]>();
      for (const signal of signals) {
        for (const spanId of signal.associatedSpanIds) {
          const existing = spanSignalMap.get(spanId) ?? [];
          existing.push(signal.signalId);
          spanSignalMap.set(spanId, existing);
        }
      }
      set((state) => ({
        traces: updateTraceState(state.traces, traceId, { signals, spanSignalMap }),
      }));
    },

    openEventPayloadPanel: (traceId, signalId, event) => {
      set((state) => {
        // Replace any existing event-payload panel
        const filtered = state.panels.filter((p) => p.type !== "event-payload");
        const panel: PanelDescriptor = {
          type: "event-payload",
          key: `event-payload-${signalId}`,
          traceId,
          data: { signalId, event, title: event.signal_name },
        };
        return { panels: [...filtered, panel] };
      });
    },

    openSpanListPanel: (traceId, spanIds, title) => {
      set((state) => {
        // Replace any existing span-list panel for this trace
        const filtered = state.panels.filter((p) => !(p.type === "span-list" && p.traceId === traceId));
        const panel: PanelDescriptor = {
          type: "span-list",
          key: `span-list-${traceId}`,
          traceId,
          data: { spanIds, title },
        };
        // Insert span-list before any span-view panels for the same trace
        const insertIndex = filtered.findIndex((p) => p.type === "span-view" && p.traceId === traceId);
        if (insertIndex >= 0) {
          const next = [...filtered];
          next.splice(insertIndex, 0, panel);
          return { panels: next };
        }
        return { panels: [...filtered, panel] };
      });
    },

    openSpanViewPanel: (traceId, spanId) => {
      set((state) => {
        // Same trace as existing span-view → replace it
        const existingSameTrace = state.panels.find((p) => p.type === "span-view" && p.traceId === traceId);
        if (existingSameTrace) {
          return {
            panels: state.panels.map((p) =>
              p.key === existingSameTrace.key ? { ...p, data: { ...p.data, spanId } } : p
            ),
          };
        }
        // Different trace or no existing span-view → add new
        const panel: PanelDescriptor = {
          type: "span-view",
          key: `span-view-${traceId}`,
          traceId,
          data: { spanId },
        };
        return { panels: [...state.panels, panel] };
      });
    },

    openTracePickerPanel: () => {
      set((state) => {
        // Remove any existing trace-picker panel
        const filtered = state.panels.filter((p) => p.type !== "trace-picker");
        const panel: PanelDescriptor = {
          type: "trace-picker",
          key: "trace-picker",
          traceId: "",
          data: {},
        };
        return { panels: [...filtered, panel] };
      });
    },

    closePanel: (key) => {
      const panel = get().panels.find((p) => p.key === key);
      set((state) => {
        const nextPanels = state.panels.filter((p) => p.key !== key);
        // Clear opacity filter when closing a span-list panel
        if (panel?.type === "span-list") {
          return {
            panels: nextPanels,
            traces: updateTraceState(state.traces, panel.traceId, {
              selectedSpanIds: new Set(),
              visibleSpanIds: new Set(),
            }),
          };
        }
        return { panels: nextPanels };
      });
    },

    closePanelsByType: (type) => {
      set((state) => ({
        panels: state.panels.filter((p) => p.type !== type),
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
