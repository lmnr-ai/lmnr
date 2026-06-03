import { clamp } from "lodash";
import { createContext, useContext } from "react";
import { createStore, type StoreApi, useStore } from "zustand";

import type { TraceViewSpan, TraceViewTrace } from "@/components/traces/trace-view/store";
import {
  type CondensedTimelineData,
  transformSpansToCondensedTimeline,
} from "@/components/traces/trace-view/store/utils";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils";
import { type RealtimeSpan, type SpanType } from "@/lib/traces/types";

export const MAX_ZOOM = 18;
export const MIN_ZOOM = 1;
export const ZOOM_INCREMENT = 0.5;

// Trace-metadata key the coding agent writes its run note to (via
// `lmnr-cli trace set-note`). Naming stays `rollout.*` to match
// `rollout.session_id`. The value is an opaque markdown string.
const NOTE_METADATA_KEY = "rollout.note";

// Pull the agent-authored note out of a trace's metadata (a JSON string).
// Returns undefined when there's no note or the metadata can't be parsed.
const noteFromTrace = (trace?: TraceViewTrace): string | undefined => {
  if (!trace?.metadata) return undefined;
  try {
    const parsed = JSON.parse(trace.metadata) as Record<string, unknown>;
    const note = parsed[NOTE_METADATA_KEY];
    return typeof note === "string" ? note : undefined;
  } catch {
    return undefined;
  }
};

// A trace and the agent-authored note for that run (debugger sessions). The note
// is markdown and owns its own heading — there is no separate run title.
export interface SeedTrace {
  traceId: string;
  // Agent-authored markdown note rendered below the run's timeline (may embed
  // span refs). Usually derived from trace metadata; seedable as an override.
  comment?: string;
}

// Per-trace state
export interface UltimateTraceState {
  trace?: TraceViewTrace;
  // Agent-authored markdown note rendered below the timeline (may embed span refs)
  comment?: string;
  spans: TraceViewSpan[];
  isTraceLoading: boolean;
  isSpansLoading: boolean;
  traceError?: string;
  spansError?: string;
  zoom: number;
}

const createDefaultTraceState = (trace?: TraceViewTrace, comment?: string): UltimateTraceState => ({
  trace,
  comment,
  spans: [],
  isTraceLoading: false,
  isSpansLoading: false,
  zoom: 1,
});

// Map a streamed RealtimeSpan onto the TraceViewSpan shape the timeline reads.
// `mode === "start"` yields a pending span (end == start); "update" is final.
const realtimeToTraceViewSpan = (s: RealtimeSpan, mode: "start" | "update"): TraceViewSpan =>
  ({
    spanId: s.spanId,
    parentSpanId: s.parentSpanId,
    traceId: s.traceId,
    name: s.name,
    startTime: s.startTime,
    endTime: mode === "start" ? s.startTime : s.endTime,
    attributes: s.attributes,
    spanType: s.spanType,
    path: "",
    events: [],
    status: s.status,
    pending: mode === "start",
    collapsed: false,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputCost: 0,
    outputCost: 0,
    totalCost: 0,
  }) as TraceViewSpan;

export interface UltimateTraceViewState {
  traces: Map<string, UltimateTraceState>;
  traceOrder: string[];
  selectedSpanId: string | null;
  selectedTraceId: string | null;
  // The trace/span shown in the regular trace-view side panel (null = closed)
  sidePanelTraceId: string | null;
  sidePanelSpanId: string | null;
}

export interface UltimateTraceViewActions {
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

  // Realtime: upsert a streamed span into its trace (adding the trace/run live
  // if it's the first span we've seen for that traceId).
  applyRealtimeSpan: (span: RealtimeSpan, mode: "start" | "update") => void;

  // Realtime: ensure a run slot exists for a traceId (added live by a streamed
  // trace_update). Returns true if the trace was newly added.
  ensureTrace: (traceId: string) => boolean;

  // Side-panel actions (regular trace-view side panel)
  openSidePanel: (traceId: string, spanId?: string) => void;
  closeSidePanel: () => void;

