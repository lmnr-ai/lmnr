import { useParams } from "next/navigation";
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
import { toast } from "@/lib/hooks/use-toast";
import { type RealtimeSpan, type SpanType, type TraceRow } from "@/lib/traces/types";

// Trace-metadata key the agent writes its run note to (markdown string).
export const NOTE_METADATA_KEY = "rollout.note";

// Max runs fetched per session (mirrors the previous multi-trace-view cap).
const MAX_RUNS = 200;

// Normalize metadata (object OR JSON string) into TraceRow's Record<string,string>.
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

// Map a streamed RealtimeSpan onto TraceViewSpan. Token/cost come off
// `gen_ai.usage.*` attrs — without this, streamed LLM spans render 0 tokens / $0.
const realtimeToTraceViewSpan = (s: RealtimeSpan): TraceViewSpan => {
  const attrs = (s.attributes ?? {}) as Record<string, unknown>;
  const num = (key: string) => Number(attrs[key]) || 0;
  const inputTokens = num("gen_ai.usage.input_tokens");
  const outputTokens = num("gen_ai.usage.output_tokens");
  const inputCost = num("gen_ai.usage.input_cost");
  const outputCost = num("gen_ai.usage.output_cost");
  const model = (attrs["gen_ai.response.model"] ?? attrs["gen_ai.request.model"]) as string | undefined;

  return {
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
    model,
    pending: false,
    collapsed: false,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cacheReadInputTokens: num("gen_ai.usage.cache_read_input_tokens"),
    reasoningTokens: num("gen_ai.usage.reasoning_tokens"),
    inputCost,
    outputCost,
    totalCost: num("gen_ai.usage.cost") || inputCost + outputCost,
  } as TraceViewSpan;
};

// Dedupe by spanId (newest endTime wins; `incomingWins` breaks ties), preserve
// `collapsed`, sort by startTime, enrich pending.
const mergeSpans = (base: TraceViewSpan[], incoming: TraceViewSpan[], incomingWins = true): TraceViewSpan[] => {
  const byId = new Map<string, TraceViewSpan>();
  for (const s of base) byId.set(s.spanId, s);
  for (const s of incoming) {
    const prev = byId.get(s.spanId);
    if (!prev) {
      byId.set(s.spanId, s);
      continue;
    }
    // Real spans always beat pending placeholders (whose endTime can run ahead).
    if (prev.pending !== s.pending) {
      if (prev.pending) byId.set(s.spanId, { ...s, collapsed: prev.collapsed });
      continue;
    }
    // Per-span recency: an older snapshot (e.g. lagging CH fetch) never wins.
    const prevEnd = new Date(prev.endTime).getTime();
    const incEnd = new Date(s.endTime).getTime();
    const incomingNewer = incEnd > prevEnd || (incEnd === prevEnd && incomingWins);
    if (incomingNewer) byId.set(s.spanId, { ...s, collapsed: prev.collapsed });
  }
  const merged = [...byId.values()].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  return enrichSpansWithPending(merged);
};

// Minimal TraceRow for a trace we only know the id of (live trace_update).
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
  // Per-trace span fetch in flight: dedupes concurrent fetches, drives the
  // skeleton. Expand always refetches, so a failed fetch heals on re-expand.
  traceSpansFetching: Record<string, boolean>;
  sessionName: string;

  // A run was added live → "New trace" pill. Cleared on click / dismiss.
  newTraceNotice: boolean;

  // Prevents the "New trace" pill from flashing on page load.
  isInitialTracesLoaded: boolean;
}

interface DebuggerSessionViewActions {
  // Expand-path fetch: always fetches (deduped while in flight), directly — the
  // base slice's shape-based guard would skip the fetch once any SSE span landed.
  fetchTraceSpans: (trace: TraceRow) => Promise<void>;

  // Fetch the session's runs via the `rollout.session_id` metadata filter.
  fetchSessionTraces: (sessionId: string) => Promise<void>;

  // Realtime: upsert a streamed span.
  applyRealtimeSpan: (span: RealtimeSpan) => void;

  // Batch entry point for a span_update payload.
  applyRealtimeSpans: (spans: RealtimeSpan[]) => void;

