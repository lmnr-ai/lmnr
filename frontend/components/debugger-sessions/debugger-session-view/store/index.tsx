import { isNil } from "lodash";
import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore, type StoreApi, useStore } from "zustand";
import { persist } from "zustand/middleware";

import {
  type BaseSessionViewStore,
  createBaseSessionViewSlice,
  SessionViewContext,
} from "@/components/traces/session-view/store/base";
import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils";
import { type RealtimeSpan, type SpanType, type TraceRow } from "@/lib/traces/types";

// Trace-metadata key the coding agent writes its run note to. Naming stays
// `rollout.*` to match `rollout.session_id`. The value is an opaque markdown string.
export const NOTE_METADATA_KEY = "rollout.note";

// Max runs fetched per session (mirrors the previous multi-trace-view cap).
const MAX_RUNS = 200;

// Normalize a trace_update payload's `metadata` (object OR JSON string) into the
// Record<string,string> shape `TraceRow.metadata` carries.
const normalizeMetadata = (metadata: unknown): Record<string, string> => {
  if (!metadata) return {};
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, typeof v === "string" ? v : String(v)]));
    } catch {
      return {};
    }
  }
  if (typeof metadata === "object") {
    return Object.fromEntries(
      Object.entries(metadata as Record<string, unknown>).map(([k, v]) => [k, typeof v === "string" ? v : String(v)])
    );
  }
  return {};
};

// Map a streamed RealtimeSpan onto the TraceViewSpan shape the shared list reads.
// Only `"update"` mode exists now (span_start is dead — see content component).
const realtimeToTraceViewSpan = (s: RealtimeSpan): TraceViewSpan =>
  ({
    spanId: s.spanId,
    parentSpanId: s.parentSpanId,
    traceId: s.traceId,
    name: s.name,
    startTime: s.startTime,
    endTime: s.endTime,
    attributes: s.attributes,
    spanType: s.spanType,
    path: "",
    events: [],
    status: s.status,
    pending: false,
    collapsed: false,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputCost: 0,
    outputCost: 0,
    totalCost: 0,
  }) as TraceViewSpan;

// Build a minimal TraceRow slot for a trace we only know the id (and maybe
// metadata) of — used by /alpha seeding and live trace_update of an unknown run.
const minimalTraceRow = (traceId: string, metadata: Record<string, string> = {}): TraceRow => ({
  id: traceId,
  startTime: new Date().toISOString(),
  endTime: new Date().toISOString(),
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  inputCost: 0,
  outputCost: 0,
  totalCost: 0,
  traceType: "DEFAULT",
  metadata,
  status: "success",
  spanTags: [],
  traceTags: [],
});

interface DebuggerSessionViewState {
  // Run note source-of-truth lives on each TraceRow's metadata; no extra state.
  noteMetadataKey: string;
}

interface DebuggerSessionViewActions {
  // Fetch this session's runs (traces) via the `rollout.session_id` metadata
  // filter, oldest-first, into base `traces`. Reads projectId from base state.
  fetchSessionTraces: (sessionId: string) => Promise<void>;

  // Realtime: upsert a streamed span into its (already-loaded) trace.
  applyRealtimeSpan: (span: RealtimeSpan) => void;

  // Realtime: merge a trace_update into the run list (add + auto-expand if new).
  applyTraceUpdate: (t: { traceId: string; metadata?: unknown; hasBrowserSession?: boolean }) => void;

  // Read the agent-authored note (`rollout.note`) off a run's metadata object.
  noteForTrace: (traceId: string) => string | undefined;
  // Span type for an already-loaded span (drives the span-ref chip icon color).
  getSpanType: (traceId: string, spanId: string) => SpanType | undefined;
}

export type DebuggerSessionViewStore = BaseSessionViewStore & DebuggerSessionViewState & DebuggerSessionViewActions;