  getCondensedTimelineData: (traceId: string) => CondensedTimelineData;
  getTraceState: (traceId: string) => UltimateTraceState | undefined;
  // Span type for an already-loaded span (drives the span-ref chip icon color)
  getSpanType: (traceId: string, spanId: string) => SpanType | undefined;
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

// Build the initial trace map / order from one or more seed traces (multi-trace sessions)
const buildInitialTraces = (seeds: SeedTrace[]): { traces: Map<string, UltimateTraceState>; traceOrder: string[] } => {
  const traces = new Map<string, UltimateTraceState>();
  const traceOrder: string[] = [];
  for (const seed of seeds) {
    if (traces.has(seed.traceId)) continue;
    traces.set(seed.traceId, createDefaultTraceState(undefined, seed.comment));
    traceOrder.push(seed.traceId);
  }
  return { traces, traceOrder };
};

export const createUltimateTraceViewStore = (seeds: SeedTrace[], initialTrace?: TraceViewTrace) =>
  createStore<UltimateTraceViewStore>()((set, get) => {
    const { traces: initialTraces, traceOrder: initialOrder } = buildInitialTraces(seeds);
    // Hydrate the first seed's trace meta when provided (single-trace /alpha harness)
    if (initialTrace && initialOrder.length > 0) {
      const first = initialOrder[0];
      const existing = initialTraces.get(first);
      if (existing) {
        initialTraces.set(first, {
          ...existing,
          trace: initialTrace,
          comment: existing.comment ?? noteFromTrace(initialTrace),
        });
      }
    }

    return {
      traces: initialTraces,
      traceOrder: initialOrder,
      selectedSpanId: null,
      selectedTraceId: null,
      sidePanelTraceId: null,
      sidePanelSpanId: null,

      removeTrace: (traceId) => {
        set((state) => {
          const next = new Map(state.traces);
          next.delete(traceId);
          return {
            traces: next,
            traceOrder: state.traceOrder.filter((id) => id !== traceId),
            sidePanelTraceId: state.sidePanelTraceId === traceId ? null : state.sidePanelTraceId,
            sidePanelSpanId: state.sidePanelTraceId === traceId ? null : state.sidePanelSpanId,
            selectedTraceId: state.selectedTraceId === traceId ? null : state.selectedTraceId,
            selectedSpanId: state.selectedTraceId === traceId ? null : state.selectedSpanId,
          };
        });
      },

      setTraceData: (traceId, trace) => {
        // The run note is authored by the agent into trace metadata, so it only
        // becomes available once the trace loads — derive `comment` here.
        set((state) => ({
          traces: updateTraceState(state.traces, traceId, { trace, comment: noteFromTrace(trace) }),
        }));
      },

      setSpans: (traceId, spans) => {
        set((state) => ({ traces: updateTraceState(state.traces, traceId, { spans }) }));
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

      applyRealtimeSpan: (newSpan, mode) => {
        set((state) => {
          const existing = state.traces.get(newSpan.traceId);
          const base = existing ?? createDefaultTraceState();

          const spans = [...base.spans];
          const idx = spans.findIndex((s) => s.spanId === newSpan.spanId);
          if (idx === -1) {
            spans.push(realtimeToTraceViewSpan(newSpan, mode));
          } else if (mode === "update") {
            spans[idx] = { ...realtimeToTraceViewSpan(newSpan, mode), collapsed: spans[idx].collapsed };
          } else {
            return state; // duplicate start — nothing to do
          }
          spans.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

          const traces = new Map(state.traces);
          traces.set(newSpan.traceId, { ...base, spans: enrichSpansWithPending(spans) });
          // Append the run live if this is a trace we hadn't seen yet.
          const traceOrder = existing ? state.traceOrder : [...state.traceOrder, newSpan.traceId];
          return { traces, traceOrder };
        });
      },

      ensureTrace: (traceId) => {
        if (get().traces.has(traceId)) return false;
        set((state) => {
          if (state.traces.has(traceId)) return state;
          const traces = new Map(state.traces);
          traces.set(traceId, createDefaultTraceState());
          return { traces, traceOrder: [...state.traceOrder, traceId] };
        });
        return true;
      },

      openSidePanel: (traceId, spanId) => {
        set({ sidePanelTraceId: traceId, sidePanelSpanId: spanId ?? null });
      },

      closeSidePanel: () => {
        set({ sidePanelTraceId: null, sidePanelSpanId: null });
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

      getSpanType: (traceId, spanId) =>
        get()
          .traces.get(traceId)
          ?.spans.find((s) => s.spanId === spanId)?.spanType,
    };
  });

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