  // Realtime: merge a trace_update into the run list (add + auto-expand if new).
  applyTraceUpdate: (t: { traceId: string; metadata?: unknown; hasBrowserSession?: boolean }) => void;

  // Batch entry point for a trace_update payload.
  applyTraceUpdates: (traces: { traceId: string; metadata?: unknown; hasBrowserSession?: boolean }[]) => void;

  // One-shot catch-up for a realtime-added run: real row stats + pre-subscribe
  // spans (trace_update payloads carry neither).
  hydrateTraceRow: (traceId: string) => Promise<void>;

  // Live rename (driven by the `session_update` realtime event).
  setSessionName: (name: string) => void;

  // Hide the "New trace" pill (pill click or its X).
  dismissNewTraceNotice: () => void;

  // Agent-authored note (`rollout.note`) off a run's metadata.
  noteForTrace: (traceId: string) => string | undefined;
  // Span type for a loaded span (drives the span-ref chip icon).
  getSpanType: (traceId: string, spanId: string) => SpanType | undefined;
}

export type DebuggerSessionViewStore = BaseSessionViewStore & DebuggerSessionViewState & DebuggerSessionViewActions;

export const createDebuggerSessionViewStore = (options?: {
  initialTraceRow?: TraceRow;
  initialSessionName?: string;
  projectId?: string;
  storeKey?: string;
}) =>
  createStore<DebuggerSessionViewStore>()(
    persist(
      (set, get) => {
        const baseSlice = createBaseSessionViewSlice<DebuggerSessionViewStore>(set, get, {});

        return {
          ...baseSlice,

          // Seeded at creation (static per page) — no URL-param sync effect.
          projectId: options?.projectId,

          // Seed base `traces` with the single /alpha trace when provided.
          traces: options?.initialTraceRow ? [options.initialTraceRow] : [],

          sessionName: options?.initialSessionName ?? "Session",
          traceSpansFetching: {},
          newTraceNotice: false,
          isInitialTracesLoaded: false,

          fetchTraceSpans: async (trace) => {
            if (get().traceSpansFetching[trace.id]) return;

            set(
              (s) =>
                ({
                  traceSpansFetching: { ...s.traceSpansFetching, [trace.id]: true },
                  traceSpansError: { ...s.traceSpansError, [trace.id]: undefined },
                }) as Partial<DebuggerSessionViewStore>
            );
            try {
              const { projectId } = get();
              if (!projectId) return;
              const spanParams = new URLSearchParams();
              spanParams.set("startDate", new Date(new Date(trace.startTime).getTime() - 1000).toISOString());
              spanParams.set("endDate", new Date(new Date(trace.endTime).getTime() + 1000).toISOString());
              const res = await fetch(`/api/projects/${projectId}/traces/${trace.id}/spans?${spanParams.toString()}`);
              if (!res.ok) throw new Error("Failed to load spans");
              const fetchedSpans = (await res.json()) as TraceViewSpan[];
              // Always write the slot (even empty) — TraceItem's two-phase expand
              // waits for spans/traceSpansError to become defined before opening.
              get().setTraceSpans(trace.id, mergeSpans(get().traceSpans[trace.id] ?? [], fetchedSpans, true));
            } catch {
              // The UI keeps whatever streamed; re-expand retries.
              set(
                (s) =>
                  ({
                    traceSpansError: { ...s.traceSpansError, [trace.id]: "Failed to load spans" },
                  }) as Partial<DebuggerSessionViewStore>
              );
              toast({
                variant: "destructive",
                title: "Failed to load spans",
                description: "Collapse and expand the run to retry.",
              });
            } finally {
              set(
                (s) =>
                  ({
                    traceSpansFetching: { ...s.traceSpansFetching, [trace.id]: false },
                  }) as Partial<DebuggerSessionViewStore>
              );
            }
          },

          fetchSessionTraces: async (sessionId) => {
            const { projectId } = get();
            if (!projectId) return;

            get().setIsTracesLoading(true);
            get().setTracesError(undefined);
            try {
              const params = new URLSearchParams();
              params.set("pageNumber", "0");
              params.set("pageSize", String(MAX_RUNS));
              // DESC so a session with > MAX_RUNS runs keeps the NEWEST window;
              // the display sort below restores oldest-first within it.
              params.set("sortDirection", "DESC");
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
              // /traces returns `metadata` as a raw JSON string; normalize or notes
              // and outline headings never render.
              const normalized = (body.items ?? []).map((item) => ({
                ...item,
                metadata: normalizeMetadata(item.metadata),
              }));
              // API returned newest-first; display order is oldest-first.
              const sorted = normalized.sort(
                (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
              );
              // MERGE, don't replace: a run added live mid-fetch is absent from the
              // CH-lagged response — wholesale replace would wipe it.
              get().setTraces((prev) => {
                const prevById = new Map(prev.map((t) => [t.id, t]));
                const merged = sorted.map((fetched) => {
                  const live = prevById.get(fetched.id);
                  if (!live) return fetched;
                  const liveEndAhead = new Date(live.endTime).getTime() > new Date(fetched.endTime).getTime();
                  return {
                    ...fetched,
                    metadata: { ...fetched.metadata, ...live.metadata },
                    endTime: liveEndAhead ? live.endTime : fetched.endTime,
                  };
                });
                const fetchedIds = new Set(sorted.map((t) => t.id));
                const realtimeOnly = prev.filter((t) => !fetchedIds.has(t.id));
                return [...merged, ...realtimeOnly].sort(
                  (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
                );
              });
            } catch (e) {
              get().setTracesError(e instanceof Error ? e.message : "Failed to load session traces");
            } finally {
              get().setIsTracesLoading(false);
              // Even on error, so a failed initial fetch can't suppress the pill forever.
              set({ isInitialTracesLoaded: true } as Partial<DebuggerSessionViewStore>);
            }
          },

          applyRealtimeSpan: (span) => {
            const traceId = span.traceId;
            const tvSpan = realtimeToTraceViewSpan(span);

            // Unconditional upsert — a span may arrive before its trace_update creates
            // the row; it just sits in the map until the row renders.
            get().setTraceSpans(traceId, mergeSpans(get().traceSpans[traceId] ?? [], [tvSpan]));

            // Bump the row's endTime — but only rebuild `traces` when it actually
            // moves, or every streamed span would bust the derived memos.
            const spanEndMs = new Date(span.endTime).getTime();
            if (Number.isNaN(spanEndMs)) return;
            const targetRow = get().traces.find((t) => t.id === traceId);
            if (!targetRow || spanEndMs <= new Date(targetRow.endTime).getTime()) return;
            get().setTraces((traces) => traces.map((t) => (t.id === traceId ? { ...t, endTime: span.endTime } : t)));
          },

          applyRealtimeSpans: (spans) => {
            for (const span of spans) get().applyRealtimeSpan(span);
          },

          applyTraceUpdate: (t) => {
            if (!t.traceId) return;
            const metadata = normalizeMetadata(t.metadata);
            const existing = get().traces.find((row) => row.id === t.traceId);

            if (!existing) {
              // Unknown run → add a placeholder row; any spans that raced ahead are
              // already in `traceSpans`.
              get().setTraces((traces) => [...traces, minimalTraceRow(t.traceId, metadata)]);
              // Hydrate FIRST: its sync prefix marks fetching, so the auto-expand's
              // fetchTraceSpans dedupes — one fetch per new run.
              void get().hydrateTraceRow(t.traceId);
              get().setTraceExpanded(t.traceId, true);
              // Pill only after the initial fetch settles, so it can't flash on load.
              if (get().isInitialTracesLoaded) set({ newTraceNotice: true } as Partial<DebuggerSessionViewStore>);
              return;
            }

            // Known run → merge metadata (live note updates) + hasBrowserSession.
            const hasMetadata = Object.keys(metadata).length > 0;
            const hasBrowserSession = typeof t.hasBrowserSession === "boolean";
            if (!hasMetadata && !hasBrowserSession) return;
            get().setTraces((traces) =>
              traces.map((row) =>
                row.id === t.traceId
                  ? {
                      ...row,
                      ...(hasMetadata && { metadata: { ...row.metadata, ...metadata } }),
                      ...(hasBrowserSession && { hasBrowserSession: t.hasBrowserSession }),
                    }
                  : row
              )
            );
          },

          applyTraceUpdates: (traces) => {
            for (const t of traces) get().applyTraceUpdate(t);
          },

          hydrateTraceRow: async (traceId) => {
            const { projectId } = get();
            if (!projectId) return;
            if (get().traceSpansFetching[traceId]) return;

            // Mark fetching in the SYNCHRONOUS prefix (before any await) so a streamed
            // span can never flash "No spans found" ahead of the skeleton.
            set(
              (s) =>
                ({
                  traceSpansFetching: { ...s.traceSpansFetching, [traceId]: true },
                }) as Partial<DebuggerSessionViewStore>
            );
            try {
              const params = new URLSearchParams();
              params.set("pageNumber", "0");
              params.set("pageSize", "1");
              params.append("filter", JSON.stringify({ column: "id", operator: "eq", value: traceId }));
              const res = await fetch(`/api/projects/${projectId}/traces?${params.toString()}`);
              if (!res.ok) throw new Error("Failed to load run");
              const body = (await res.json()) as { items: TraceRow[] };
              const fetched = body.items?.[0];
              if (!fetched) return;
              const normalizedMeta = normalizeMetadata(fetched.metadata);

              get().setTraces((traces) =>
                traces.map((row) => {
                  if (row.id !== traceId) return row;
                  // Keep live-merged metadata + a realtime-bumped endTime that's ahead
                  // of the (possibly lagging) fetched snapshot.
                  const liveEndAhead = new Date(row.endTime).getTime() > new Date(fetched.endTime).getTime();
                  return {
                    ...fetched,
                    metadata: { ...normalizedMeta, ...row.metadata },
                    endTime: liveEndAhead ? row.endTime : fetched.endTime,
                  };
                })
              );

              // Recover spans persisted BEFORE we subscribed, now that real trace
              // times are known; merge preserves anything streamed meanwhile.
              const startDate = new Date(new Date(fetched.startTime).getTime() - 1000).toISOString();
              const endDate = new Date(new Date(fetched.endTime).getTime() + 1000).toISOString();
              const spanParams = new URLSearchParams();
              spanParams.set("startDate", startDate);
              spanParams.set("endDate", endDate);
              const spansRes = await fetch(
                `/api/projects/${projectId}/traces/${traceId}/spans?${spanParams.toString()}`
              );
              if (!spansRes.ok) throw new Error("Failed to load spans");
              const fetchedSpans = (await spansRes.json()) as TraceViewSpan[];
              if (fetchedSpans.length > 0) {
                const live = get().traceSpans[traceId] ?? [];
                get().setTraceSpans(traceId, mergeSpans(live, fetchedSpans, true));
              }
            } catch {
              // The UI keeps whatever streamed; re-expand retries.
              toast({
                variant: "destructive",
                title: "Failed to load run data",
                description: "Collapse and expand the run to retry.",
              });
            } finally {
              // Unconditional — the skeleton must always resolve (the old P1).
              set(
                (s) =>
                  ({
                    traceSpansFetching: { ...s.traceSpansFetching, [traceId]: false },
                  }) as Partial<DebuggerSessionViewStore>
              );
            }
          },

          setSessionName: (name) => set({ sessionName: name } as Partial<DebuggerSessionViewStore>),

          dismissNewTraceNotice: () => set({ newTraceNotice: false } as Partial<DebuggerSessionViewStore>),

          noteForTrace: (traceId) => {
            const row = get().traces.find((t) => t.id === traceId);
            const note = row?.metadata?.[NOTE_METADATA_KEY];
            return typeof note === "string" ? note : undefined;
          },

          getSpanType: (traceId, spanId) => get().traceSpans[traceId]?.find((s) => s.spanId === spanId)?.spanType,
        };
      },
      {
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
  initialSessionName?: string;
  storeKey?: string;
}

const DebuggerSessionViewStoreProvider = ({
  children,
  initialTraceRow,
  initialSessionName,
  storeKey,
}: PropsWithChildren<DebuggerSessionViewStoreProviderProps>) => {
  const { projectId } = useParams<{ projectId: string }>();
  const [storeState] = useState(() =>
    createDebuggerSessionViewStore({ initialTraceRow, initialSessionName, projectId, storeKey })
  );

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

export default DebuggerSessionViewStoreProvider;