const createDebuggerSessionViewStore = (options?: { initialTraceRow?: TraceRow; storeKey?: string }) =>
  createStore<DebuggerSessionViewStore>()(
    persist(
      (set, get) => ({
        ...createBaseSessionViewSlice<DebuggerSessionViewStore>(set, get, {}),

        // Seed base `traces` with the single /alpha trace when provided.
        traces: options?.initialTraceRow ? [options.initialTraceRow] : [],

        noteMetadataKey: NOTE_METADATA_KEY,

        fetchSessionTraces: async (sessionId) => {
          const { projectId } = get();
          if (!projectId) return;

          get().setIsTracesLoading(true);
          get().setTracesError(undefined);
          try {
            const params = new URLSearchParams();
            params.set("pageNumber", "0");
            params.set("pageSize", String(MAX_RUNS));
            params.set("sortDirection", "ASC");
            params.append(
              "filter",
              JSON.stringify({ column: "metadata", operator: "eq", value: `rollout.session_id=${sessionId}` })
            );

            const res = await fetch(`/api/projects/${projectId}/traces?${params.toString()}`);
            if (!res.ok) {
              const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
              get().setTracesError(err.error || "Failed to load session traces");
              return;
            }
            const body = (await res.json()) as { items: TraceRow[] };
            // API already sorts ASC; defensively sort oldest-first for display.
            const sorted = (body.items ?? [])
              .slice()
              .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
            get().setTraces(sorted);
          } catch (e) {
            get().setTracesError(e instanceof Error ? e.message : "Failed to load session traces");
          } finally {
            get().setIsTracesLoading(false);
          }
        },

        applyRealtimeSpan: (span) => {
          const traceId = span.traceId;
          const tvSpan = realtimeToTraceViewSpan(span);

          // Only upsert when the trace's spans are already loaded. Unloaded traces
          // fetch fresh on expand via ensureTraceSpans; streaming into an unloaded
          // trace would race that fetch.
          if (get().traceSpans[traceId]) {
            const existing = get().traceSpans[traceId];
            const idx = existing.findIndex((s) => s.spanId === tvSpan.spanId);
            const merged =
              idx === -1
                ? [...existing, tvSpan]
                : existing.map((s) => (s.spanId === tvSpan.spanId ? { ...tvSpan, collapsed: s.collapsed } : s));
            merged.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
            get().setTraceSpans(traceId, enrichSpansWithPending(merged));
          }

          // Bump the owning trace row's endTime when the span extends past it —
          // the lazy fetch window is `endTime + 1s`, so a stale endTime would
          // truncate the fetch and skew list stats/ordering for a live run.
          const spanEndMs = new Date(span.endTime).getTime();
          get().setTraces((traces) =>
            traces.map((t) => {
              if (t.id !== traceId) return t;
              if (Number.isNaN(spanEndMs) || spanEndMs <= new Date(t.endTime).getTime()) return t;
              return { ...t, endTime: span.endTime };
            })
          );
        },

        applyTraceUpdate: (t) => {
          if (!t.traceId) return;
          const metadata = normalizeMetadata(t.metadata);
          const existing = get().traces.find((row) => row.id === t.traceId);

          if (!existing) {
            // Unknown run → add a lightweight slot (full row hydrates via refetch /
            // realtime spans), append to ordering, and auto-expand so it streams open.
            get().setTraces((traces) => [...traces, minimalTraceRow(t.traceId, metadata)]);
            get().setTraceExpanded(t.traceId, true);
            return;
          }

          // Known run → merge metadata (this is what makes live note updates work:
          // `rollout.note` arrives here after a POST /v1/traces/metadata patch).
          if (Object.keys(metadata).length === 0) return;
          get().setTraces((traces) =>
            traces.map((row) => (row.id === t.traceId ? { ...row, metadata: { ...row.metadata, ...metadata } } : row))
          );
        },

        noteForTrace: (traceId) => {
          const row = get().traces.find((t) => t.id === traceId);
          const note = row?.metadata?.[NOTE_METADATA_KEY];
          return typeof note === "string" ? note : undefined;
        },

        getSpanType: (traceId, spanId) => get().traceSpans[traceId]?.find((s) => s.spanId === spanId)?.spanType,
      }),
      {
        // Distinct from `session-view-state` AND the parked `debugger-session-state`.
        name: options?.storeKey ?? "debugger-session-view-state",
        partialize: (state) => ({
          sessionPanelWidth: state.sessionPanelWidth,
          spanPanelWidth: state.spanPanelWidth,
        }),
        merge: (persistedState, currentState) => {
          const persisted = (persistedState ?? {}) as Record<string, unknown>;
          return {
            ...currentState,
            ...(typeof persisted.sessionPanelWidth === "number" && { sessionPanelWidth: persisted.sessionPanelWidth }),
            ...(typeof persisted.spanPanelWidth === "number" && { spanPanelWidth: persisted.spanPanelWidth }),
          };
        },
      }
    )
  );

// Debugger-only context (the base context is provided in parallel for shared children).
export const DebuggerSessionViewContext = createContext<StoreApi<DebuggerSessionViewStore> | undefined>(undefined);

interface DebuggerSessionViewStoreProviderProps {
  initialTraceRow?: TraceRow;
  storeKey?: string;
}

const DebuggerSessionViewStoreProvider = ({
  children,
  initialTraceRow,
  storeKey,
}: PropsWithChildren<DebuggerSessionViewStoreProviderProps>) => {
  const [storeState] = useState(() => createDebuggerSessionViewStore({ initialTraceRow, storeKey }));

  // Provide both the base context (shared session-view children) and the
  // debugger context (debugger chrome + the optional hook).
  return (
    <SessionViewContext.Provider value={storeState}>
      <DebuggerSessionViewContext.Provider value={storeState}>{children}</DebuggerSessionViewContext.Provider>
    </SessionViewContext.Provider>
  );
};

export const useDebuggerSessionViewStore = <T,>(selector: (store: DebuggerSessionViewStore) => T): T => {
  const store = useContext(DebuggerSessionViewContext);
  if (!store) {
    throw new Error("useDebuggerSessionViewStore must be used within a DebuggerSessionViewContext provider");
  }
  return useStore(store, selector);
};

export const useDebuggerSessionViewStoreRaw = () => {
  const store = useContext(DebuggerSessionViewContext);
  if (!store) {
    throw new Error("useDebuggerSessionViewStoreRaw must be used within a DebuggerSessionViewContext provider");
  }
  return store;
};

const NOOP_DEBUGGER_SESSION_STORE = createStore(() => ({})) as unknown as StoreApi<DebuggerSessionViewStore>;

/**
 * Optional debugger-session-store hook for shared session-view children: returns
 * `{ enabled:false }` under the regular session provider (no DebuggerSessionViewContext).
 * Selectors MUST tolerate the empty NOOP state — read defensively or guard on `enabled`.
 */
export const useOptionalDebuggerSessionStore = <T,>(
  selector: (state: DebuggerSessionViewStore) => T
): { enabled: boolean; state: T } => {
  const store = useContext(DebuggerSessionViewContext);
  const state = useStore(store ?? NOOP_DEBUGGER_SESSION_STORE, selector);
  return { enabled: !isNil(store), state };
};

export default DebuggerSessionViewStoreProvider;
